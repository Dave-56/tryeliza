// /src/services/Google/Webhook/process.ts
import { GoogleClient } from '../GoogleClient';
import {ENV} from '../../../config/environment';
import { EmailData, EmailThread, EmailCategorization } from '../../../Types/model';
import { UUID } from 'crypto';
import { emailAccountRepository } from '../../../repositories';
import { EmailProcessingService } from '../../Email/EmailProcessingService';
import { EmailCategorizationService } from '../../Email/EmailCategorizationService';
import { EmailTaskService } from '../../Email/EmailTaskService';
import { EmailRecordService } from '../../Email/EmailRecordService';
import { AgentService } from '../../Agent/AgentService';
import { DEFAULT_TOKEN_LIMIT } from '../../../utils/tokenUtils.js';
import { db } from '../../../db';
import { GoogleService } from '../../../services/Google/GoogleService';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { processedEmails, emails } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { EmailSummaryService } from '../../Summary/EmailSummaryService';

export class WebhookProcessor {
    /**
     * Decodes a PubSub message from Gmail push notification
     * @param data Base64-encoded message data
     * @returns Decoded message with emailAddress and historyId
     */

    // Create required services as static properties
    private static agentService = new AgentService();
    private static taskService = new EmailTaskService(db);
    private static recordService = new EmailRecordService(db);
    private static emailProcessingService = new EmailProcessingService(DEFAULT_TOKEN_LIMIT);
    
    // Create EmailCategorizationService with required dependencies
    private static emailCategorizationService = new EmailCategorizationService(
        WebhookProcessor.agentService,
        WebhookProcessor.taskService,
        WebhookProcessor.recordService
    );

    // Create EmailSummaryService with required dependencies
    private static emailSummaryService = new EmailSummaryService(
        WebhookProcessor.agentService
    );
    
    public static decodePubSubMessage(data: string): EmailData {
        try {
            // Decode base64
            const decodedString = Buffer.from(data, 'base64').toString('utf-8');
            const parsedData = JSON.parse(decodedString);
            
            return {
                emailAddress: parsedData.emailAddress,
                historyId: parsedData.historyId,
                timestamp: new Date().toISOString(),
                emailAccountId: '', // Will be filled in by the webhook handler
                refresh_token: ''   // Will be filled in by the webhook handler
            };
        } catch (error) {
            console.error('Error decoding PubSub message:', error);
            throw new Error('Invalid PubSub message format');
        }
    }

    public static async verifyPushNotification(authHeader: string | undefined): Promise<boolean> {
        if (!authHeader) return false;

        try {
            // Extract token from Bearer header
            const [, token] = authHeader.match(/Bearer (.*)/) || [];
            if (!token) return false;

            const authClient = new OAuth2Client();
            const ticket = await authClient.verifyIdToken({
                idToken: token,
            });

            const claim = ticket.getPayload();
            if (!claim) return false;

            // Enhanced validation
            // 1. Check issuer is Google
            const isValidIssuer: boolean = Boolean(claim.iss && 
            (claim.iss.includes('accounts.google.com') || 
             claim.iss.includes('https://accounts.google.com')));

            // 2. Check audience is Google App ID
            const currentTime = Math.floor(Date.now() / 1000);
            const isNotExpired: boolean = Boolean(claim.exp && claim.exp > currentTime);
            
            // 3. Check email is verified
            const isVerifiedEmail: boolean = Boolean(claim.email_verified);
            
            // Log validation details in development
            if (ENV.NODE_ENV === 'development') {
                console.log('Token validation details:', {
                    issuer: claim.iss,
                    audience: claim.aud,
                    expiration: new Date(claim.exp * 1000).toISOString(),
                    currentTime: new Date(currentTime * 1000).toISOString(),
                    isValidIssuer,
                    isNotExpired,
                    isVerifiedEmail
                });
            }
            return isValidIssuer && isNotExpired && isVerifiedEmail;
        } catch (error) {
            console.error('Push notification verification failed:', error);
            return false;
        }
    }

