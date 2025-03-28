// src/services/Email/EmailProcessingService.ts

import { IEmailProcessingService, CategoryResult } from './interfaces';
import { EmailThread, EmailCategorization, SummarizationResponse, EmailMessage } from '../../Types/model';
import { TaskData } from './interfaces';
import { EmailAccount } from '../../db/schema';
import { db } from '../../db/index.js';
import { EmailCategorizationService } from './EmailCategorizationService';
import { EmailTaskService } from './EmailTaskService';
import { EmailRecordService } from './EmailRecordService';
import { ThreadSummarizationService } from './ThreadSummarizationService';
import { AgentService } from '../Agent/AgentService.js';
import { DEFAULT_TOKEN_LIMIT } from '../../utils/tokenUtils.js';
import { cleanEmailText } from '../../utils/utils';
import { EmailFeatureExtractor } from '../ML/utils/featureExtraction';


export class EmailProcessingService implements IEmailProcessingService {
    private categorizationService: EmailCategorizationService;
    private taskService: EmailTaskService;
    private recordService: EmailRecordService;
    private summarizationService: ThreadSummarizationService;
    private agentService: AgentService;
    
    constructor(tokenLimit: number = DEFAULT_TOKEN_LIMIT) {
      this.agentService = new AgentService();
      this.taskService = new EmailTaskService(db);
      this.recordService = new EmailRecordService(db);
      const featureExtractor = new EmailFeatureExtractor();
      this.categorizationService = new EmailCategorizationService(this.agentService, this.taskService, this.recordService, featureExtractor);
      this.summarizationService = new ThreadSummarizationService(this.agentService, this.categorizationService, tokenLimit);
    }
    
    /**
     * Categorize an email and determine if it requires action
     * @param emailAccount The email account
     * @param emailThread The email thread to categorize
     * @returns Object containing isActionRequired flag and task data if created
     */
    async categorizeEmail(emailAccount: EmailAccount, emailThread: EmailThread): Promise<EmailCategorization | null> {
        try {
            // Use the categorization service to categorize the email
            return await this.categorizationService.categorizeEmail(emailAccount, emailThread);
        } catch (error) {
            console.error('Error in EmailProcessingService.categorizeEmail:', error);
            throw new Error('Failed to categorize email');
        }
    }
    
    /**
     * Summarize email threads
     * @param threads The email threads to summarize
     * @param userId Optional user ID for logging LLM interactions
     * @returns Summarization response
     */
    async summarizeThreads(threads: EmailThread[], userId?: string): Promise<SummarizationResponse> {
        try {
            // Clean email content before summarization
            const cleanedThreads = await Promise.all(threads.map(async thread => {
                // Process all messages in parallel
                const cleanedMessages = await Promise.all(thread.messages.map(async message => {
                    // Clean both body and snippet if they exist
                    let cleanedBody = message.body;
                    let cleanedSnippet = message.snippet;
                    
                    // Only clean if the content is a string
                    if (typeof message.body === 'string' && message.body) {
                        cleanedBody = await cleanEmailText(message.body);
                    } else if(message.body && typeof message.body === 'object' && Object.keys(message.body).length > 0) {
                        // If body is an object with content, convert to string
                        cleanedBody = await cleanEmailText(JSON.stringify(message.body));
                    }
                    
                    if (typeof message.snippet === 'string' && message.snippet) {
                        cleanedSnippet = await cleanEmailText(message.snippet);
                    } else if (message.snippet && typeof message.snippet === 'object' && Object.keys(message.snippet).length > 0) {
                        // If snippet is an object with content, convert to string
                        cleanedSnippet = await cleanEmailText(JSON.stringify(message.snippet));
                    }

                    // Use subject as fallback content if body and snippet are empty
                if (!cleanedBody && !cleanedSnippet && message.headers?.subject) {
                    cleanedBody = `Subject: ${message.headers.subject}`;
                }
                    
                    return {
                        ...message,
                        body: cleanedBody,
                        snippet: cleanedSnippet,
                        task: message.task
                    };
                }));
                
                return {
                    ...thread,
                    messages: cleanedMessages
                };
            }));

            // Log a sample of cleaned threads for debugging
            if (cleanedThreads.length > 0 && cleanedThreads[0].messages.length > 0) {
                console.log('Sample cleaned message:', {
                    threadId: cleanedThreads[0].id,
                    messageId: cleanedThreads[0].messages[0].id,
                    bodyLength: cleanedThreads[0].messages[0].body?.length || 0,
                    snippetLength: cleanedThreads[0].messages[0].snippet?.length || 0
                });
            }
            
            // Use the summarization service to summarize the cleaned threads
            return await this.summarizationService.summarizeThreads(cleanedThreads, userId);
        } catch (error) {
            console.error('Error in EmailProcessingService.summarizeThreads:', error);
            throw new Error('Failed to summarize email threads');
        }
    }

    /**
     * Check if a task already exists for this email thread
     * @param tx Database transaction
     * @param emailThread The email thread to check
     * @returns Existing task if found, null otherwise
     */
    async checkExistingTask(tx: any, emailThread: EmailThread): Promise<any> {
        return this.taskService.checkExistingTask(tx, emailThread);
    }

    /**
     * Get messages that need processing
     * @param tx Database transaction
     * @param emailThread The email thread to process
     * @param userId User ID
     * @returns Array of messages that need processing
     */
    async getMessagesToProcess(tx: any, emailThread: EmailThread, userId: string): Promise<EmailMessage[]> {
        return this.recordService.getMessagesToProcess(tx, emailThread, userId);
    }

    /**
     * Process messages (create email records and processed email records)
     * @param tx Database transaction
     * @param messagesToProcess Messages to process
     * @param emailAccount Email account
     * @param emailThread Email thread
     */
    async processMessages(tx: any, messagesToProcess: EmailMessage[], emailAccount: EmailAccount, emailThread: EmailThread): Promise<void> {
        return this.recordService.processMessages(tx, messagesToProcess, emailAccount, emailThread);
    }

    /**
     * Perform rule-based categorization on an email thread
     * @param emailThread The email thread to categorize
     * @returns Category result with category, confidence, and action requirement
     */
    async ruleBasedCategorization(emailThread: EmailThread): Promise<CategoryResult> {
        return this.categorizationService.ruleBasedCategorization(emailThread);
    }

    /**
     * Update the status of processed emails
     * @param tx Database transaction
     * @param messagesToProcess Messages that were processed
     * @param userId User ID
     * @param requiresAction Whether the emails require action
     */
    async updateProcessedEmailsStatus(tx: any, messagesToProcess: EmailMessage[], userId: string, requiresAction: boolean): Promise<void> {
        return this.recordService.updateProcessedEmailsStatus(tx, messagesToProcess, userId, requiresAction);
    }

    /**
     * Extract task from email
     * @param emailThread The email thread to extract task from
     * @param recipient The recipient email address
     * @param userId Optional user ID for logging LLM interactions
     * @returns Extracted task data with action requirement information
     */
    async extractTaskFromEmail(emailThread: EmailThread, recipient: string, userId?: string): Promise<any> {
        return this.agentService.extractTaskFromEmail(emailThread, recipient, userId);
    }

    /**
     * Create task and action items from task data
     * @param tx Database transaction
     * @param taskData Task data extracted from email
     * @param emailThread The email thread
     * @param emailAccount The email account
     * @returns Created task
     */
    async createTaskAndActionItems(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount): Promise<any> {
        return this.taskService.createTaskAndActionItems(tx, taskData, emailThread, emailAccount);
    }
}