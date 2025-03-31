// Responsible for categorizing emails using rule-based, ML, and LLM approaches
import { EmailThread, EmailCategorization } from '../../Types/model';
import { EmailAccount, users } from '../../db/schema';
import { IEmailCategorizationService, CategoryResult, TaskData } from './interfaces';
import { EmailTaskService } from './EmailTaskService';
import { EmailRecordService } from './EmailRecordService';
import { AgentService } from '../Agent/AgentService.js';
import { db } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { EmailClassifier } from '../ML/models/EmailClassifier';
import { EmailFeatureExtractor } from '../ML/utils/featureExtraction';
import { EmailPatternMatcher, CategoryResult as PatternCategoryResult } from '../ML/utils/patternMatching';

export class EmailCategorizationService implements IEmailCategorizationService {
    private classifier: EmailClassifier;
    private featureExtractor: EmailFeatureExtractor;
    private patternMatcher: EmailPatternMatcher;
    private agentService: AgentService;
    private taskService: EmailTaskService;
    private recordService: EmailRecordService;
    
    constructor(
        agentService: AgentService,
        taskService: EmailTaskService,
        recordService: EmailRecordService,
        featureExtractor?: EmailFeatureExtractor
    ) {
        this.agentService = agentService;
        this.taskService = taskService;
        this.recordService = recordService;
        this.featureExtractor = featureExtractor || new EmailFeatureExtractor();
        this.classifier = new EmailClassifier();
        this.patternMatcher = new EmailPatternMatcher();
    }
    

    // Implement the ruleBasedCategorization method required by the interface
    async ruleBasedCategorization(emailThread: EmailThread): Promise<CategoryResult> {
        return this.patternMatcher.ruleBasedCategorization(emailThread);
    }

