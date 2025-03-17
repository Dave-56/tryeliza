import { processedEmails, InsertProcessedEmail, emails, EmailAccount } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { EmailThread, EmailMessage } from '../../Types/model';

import { extractEmailInfoFromMessage, cleanEmailText } from '../../utils/utils';


// Responsible for handling email records and processed email records
export class EmailRecordService {
    constructor(private db: any) {}
    
    /**
     * Get messages from the thread that haven't been processed yet
     */
    public async getMessagesToProcess(tx: any, emailThread: EmailThread, userId: string) {
        const processedEmailsResults = await Promise.all(
            emailThread.messages.map(async (message) => {
                const exists = await tx.query.processedEmails.findFirst({
                    where: and(
                        eq(processedEmails.email_id, message.id),
                        eq(processedEmails.user_id, userId)
                    )
                });
                return exists ? null : message;
            })
        );

        return processedEmailsResults.filter((msg): msg is NonNullable<typeof msg> => msg !== null);
    }
    
    /**
     * Process each message by creating email records and processed email records
     */
    public async processMessages(tx: any, messagesToProcess: any[], emailAccount: EmailAccount, emailThread: EmailThread) {
        console.log(`Processing ${messagesToProcess.length} messages for thread ${emailThread.id}`);
        
        for (const message of messagesToProcess) {
            console.log(`Starting to process message ${message.id} for user ${emailAccount.user_id}`);
            try {
                //console.log(`Creating email record for message ${message.id}`);
                await this.createEmailRecord(tx, message, emailAccount, emailThread);
                
                //console.log(`Creating processed email record for message ${message.id}`);
                await this.createProcessedEmailRecord(tx, message, emailAccount, emailThread);
                
                //console.log(`Successfully processed message ${message.id}`);
            } catch (error) {
                console.warn(`Failed to process email ${message.id}:`, error);
                // Don't throw here, try to continue with other messages
                continue;
            }
        }
        console.log(`Completed processing all messages for thread ${emailThread.id}`);
    }
    
    /**
     * Create an email record if it doesn't exist
     */
    public async createEmailRecord(tx: any, message: any, emailAccount: EmailAccount, emailThread: EmailThread) {
        try {
            // Clean the message body and snippet
            if (message.body) {
                message.body = cleanEmailText(message.body);
            }
            if (message.snippet) {
                message.snippet = cleanEmailText(message.snippet);
            }

            // Make sure headers exist
            if (!message.headers) {
                console.error('Message headers are missing:', message.id);
                message.headers = {
                    subject: '',
                    from: '',
                    to: '',
                    date: ''
                };
            }
            
            // Extract email info using the utility function
            const emailInfo = extractEmailInfoFromMessage(message as EmailMessage, emailThread as EmailThread);

            // First, check if the email record already exists
            const existingEmail = await tx.query.emails.findFirst({
                where: eq(emails.gmail_id, message.id)
            });

            if (existingEmail) {
                console.log(`Email record already exists for message: ${message.id}, skipping insertion`);
                return;
            }

            // Create the email record using the extracted info
            try {
                await tx.insert(emails).values({
                    gmail_id: message.id,
                    account_id: emailAccount.id,
                    user_id: emailAccount.user_id,
                    subject: emailInfo.subject || 'No Subject',
                    sender: emailInfo.from || 'Unknown',
                    received_at: emailInfo.date ? new Date(emailInfo.date) : new Date(),
                    category: 'Inbox', // Default category
                    metadata: {
                        threadId: message.threadId || emailThread.id,
                        labelIds: message.labelIds || [],
                        snippet: message.snippet || '',
                        historyId: message.historyId || '',
                        internalDate: message.internalDate || ''
                    },
                    is_processed: false
                })
                .onConflictDoNothing({ target: emails.gmail_id});
                console.log(`Created email record for message: ${message.id}`);
            } catch (insertError) {
                // Check if it's a unique constraint violation
                if (insertError.code === '23505' && insertError.constraint_name === 'emails_gmail_id_unique') {
                    console.log(`Email record already exists for message: ${message.id}, skipping insertion`);
                } else {
                    // For other errors, rethrow
                    throw insertError;
                }
            }
        }
        catch (error) {
            console.error(`Failed to create email record for message: ${message.id}`, error);
            // Don't throw here, try to continue with other messages
        }
    }

    /**
     * Create a processed email record if it doesn't exist
     */
    public async createProcessedEmailRecord(tx: any, message: any, emailAccount: EmailAccount, emailThread: EmailThread) {
        console.log(`Creating processed email record for message: ${message.id}, user: ${emailAccount.user_id}`);
        
        // Prepare the data for the processed email record
        const processedEmailData: InsertProcessedEmail = {
            email_id: message.id,
            user_id: emailAccount.user_id,
            account_id: emailAccount.id,
            thread_id: message.threadId || emailThread.id,
            processing_type: 'task_extraction',
            processing_status: 'pending',
            included_in_summary: false
        };
        
        console.log(`Prepared processed email data:`, JSON.stringify(processedEmailData));
        
        try {
            // First check if a record already exists
            const existingRecord = await tx.query.processedEmails.findFirst({
                where: and(
                    eq(processedEmails.email_id, message.id),
                    eq(processedEmails.user_id, emailAccount.user_id)
                )
            });
            
            if (existingRecord) {
                console.log(`Processed email record already exists for message: ${message.id}, skipping insertion`);
                return;
            }
            
            // Use an upsert operation with onConflictDoNothing
            // This handles the race condition at the database level
            const result = await tx
                .insert(processedEmails)
                .values(processedEmailData)
                .onConflictDoNothing({
                    target: [processedEmails.email_id, processedEmails.user_id]
                });
                
            // console.log(`Processed email record insert result:`, result);
            console.log(`Processed email record created for message: ${message.id}`);
            
            // Verify the record was created
            const verifyRecord = await tx.query.processedEmails.findFirst({
                where: and(
                    eq(processedEmails.email_id, message.id),
                    eq(processedEmails.user_id, emailAccount.user_id)
                )
            });
            
            if (verifyRecord) {
                console.log(`Verified processed email record exists for message: ${message.id}`);
            } else {
                console.warn(`Failed to verify processed email record for message: ${message.id} - record not found after insert`);
            }
        } catch (error) {
            // For any other errors, log but don't throw to allow processing other messages
            console.error(`Error upserting processed email record: ${message.id}`, error);
        }
    }

    /**
     * Update the status of processed emails
     */
    public async updateProcessedEmailsStatus(tx: any, messagesToProcess: any[], userId: string, requiresAction: boolean) {
        for (const message of messagesToProcess) {
            await tx.update(processedEmails)
                .set({
                    processing_status: 'completed',
                    processing_result: {
                        success: true,
                        metadata: {
                            requires_action: requiresAction
                        }
                    },
                    processed_at: new Date()
                })
                .where(and(
                    eq(processedEmails.email_id, message.id),
                    eq(processedEmails.user_id, userId)
                ));
        }
    }
}