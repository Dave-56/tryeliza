// Set up webhook endpoint in your API
import { db } from '../../db/index';
import { eq } from 'drizzle-orm';
import { webhookNotifications } from '../../db/schema'; // Import db and webhookNotifications
import express, { Request, Response } from 'express';
import { webhookLimiter } from '../middleware/rate-limiter';
import { emailAccountRepository } from '../../repositories';
import { WebhookProcessor } from '../../services/Google/Webhook/process';
import CircuitBreaker from 'opossum';


const router: express.Router = express.Router();

interface WebhookGmailRequest {
    message: {
        data: string;
        publishTime: string;
        messageId: string;
    };
}

// Track webhook metrics
const webhookMetrics = {
    totalReceived: 0,
    successfullyProcessed: 0,
    failedProcessing: 0,
    duplicates: 0,
    processingTime: [] as number[] // Explicitly type as number array
};

// Allowed domains for PubSub notifications
const ALLOWED_PUBSUB_DOMAINS = [
    'pubsub.googleapis.com',
    'gmail.googleapis.com',
    'ngrok-free.app', // Allow ngrok domains for development
    'localhost'       // Allow localhost for local testing
];

// Configure circuit breaker for Gmail API calls
const processWebhookEventWithBreaker = new CircuitBreaker(
    WebhookProcessor.processWebhookEvent, 
    {
        timeout: 30000, // 30 seconds
        errorThresholdPercentage: 50,
        resetTimeout: 30000, // 30 seconds
        name: 'webhook-processor'
    }
);