    /**
     * Process a webhook notification by fetching the changes since the stored historyId
     * @param userId User ID
     * @param emailAddress Email address of the account
     * @param newHistoryId New history ID from the notification
     */
    public static async processWebhookEvent(userId: string, emailAddress: string, newHistoryId: string) {
        try {
            // Get the account from your database using the findByUserAndEmail method
            const account = await emailAccountRepository.findByUserAndEmail(userId as UUID, emailAddress);
            if (!account || !account.is_connected || !account.tokens) {
                console.log('Account not found, not connected, or missing tokens');
                return;
            }

            // Skip processing if the historyId hasn't changed
            if (account.history_id === newHistoryId) {
                console.log(`Skipping webhook processing - historyId ${newHistoryId} hasn't changed for ${emailAddress}`);
                return;
            }

            // Check if refresh token exists before proceeding
            if (!account.tokens.refresh_token) {
                console.error(`No refresh token found for ${emailAddress}. Cannot process webhook.`);
                // Mark account as disconnected
                await emailAccountRepository.markAsDisconnected(account.id);
                throw new Error(`Authentication failed for ${emailAddress}: No refresh token available`);
            }

            const googleService = new GoogleService(
                account.tokens.access_token,
                account.tokens.refresh_token,
                account.id.toString()
            );

            // Ensure token is valid before proceeding
            try {
                await googleService.ensureValidToken();
            } catch (tokenError) {
                console.error(`Token refresh failed for ${emailAddress}:`, tokenError);
                // Mark account as disconnected if token refresh fails
                await emailAccountRepository.markAsDisconnected(account.id);
                throw new Error(`Authentication failed for ${emailAddress}: Unable to refresh token`);
            }

            // Use the stored historyId to get new emails since last sync
            const incomingEmails = await googleService.getNewEmailsWithHistoryId(
                account.history_id || ''  // Using history_id from the schema with fallback
            );

            // Before starting the transaction, check if any emails are already processed
            const newIncomingEmails: EmailThread[] = [];
            for (const email of incomingEmails) {
                const messageId = email.messages[0].id;
                const threadId = email.id; // Thread ID
                
                // Find the latest message in the thread
                let latestMessageId = messageId;
                if (email.messages.length > 1) {
                    // Find message with the most recent date
                    const latestMessage = email.messages.reduce((latest, current) => {
                        if (!latest.headers?.date) return current;
                        if (!current.headers?.date) return latest;
                        return new Date(current.headers.date) > new Date(latest.headers.date) ? current : latest;
                    }, email.messages[0]);
                    latestMessageId = latestMessage.id;
                }
                
                // Check if this thread has been processed with this latest message
                const alreadyProcessed = await db.query.processedEmails.findFirst({
                    where: and(
                        eq(processedEmails.thread_id, threadId),
                        eq(processedEmails.email_id, latestMessageId),
                        eq(processedEmails.user_id, account.user_id)
                    )
                });
                
                if (!alreadyProcessed) {
                    console.log(`Thread ${threadId} with latest message ${latestMessageId} needs processing`);
                    newIncomingEmails.push(email);
                } else {
                    console.log(`Skipping already processed thread ${threadId} with latest message ${latestMessageId}`);
                }
            }

            // Process the new emails
            if(newIncomingEmails.length > 0) {
                

                // Use a database transaction to ensure atomicity
                const emailCategorizations = await db.transaction(async (tx) => {
                    const categorizations: (EmailCategorization | null)[] = [];
                    
                    // Process emails sequentially within the transaction
                    for (const email of newIncomingEmails) {
                        try {
                            // Use the EmailCategorizationService directly to categorize the email
                            // Pass the current transaction to avoid nested transactions
                            const categorization = await WebhookProcessor.emailCategorizationService.categorizeEmail(account, email);

                            // Use the Email Summarization service to summarize the email
                            const summary = await WebhookProcessor.emailSummaryService.generateSummary(account, email);
                            
                            // Add the result to our categorizations array
                            categorizations.push(categorization);
                        } catch (error) {
                            console.error(`Error categorizing email ${email.messages[0].id}:`, error);
                            // Continue processing other emails even if one fails
                            categorizations.push(null);
                        }
                    }
                    
                    // Mark emails as processed within the same transaction
                    // try {
                    //     await WebhookProcessor.markEmailsAsProcessedWithTx(tx, newIncomingEmails, account.user_id);
                    // } catch (markError) {
                    //     console.error('Error marking emails as processed:', markError);
                    //     // Continue execution so we can still update the historyId later
                    // }
                    
                    return categorizations;
                });

                console.log(`Processed ${incomingEmails.length} email threads for ${emailAddress}`);
            }
            else {
                console.log(`No new emails to process for ${emailAddress}`);
            }
            
            // Update the historyId in the database for next sync
            await emailAccountRepository.update(account.id, {
                history_id: newHistoryId  // Using history_id from the schema
            });
            
            return incomingEmails;
        } catch (error) {
            console.error('Error processing webhook event:', error);
            throw error;
        }
    }

    /**
     * Mark emails as processed within a transaction
     */
    public static async markEmailsAsProcessedWithTx(tx: any, emailThreads: EmailThread[], userId: string) {
        for (const thread of emailThreads) {
            for (const message of thread.messages || []) {
                try {
                    // Check if a processed email record already exists
                    const existingRecord = await tx.query.processedEmails.findFirst({
                        where: and(
                            eq(processedEmails.email_id, message.id),
                            eq(processedEmails.user_id, userId)
                        )
                    });
                    
                    if (existingRecord) {
                        // Update existing record
                        await tx
                            .update(processedEmails)
                            .set({
                                included_in_summary: false,
                                updated_at: new Date()
                            })
                            .where(eq(processedEmails.id, existingRecord.id));
                    } else {
                        // Get the email record to find the account_id
                        const emailRecord = await tx.query.emails.findFirst({
                            where: eq(emails.gmail_id, message.id)
                        });
                        
                        if (!emailRecord) {
                            console.warn(`Email record not found for message ID ${message.id}`);
                            continue;
                        }
                        
                        // Insert new record using onConflictDoNothing to handle race conditions
                        await tx
                            .insert(processedEmails)
                            .values({
                                email_id: message.id,
                                user_id: userId,
                                account_id: emailRecord.account_id,
                                thread_id: thread.id,
                                processing_type: 'webhook',
                                processing_status: 'completed',
                                included_in_summary: false,
                                processed_at: new Date()
                            })
                            .onConflictDoNothing({
                                target: [processedEmails.email_id, processedEmails.user_id]
                            });
                    }
                } catch (error) {
                    console.error(`Error marking email ${message.id} as processed:`, error);
                }
            }
        }
    }
}