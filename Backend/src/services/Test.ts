import { db } from '../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { tasks, InsertTask, processedEmails, InsertProcessedEmail, emails, EmailAccount, taskActions } from '../db/schema';
import { EmailThread, EmailCategorization, EmailMessage, ThreadSummarizationParams, SummarizationResponse, PriorityLevel } from '../Types/model';
import { AgentService } from './AgentService';
import { getThreadSummarizationPrompt } from '../utils/prompts';
import { chunkThreads, DEFAULT_TOKEN_LIMIT } from '../utils/tokenUtils.js';
import { extractEmailInfoFromMessage, cleanEmailText } from '../utils/utils';


export class EmailProcessingService {
    private readonly agentService: AgentService;
    private readonly tokenLimit: number;

    constructor(tokenLimit: number = DEFAULT_TOKEN_LIMIT) {
        this.agentService = new AgentService();
        this.tokenLimit = tokenLimit;
    }

    async categorizeEmail(emailAccount: EmailAccount, emailThread: EmailThread): Promise<EmailCategorization | null> {
        try {
            // Start a transaction
            return await db.transaction(async (tx) => {
                try {
                    // First check if task already exists for this message
                    const existingTask = await tx.query.tasks.findFirst({
                        where: eq(tasks.email_id, emailThread.messages[emailThread.messages.length - 1].id)
                    });

                    if (existingTask) {
                        console.log('Task already exists for message:', emailThread.messages[emailThread.messages.length - 1].id);
                        return {
                            isActionRequired: false,
                            task: existingTask
                        };
                    }

                    // Check if any email in the thread has been processed
                    const processedEmailsResults = await Promise.all(
                        emailThread.messages.map(async (message) => {
                            const exists = await tx.query.processedEmails.findFirst({
                                where: and(
                                    eq(processedEmails.email_id, message.id),
                                    eq(processedEmails.user_id, emailAccount.user_id)
                                )
                            });
                            return exists ? null : message;
                        })
                    );

                    const messagesToProcess = processedEmailsResults.filter((msg): msg is NonNullable<typeof msg> => msg !== null);

                    if (messagesToProcess.length === 0) {
                        console.log('All emails in the thread have been processed');
                        return null;
                    }

                    // Create email records for each message that needs to be processed
                    for (const message of messagesToProcess) {
                        try {
                            // First, check if the email record exists
                            const existingEmail = await tx.query.emails.findFirst({
                                where: eq(emails.gmail_id, message.id)
                            });
                            
                            // If email doesn't exist, create it first
                            if (!existingEmail) {
                                try {
                                    // Clean the message body and snippet
                                    if (message.body) {
                                        message.body = cleanEmailText(message.body);
                                    }
                                    if (message.snippet) {
                                        message.snippet = cleanEmailText(message.snippet);
                                    }

                                    // Debug logging
                                    console.log('Message object:', JSON.stringify(message, null, 2));
                                    
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
                                    
                                    // Extract email info using the new utility function
                                    const emailInfo = extractEmailInfoFromMessage(message as EmailMessage, emailThread as EmailThread);
                                    
                                    try {
                                        // Create the email record using the extracted info
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
                                        });
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
                                    continue;
                                }
                            }
                            
                            // Check if processed email record already exists
                            const existingProcessedEmail = await tx.query.processedEmails.findFirst({
                                where: and(
                                    eq(processedEmails.email_id, message.id),
                                    eq(processedEmails.user_id, emailAccount.user_id)
                                )
                            });
                            
                            if (!existingProcessedEmail) {
                                // Now create the processed email record
                                const processedEmailData: InsertProcessedEmail = {
                                    email_id: message.id,
                                    user_id: emailAccount.user_id,
                                    account_id: emailAccount.id,
                                    thread_id: message.threadId || emailThread.id,
                                    processing_type: 'task_extraction',
                                    processing_status: 'pending'
                                };
                                
                                try {
                                    await tx.insert(processedEmails).values(processedEmailData);
                                } catch (insertError) {
                                    // If it's a unique constraint violation, just log and continue
                                    if (insertError.code === '23505') {
                                        console.log(`Processed email record already exists for message: ${message.id}, skipping insertion`);
                                    } else {
                                        // For other errors, log but don't throw to allow processing other messages
                                        console.error(`Error inserting processed email record: ${message.id}`, insertError);
                                    }
                                }
                            } else {
                                console.log(`Processed email record already exists for message: ${message.id}, skipping insertion`);
                            }
                        } catch (error) {
                            console.warn(`Failed to process email ${message.id}:`, error);
                            // Don't throw here, try to continue with other messages
                            continue;
                        }
                    }

                    // Check if email requires action
                    const taskData = await this.agentService.extractTaskFromEmail(emailThread, emailAccount.email_address);
                    
                    // Update processed emails status
                    for (const message of messagesToProcess) {
                        await tx.update(processedEmails)
                            .set({
                                processing_status: 'completed',
                                processing_result: {
                                    success: true,
                                    metadata: {
                                        requires_action: taskData.requires_action
                                    }
                                },
                                processed_at: new Date()
                            })
                            .where(and(
                                eq(processedEmails.email_id, message.id),
                                eq(processedEmails.user_id, emailAccount.user_id)
                            ));
                    }
                    
                    if (!taskData.requires_action) {
                        return null;
                    }

                    // Create task
                    const latestMessage = emailThread.messages[emailThread.messages.length - 1];
                    const taskInsertData = {
                        title: taskData.task.title,
                        description: taskData.task.description,
                        priority: taskData.task.priority || 'medium',
                        due_date: taskData.task.dueDate ? new Date(taskData.task.dueDate) : null,
                        email_id: latestMessage.id,
                        user_id: emailAccount.user_id,
                        account_id: emailAccount.id,
                        column_id: 1,
                        sender_name: latestMessage.headers.from.split('<')[0].trim(),
                        sender_email: latestMessage.headers.from.match(/<(.+)>/)?.[1] || latestMessage.headers.from,
                        received_date: new Date(latestMessage.headers.date),
                        status: 'Inbox',
                        category: 'Email',
                        ai_summary: taskData.task.description
                    };
                    
                    const [task] = await tx.insert(tasks).values(taskInsertData).returning();

                    // Insert task action items if they exist
                    if (taskData.task.action_items && Array.isArray(taskData.task.action_items) && taskData.task.action_items.length > 0) {
                        // Make sure positions are sequential starting from 1
                        const actionItemsToInsert = taskData.task.action_items
                            .map((item, index) => ({
                                task_id: task.id,
                                action_text: item.action_text,
                                // Use the provided position or calculate based on index (1-based)
                                position: item.position || (index + 1),
                                is_completed: false
                            }));
                        
                        await tx.insert(taskActions).values(actionItemsToInsert);
                    }

                    console.log("Task created: ", {
                        name: 'EmailCategorizedSuccessfully',
                        properties: { 
                            emailId: emailThread.messages[0].id,
                            taskId: task.id,
                        }
                    });

                    return {
                        isActionRequired: taskData.requires_action,
                        task: task
                    };

                } catch (error) {
                    console.error('Error categorizing email:', {
                        error: error.message,
                        emailId: emailThread.messages[0].id,
                        userId: emailAccount.user_id
                    });
                    // Let the error propagate to trigger transaction rollback
                    throw error;
                }
            });
        } catch (error) {
            // Handle the error outside the transaction
            console.error('Failed to categorize email:', {
                error: error.message,
                emailId: emailThread.messages[0].id,
                userId: emailAccount.user_id
            });
            // Throw a new error after the transaction has been rolled back
            throw new Error('Failed to categorize email');
        }
    }

    public async summarizeThreads(threads: EmailThread[]): Promise<SummarizationResponse> {
        try {
            const threadChunks = chunkThreads(threads, this.tokenLimit);
            
            // Process each chunk concurrently
            const chunkPromises = threadChunks.map(async (threadChunk: EmailThread[]) => {
                const params: ThreadSummarizationParams = {
                    threads: threadChunk.map((thread: EmailThread) => ({
                        id: thread.id,
                        subject: thread.messages[0].headers.subject,
                        messages: thread.messages.map((msg: EmailMessage) => ({
                            id: msg.id,
                            from: msg.headers.from,
                            to: msg.headers.to,
                            date: msg.headers.date,
                            content: msg.body
                        }))
                    })),
                    currentDate: new Date().toISOString()
                };

                const prompt = getThreadSummarizationPrompt(params);
                return this.agentService.summarizeThreads(prompt);
            });

            // Wait for all chunks to be processed
            const chunkResults = await Promise.all(chunkPromises);
            console.log("results from summarized threads service: ", chunkResults)
            // Merge results
            return this.mergeChunkResults(chunkResults);

        } catch (error) {
            console.error('Error summarizing threads:', error);
            throw new Error('Failed to summarize email threads');
        }
    }

    private mergeChunkResults(results: SummarizationResponse[]): SummarizationResponse {
        // Create a map to organize summaries by category
        const categorySummariesMap = new Map<string, Array<typeof results[0]['summaries'][0]>>();
        
        // Initialize with empty arrays for all possible categories
        const orderedCategories = [
            'Important Info',
            'Actions',
            'Calendar',
            'Payments',
            'Travel',
            'Newsletters',
            'Promotions',
            'Alerts'
        ];
        
        orderedCategories.forEach(category => {
            categorySummariesMap.set(category, []);
        });
        
        // Combine summaries from all chunks, organizing by category
        for (const result of results) {
            for (const summary of result.summaries) {
                const category = summary.category;
                if (categorySummariesMap.has(category)) {
                    categorySummariesMap.get(category)!.push(summary);
                } else {
                    // If we encounter a category not in our predefined list, add it
                    categorySummariesMap.set(category, [summary]);
                }
            }
        }
        
        // Flatten all summaries into a single array, maintaining category order
        const mergedSummaries = orderedCategories
            .flatMap(category => categorySummariesMap.get(category) || [])
            // Remove duplicates based on messageId
            .filter((summary, index, self) => 
                index === self.findIndex(s => s.messageId === summary.messageId)
            );
        
        return { 
            summaries: mergedSummaries, 
            isPending: false,
            generatedAt: new Date()
        };
    }
}


export const emailCategorizationService = new EmailProcessingService(); 