    // Main categorization function that implements IEmailCategorizationService interface
    async categorizeEmail(emailAccount: EmailAccount, emailThread: EmailThread, existingTx?: any): Promise<EmailCategorization | null> {
        try {
            console.log('Starting email categorization for thread:', {
                threadId: emailThread.id,
                messageCount: emailThread.messages.length,
                firstMessageSubject: emailThread.messages[0]?.headers?.subject
            });

            // Use existing transaction if provided, otherwise start a new one
            const executeWithTransaction = async (tx: any) => {
                try {
                    // Get user's settings first
                    const userSettings = await tx.select()
                        .from(users)
                        .where(eq(users.id, emailAccount.user_id))
                        .execute();

                    // If action item conversion is disabled or user not found, return null
                    if (!userSettings?.[0]?.action_item_conversion_enabled) {
                        console.log('Action item conversion disabled for user, skipping task extraction');
                        return null;
                    }

                    // Check if task already exists for this message
                    const existingTask = await this.taskService.checkExistingTask(tx, emailThread);
                    if (existingTask) {
                        console.log('Existing task found:', {
                            taskId: existingTask.id,
                            threadId: emailThread.id
                        });
                        return {
                            isActionRequired: false,
                            task: existingTask
                        };
                    }

                    // Get messages that need processing
                    const messagesToProcess = await this.recordService.getMessagesToProcess(tx, emailThread, emailAccount.user_id);
                    console.log('Messages to process:', {
                        count: messagesToProcess.length,
                        messageIds: messagesToProcess.map(m => m.id)
                    });

                    if (messagesToProcess.length === 0) {
                        console.log('All emails in the thread have been processed');
                        return null;
                    }

                    // Process each message (create email records and processed email records)
                    try {
                        await this.recordService.processMessages(tx, messagesToProcess, emailAccount, emailThread);
                    } catch (processError) {
                        console.error(`Error processing messages for email ${emailThread.messages[0].id}:`, processError);
                        // Continue with task extraction even if email record creation fails
                    }
                    
                    console.log('Calling LLM for task extraction:', {
                        threadId: emailThread.id,
                        userEmail: emailAccount.email_address,
                        userId: emailAccount.user_id
                    });

                    // Query LLM for task data
                    const taskData = await this.agentService.extractTaskFromEmail(
                        emailThread, 
                        emailAccount.email_address,
                        emailAccount.user_id
                    );

                    console.log('LLM task extraction result:', {
                        threadId: emailThread.id,
                        requiresAction: taskData.requires_action,
                        confidenceScore: taskData.confidence_score,
                        reason: taskData.reason,
                        taskTitle: taskData.task?.title
                    });

                    const requiresAction = taskData.requires_action;
                    
                    // Update processed emails status
                    await this.recordService.updateProcessedEmailsStatus(tx, messagesToProcess, emailAccount.user_id, requiresAction);
                    
                    let task = null;
                    if (requiresAction) {
                        try {
                            console.log('Creating task from LLM result:', {
                                threadId: emailThread.id,
                                taskTitle: taskData.task?.title,
                                userId: emailAccount.user_id
                            });
                            
                            // Log the state after updating processed emails
                            console.log('ProcessedEmails status updated:', {
                                threadId: emailThread.id,
                                messageCount: messagesToProcess.length,
                                requiresAction
                            });

                            console.log("Just before creating task")

                            task = await this.taskService.createTaskAndActionItems(tx, taskData, emailThread, emailAccount);
                            
                            if (!task) {
                                console.error('Task creation returned null:', {
                                    threadId: emailThread.id,
                                    taskData: JSON.stringify(taskData)
                                });
                            } else {
                                console.log('Task created successfully:', {
                                    taskId: task.id,
                                    threadId: emailThread.id
                                });
                            }
                        } catch (error) {
                            console.error('Error creating task:', {
                                error: error.message,
                                stack: error.stack,
                                threadId: emailThread.id,
                                taskTitle: taskData.task?.title
                            });
                            // Re-throw to be caught by outer catch block
                            throw error;
                        }
                    }
                    
                    return {
                        isActionRequired: requiresAction,
                        task: requiresAction && task ? task : undefined
                    };
                } catch (error) {
                    console.error('Error categorizing email:', {
                        error: error.message,
                        stack: error.stack,
                        emailId: emailThread.messages[0].id,
                        userId: emailAccount.user_id
                    });
                    // Let the error propagate to trigger transaction rollback
                    throw error;
                }
            };

            if (existingTx) {
                return await executeWithTransaction(existingTx);
            } else {
                return await db.transaction(executeWithTransaction);
            }
        } catch (error) {
            console.error(`Error in categorizeEmail:`, {
                error: error.message,
                stack: error.stack,
                threadId: emailThread.id
            });
            return null;
        }
    }


    // Extract task data from an email thread
    private async extractTaskData(emailThread: EmailThread): Promise<TaskData | null> {
        try {
            // Extract content from the latest message in the thread
            const latestMessage = emailThread.messages[emailThread.messages.length - 1];

            // Get the recipient's email address
            const recipient = latestMessage.headers?.to || '';

            // Ensure content is a string (not a Promise)
            const content = typeof latestMessage.body === 'string' ? latestMessage.body : 
                           typeof latestMessage.snippet === 'string' ? latestMessage.snippet : '';
            const subject = latestMessage.headers?.subject || '';
            
            // Use the agent service to extract task data
            const taskData = await this.agentService.extractTaskFromEmail(emailThread, recipient);
            
            return {
                requires_action: taskData.requires_action,
                task: taskData.task,
                confidence_score: taskData.confidence_score,
                reason: taskData.reason
            };
        } catch (error) {
            console.error(`Error extracting task data: ${error}`);
            return null;
        }
    }
    
    // Public wrapper method for use in ThreadSummarizationService
    public async getCategoryForThread(thread: EmailThread): Promise<{
        category: string | null;
        confidence: number;
        requiresAction: boolean;
    }> {
        
        // Try ML classification
        const mlResult = await this.classifier.classifyEmailThread(thread);
        if (mlResult.category && mlResult.confidence >= 0.75) {
            return mlResult;
        }
        
        // Default to null category with low confidence if both methods fail
        return { category: null, confidence: 0, requiresAction: false };
    }

}