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
            
            // Get initial historyId
            const profile = await this.gmail.users.getProfile({
                userId: 'me'
            });

            const initialHistoryId = profile.data.historyId;
            console.log('Initial History ID:', initialHistoryId);

            // Stop previous watch to avoid duplicate push notifications
            await this.gmail.users.stop({ userId: "me" });
            console.log("✅ Stopped previous Gmail watch.");

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
            
            // Stop previous watch to avoid duplicate push notifications
            await this.gmail.users.stop({ userId: "me" });
            
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
     * Removes the webhook subscription
     */
    public async removeWebhook() {
        await this.gmail.users.stop({
            userId: 'me',
        });
        console.log('Webhook removed');
    }
}