router.post('/gmail/notifications', webhookLimiter, async (req: Request<{}, {}, WebhookGmailRequest>, res: Response) => {
    try {
        // Track metrics
        webhookMetrics.totalReceived++;
        const startTime = Date.now();
        
        console.log(" 🔔 WEBHOOK: Received request to /gmail/notifications");
        console.log(" 🔔 WEBHOOK: Request headers:", JSON.stringify(req.headers, null, 2));
        console.log(" 🔔 WEBHOOK: Request body:", JSON.stringify(req.body, null, 2));

        // For Google Pub/Sub notifications, we'll skip the authentication check
        // since Pub/Sub doesn't forward the Authorization header
        let isAuthentic = false;
        
        // Check if this is a Google Pub/Sub notification
        const isPubSubNotification = req.body.message && 
                                    req.body.subscription && 
                                    req.body.subscription.includes('projects/eliza-replit/subscriptions/');

        if (isPubSubNotification) {
            // Validate the domain for PubSub notifications
            const pubsubDomain = req.get('x-forwarded-host') || req.hostname;
            const isAllowedDomain = ALLOWED_PUBSUB_DOMAINS.some(domain => 
                pubsubDomain.includes(domain)
            );

            if (!isAllowedDomain) {
                console.warn(" 🔔 WEBHOOK: Suspicious domain for Pub/Sub notification:", pubsubDomain);
                return res.status(403).json({ error: 'Forbidden' });
            }

            console.log(" 🔔 WEBHOOK: Detected Google Pub/Sub notification, bypassing authentication check");
            isAuthentic = true;
        } else {
            // For direct API calls, still verify the Authorization header
            isAuthentic = await WebhookProcessor.verifyPushNotification(req.header('Authorization'));
            console.log(" 🔔 WEBHOOK: Authentication result:", isAuthentic);
        }                       
        
        if (!isAuthentic) {
            console.error(' 🔔 WEBHOOK: Authentication failed', { 
                path: '/gmail',
                auth: req.header('Authorization')?.substring(0, 20) + '...' 
            });
            console.log("Unauthorized request");
            webhookMetrics.failedProcessing++;
            return res.status(401).json({ error: 'Unauthorized request' });
        }

        // Parse and validate the message
        const message = req.body.message;
        if (!message?.data) {
            console.log("Invalid notification format");
            webhookMetrics.failedProcessing++;
            return res.status(400).json({ error: 'Invalid notification format' });
        }

        // Check if this notification has already been processed - do this check outside the transaction
        // to quickly return for duplicate notifications without starting a transaction
        const existingNotification = await db.query.webhookNotifications.findFirst({
            where: eq(webhookNotifications.notification_id, message.messageId)
        });

        if (existingNotification) {
            console.log(`🔔 WEBHOOK: Duplicate notification ${message.messageId} detected, already processed with status: ${existingNotification.status}`);
            // Return success even for duplicate notifications to prevent retries
            webhookMetrics.duplicates++;
            return res.status(200).json({ 
                status: 'success', 
                message: 'Notification already processed',
                notificationStatus: existingNotification.status
            });
        }

        // Decode the message
        const parsedData = WebhookProcessor.decodePubSubMessage(message.data);

        // Find the email account by email address
        const emailAccount = await emailAccountRepository.findByEmailAddress(parsedData.emailAddress);

        if (!emailAccount) {
            console.error('WebhookEmailAccountNotFound', { emailAddress: parsedData.emailAddress });
            webhookMetrics.failedProcessing++;
            return res.status(404).json({ error: 'Email account not found' });
        }

        if (!emailAccount.is_connected) {
            console.error('WebhookDisconnectedAccount', { emailAccountId: emailAccount.id });
            webhookMetrics.failedProcessing++;
            return res.status(400).json({ error: 'Email account is not connected' });
        }

        // Process the webhook event directly
        try {
            // Use a transaction with proper error handling to ensure atomicity
            await db.transaction(async (tx) => {
                try {
                    // Use INSERT with onConflictDoNothing to handle race conditions
                    // This ensures only one notification record is created even if multiple requests arrive simultaneously
                    const insertResult = await tx
                        .insert(webhookNotifications)
                        .values({
                            notification_id: message.messageId,
                            user_id: emailAccount.user_id,
                            account_id: emailAccount.id,
                            email_address: parsedData.emailAddress,
                            history_id: parsedData.historyId,
                            processed_at: new Date(),
                            status: 'processing'
                        })
                        .onConflictDoNothing({
                            target: webhookNotifications.notification_id
                        })
                        .returning();
                    
                    // If no rows were inserted, it means this notification was already processed by another request
                    if (!insertResult || insertResult.length === 0) {
                        console.log(` WEBHOOK: Notification ${message.messageId} was already being processed by another request`);
                        return; // Exit the transaction early
                    }
                    
                    // Now process the webhook event with circuit breaker
                    await processWebhookEventWithBreaker.fire(
                        emailAccount.user_id,
                        emailAccount.email_address,
                        parsedData.historyId
                    );
                    
                    // Update notification status to completed
                    await tx.update(webhookNotifications)
                        .set({ 
                            status: 'completed',
                            updated_at: new Date()
                        })
                        .where(eq(webhookNotifications.notification_id, message.messageId));
                    
                    console.log(` 🔔 WEBHOOK: Successfully processed notification ${message.messageId}`);
                } catch (txError) {
                    // If any error occurs during processing, update the notification status to failed
                    // Only update if we successfully inserted a record earlier
                    const notificationExists = await tx.query.webhookNotifications.findFirst({
                        where: eq(webhookNotifications.notification_id, message.messageId)
                    });
                    
                    if (notificationExists) {
                        await tx.update(webhookNotifications)
                            .set({ 
                                status: 'failed',
                                error_message: txError.message || 'Unknown error',
                                updated_at: new Date()
                            })
                            .where(eq(webhookNotifications.notification_id, message.messageId));
                    }
                    
                    // Re-throw the error to be caught by the outer catch block
                    throw txError;
                }
            });
            
            // Update metrics for successful processing
            webhookMetrics.successfullyProcessed++;
            webhookMetrics.processingTime.push(Date.now() - startTime);
            
            console.log("Webhook processed successfully");
            return res.status(200).json({ status: 'success' });
        } catch (processingError) {
            console.error('Error processing webhook:', processingError);
            webhookMetrics.failedProcessing++;
            
            // If the transaction failed, we still want to ensure the notification is marked as failed
            // This is a fallback in case the transaction itself failed before it could update the status
            try {
                const failedNotification = await db.query.webhookNotifications.findFirst({
                    where: eq(webhookNotifications.notification_id, message.messageId)
                });
                
                if (failedNotification) {
                    // Only update if the status isn't already set to failed
                    if (failedNotification.status !== 'failed') {
                        await db.update(webhookNotifications)
                            .set({ 
                                status: 'failed',
                                error_message: processingError.message || 'Unknown error',
                                updated_at: new Date()
                            })
                            .where(eq(webhookNotifications.notification_id, message.messageId));
                    }
                } else {
                    // In the rare case that the notification record doesn't exist yet
                    await db.insert(webhookNotifications)
                        .values({
                            notification_id: message.messageId,
                            user_id: emailAccount.user_id,
                            account_id: emailAccount.id,
                            email_address: parsedData.emailAddress,
                            history_id: parsedData.historyId,
                            processed_at: new Date(),
                            status: 'failed',
                            error_message: processingError.message || 'Unknown error'
                        })
                        .onConflictDoNothing({
                            target: webhookNotifications.notification_id
                        });
                }
            } catch (updateError) {
                console.error('Failed to update notification status:', updateError);
            }
            
            return res.status(500).json({ error: 'Error processing webhook' });
        }
    } catch (error) {
        console.error('Error in webhook endpoint:', error);
        webhookMetrics.failedProcessing++;
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a route to manually trigger webhook renewal for testing
router.post('/gmail/renew-watch', async (req: Request, res: Response) => {
    try {
        console.log(" Manually triggering webhook renewal");
        const { setupWatchRenewal } = await import('../../utils/webhookHelper.js');
        await setupWatchRenewal();
        res.status(200).json({ message: "Webhook renewal triggered successfully" });
    } catch (error) {
        console.error("Error triggering webhook renewal:", error);
        res.status(500).json({ error: "Failed to trigger webhook renewal" });
    }
});

// Add a metrics endpoint
router.get('/metrics', (req, res) => {
    const avgProcessingTime = webhookMetrics.processingTime.length > 0 
        ? webhookMetrics.processingTime.reduce((a, b) => a + b, 0) / webhookMetrics.processingTime.length 
        : 0;
        
    res.json({
        totalReceived: webhookMetrics.totalReceived,
        successfullyProcessed: webhookMetrics.successfullyProcessed,
        failedProcessing: webhookMetrics.failedProcessing,
        duplicates: webhookMetrics.duplicates,
        avgProcessingTime: avgProcessingTime.toFixed(2) + 'ms',
        uptime: process.uptime() + 's'
    });
});

// Add a simple health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

export default router;