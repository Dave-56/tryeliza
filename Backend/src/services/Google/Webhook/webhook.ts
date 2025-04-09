// /src/services/Google/Actions/webhook.ts
import { GoogleClient } from '../GoogleClient';
import { emailAccountRepository } from '../../../repositories';

export class WebhookActions extends GoogleClient {
    /**
     * Initializes a webhook for Gmail push notifications
     */
    public async initializeWebhook() {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            // Stop all watches before initializing
            await this.stopAllWatches();
            
            // Get initial historyId
            const profile = await this.gmail.users.getProfile({
                userId: 'me'
            });

            const initialHistoryId = profile.data.historyId;
            console.log('Initial History ID:', initialHistoryId);

            console.log("🔁 Setting up Gmail watch...");
            console.log("🔁 Label IDs: 'INBOX'");
            console.log("🔁 Topic Name: ", `projects/${process.env.GOOGLE_PROJECT_ID}/topics/${process.env.GOOGLE_PUBSUB_TOPIC}`);
            // Set up watch
            const response = await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    labelIds: ['INBOX'],
                    topicName: `projects/${process.env.GOOGLE_PROJECT_ID}/topics/${process.env.GOOGLE_PUBSUB_TOPIC}`,
                    labelFilterAction: 'include'
                }
            });

            return {
                historyId: response.data.historyId,
                expiration: response.data.expiration
            };
        } catch (error) {
            console.error('Error in initializeWebhook:', error);
            throw error;
        }
    }

    /**
     * Renews the Gmail push notification subscription for a specific email address
     * @param emailAddress The email address to renew the watch for
     * @returns Object containing the historyId and expiration time
     */
    public async renewWatchSubscription(emailAddress: string) {
        try {
            console.log(`Renewing watch subscription for ${emailAddress}`);
            
            // Stop all watches before renewing
            await this.stopAllWatches();
            
            // Set up watch again
            const response = await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    labelIds: ['INBOX'],
                    topicName: `projects/${process.env.GOOGLE_PROJECT_ID}/topics/${process.env.GOOGLE_PUBSUB_TOPIC}`,
                    labelFilterAction: 'include'
                }
            });
            
            console.log(`Watch renewed for ${emailAddress} until ${new Date(Number(response.data.expiration)).toISOString()}`);
            
            return {
                historyId: response.data.historyId,
                expiration: response.data.expiration
            };
        } catch (error) {
            console.error(`Error renewing watch for ${emailAddress}:`, error);
            // Check for authentication errors
            if (error instanceof Error) {
                if (error.message.includes('Authentication failed') || 
                    error.message.includes('invalid_grant') || 
                    error.message.includes('No refresh token')) {
                    
                    // If we have an account ID, mark it as disconnected
                    if (this.emailAccountId) {
                        await emailAccountRepository.markAsDisconnected(parseInt(this.emailAccountId));
                        console.error(`Account ${this.emailAccountId} (${emailAddress}) marked as disconnected due to authentication failure`);
                    }
                }
            }
            
            throw error;
        }
    }

    /**
     * Stops all active Gmail watch subscriptions
     * This should be called before setting up new watches to avoid the
     * "Only one user push notification client allowed per developer" error
     */
    public async stopAllWatches() {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            console.log("Stopping all Gmail watches...");
            await this.gmail.users.stop({ userId: "me" });
            console.log("✅ Stopped all Gmail watches successfully");
            
            // Add a small delay to ensure Google's systems register the stop
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return true;
        } catch (error) {
            // If the error is that there's no watch to stop, that's actually fine
            if (error instanceof Error && 
                (error.message.includes('No push notification exists') || 
                 error.message.includes('Push notification not found'))) {
                console.log("No active Gmail watch to stop");
                return true;
            }
            
            console.error('Error stopping Gmail watches:', error);
            throw error;
        }
    }

    /**
     * Removes the webhook subscription
     */
    public async removeWebhook() {
        await this.gmail.users.stop({
            userId: 'me',
        });
        console.log('Webhook removed');
    }
}