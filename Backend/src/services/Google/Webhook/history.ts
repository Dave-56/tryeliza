// /src/services/Google/Webhook/history.ts
import { GoogleClient } from '../GoogleClient'; 
import { EmailUtils } from '../emailUtils';
import { HistoryChange, HistoryChangeType, EmailThread } from '../../../Types/model';
import { emailAccountRepository } from '../../../repositories';
import { db } from '../../../db';
import { and, eq } from 'drizzle-orm';
import { processedEmails } from '../../../db/schema';

export class HistoryActions extends GoogleClient {
    private emailUtils: EmailUtils;

    constructor(accessToken: string, refreshToken: string, emailAccountId?: string) {
        super(accessToken, refreshToken, emailAccountId);
        this.emailUtils = new EmailUtils(accessToken, refreshToken, emailAccountId);
    }
    /**
     * Gets history changes since a specific history ID
     */
    private async getHistoryChanges(startHistoryId: string): Promise<{
        changes: HistoryChange[];
        newHistoryId?: string;
        needsFullSync?: boolean;
    }> {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            // We don't need to set credentials again since ensureValidToken already handles this
            // and the oauth2Client is already configured with the proper credentials
        

            const response = await this.gmail.users.history.list({
                userId: 'me',
                startHistoryId: startHistoryId,
                historyTypes: ['messageAdded'],
                labelId: 'INBOX'  // Only get INBOX changes
            });

            if (!response.data.history) {
                return { changes: [] };
            }

            const changes: HistoryChange[] = [];

            // Get user ID from email account ID if available
            let userId: string | null = null;
            if (this.emailAccountId) {
                try {
                    const account = await emailAccountRepository.findById(parseInt(this.emailAccountId));
                    if (account) {
                        userId = account.user_id;
                    }
                } catch (error) {
                    console.error('Error fetching user ID for email account:', error);
                }
            }

            // Process each history record
            for (const record of response.data.history) {
                if (record.messagesAdded) {
                    for (const messageAdded of record.messagesAdded) {
                        if (!messageAdded.message?.id) continue;

                        // Skip this message if we already processed it
                        if (userId) {
                            try {
                                const processedEmail = await db.query.processedEmails.findFirst({
                                    where: and(
                                        eq(processedEmails.email_id, messageAdded.message.id),
                                        eq(processedEmails.user_id, userId)
                                    )
                                });
                                
                                if (processedEmail) {
                                    console.log(`Skipping already processed message ${messageAdded.message.id}`);
                                    continue;
                                }
                            } catch (error) {
                                console.error(`Error checking if message ${messageAdded.message.id} is processed:`, error);
                                // Continue with the message if we can't determine if it's processed
                            }
                        }

                        // Verify message exists and is accessible
                        try {
                            await this.gmail.users.messages.get({
                                userId: 'me',
                                id: messageAdded.message.id,
                                format: 'minimal'  // Quick check if message exists
                            });
                            
                            changes.push({
                                type: HistoryChangeType.MESSAGE_ADDED,
                                messageId: messageAdded.message.id,
                                threadId: messageAdded.message.threadId!,
                            });
                        } catch (error) {
                            console.warn(`Skipping inaccessible message ${messageAdded.message.id}`);
                            continue;
                        }
                    }
                }
            }

            return {
                changes,
                newHistoryId: response.data.historyId!
            };

        } catch (error: any) {
            if (error.code === 404) {
                // History ID is too old, need to get a new one
                console.warn('History ID too old, getting new one');
                const profile = await this.gmail.users.getProfile({
                    userId: 'me'
                });
                return {
                    changes: [],
                    newHistoryId: profile.data.historyId!,
                    needsFullSync: true
                };
            }
            throw error;
        }
    }

    public async getLatestHistoryId(): Promise<string> {
        const profile = await this.gmail.users.getProfile({
            userId: 'me'
        });
        return profile.data.historyId!;
    }

    /**
     * Gets new emails using history ID
     */
    public async getNewEmailsWithHistoryId( startHistoryId: string): Promise<EmailThread[]> {
       
       try {

            // Ensure token is valid before making API calls
            await this.ensureValidToken();

            // Get history changes
            var historyChanges = await this.getHistoryChanges(startHistoryId);
            
            // If no changes or needs full sync, return early
            if (historyChanges.changes.length === 0 || historyChanges.needsFullSync) {
                console.log('No new changes or full sync needed');
                return [];
            }

            const emails: EmailThread[] = [];
            const processedThreadIds = new Set<string>(); // Track processed thread IDs
            
            for (const change of historyChanges.changes) {
                if (change.type === HistoryChangeType.MESSAGE_ADDED && change.threadId) {
                    // Skip if we've already processed this thread in this batch
                    if (processedThreadIds.has(change.threadId)) {
                        continue;
                    }
                    
                    const emailDetails = await this.emailUtils.getEmailDetails(change.threadId);
                    emails.push(emailDetails);
                    processedThreadIds.add(change.threadId);
                }
            } 
            return emails;
        } catch (error) {
            console.error('Error getting new emails with history ID:', error);
            throw error;
        }
    }
}