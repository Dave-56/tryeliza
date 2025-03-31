import { LLMService } from '../LLMService.js';
import { getTaskExtractionPrompt, getDraftGenerationPrompt, newTaskExtractionPrompt} from '../../utils/prompts.js';
import { SummarizationResponse, EmailThread } from '../../Types/model';
import { validateThreadSummary } from '../../utils/utils.js';
import { cleanEmailText } from '../../utils/utils.js';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';

export class AgentService {
    private llmService: LLMService;

    constructor() {
        this.llmService = LLMService.getInstance();
    }

    async extractTaskFromEmail(emailThread: EmailThread, recipient: string, userId?: string) {
        // Validate input parameters
        if (!emailThread || !emailThread.messages || emailThread.messages.length === 0) {
            //ThreadDebugLogger.log('Invalid email thread provided to extractTaskFromEmail');
            return {
                requires_action: false,
                confidence_score: 0,
                reason: "Could not process email due to missing thread data",
                category: "Notifications" // Default category for invalid emails
            };
        }
        
        try {
            //ThreadDebugLogger.log('Starting task extraction for thread', {
            //    threadId: emailThread.id,
            //    messageCount: emailThread.messages?.length || 0,
            //    recipient,
            //    userId
            //});

            // Validate input parameters
            if (!emailThread || !emailThread.messages || emailThread.messages.length === 0) {
                //ThreadDebugLogger.log('Invalid email thread provided to extractTaskFromEmail');
                return {
                    requires_action: false,
                    confidence_score: 0,
                    reason: "Could not process email due to missing thread data",
                    category: "Notifications" // Default category for invalid emails
                };
            }

            // Clean email content before task extraction
            const cleanedMessages = await Promise.all(emailThread.messages.map(async message => {
                let cleanedBody = null;
                let cleanedSnippet = null;
                
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

                const result = {
                    ...message,  // Keep original message intact
                    cleanedBody,  // Add cleaned content as new properties
                    cleanedSnippet
                };

                // Log cleaned content for debugging
                ThreadDebugLogger.log('Cleaned email content', {
                    messageId: message.id,
                    hasCleanedBody: !!result.cleanedBody,
                    hasCleanedSnippet: !!result.cleanedSnippet,
                    cleanedBodyPreview: result.cleanedBody ? result.cleanedBody.substring(0, 100) : null
                });

                return result;
            }));

            const cleanedThread = {
                ...emailThread,
                messages: cleanedMessages
            };

            // Ensure all messages have headers
            const validMessages = cleanedThread.messages.filter(msg => 
                msg && msg.headers && msg.headers.date && msg.headers.from && msg.headers.to
            );

            // ThreadDebugLogger.log('Valid messages found', {
            //     totalMessages: cleanedThread.messages.length,
            //     validMessages: validMessages.length,
            //     invalidMessages: cleanedThread.messages.length - validMessages.length,
            //     contentAvailable: validMessages.map(m => ({
            //         id: m.id,
            //         hasCleanedBody: !!m.cleanedBody,
            //         hasCleanedSnippet: !!m.cleanedSnippet
            //     }))
            // });

            if (validMessages.length === 0) {
                //ThreadDebugLogger.log('No valid messages with complete headers found in thread');
                return {
                    requires_action: false,
                    confidence_score: 0,
                    reason: "Could not process email due to missing message headers",
                    category: "Notifications" // Default category for invalid emails
                };
            }

            const threadData = validMessages
                .sort((a, b) => new Date(a.headers.date).getTime() - new Date(b.headers.date).getTime())
                .map(msg => ({
                    messageId: msg.id,
                    subject: msg.headers.subject || 'No Subject',
                    content: msg.cleanedBody || msg.cleanedSnippet || msg.headers?.subject || 'No Content Available',
                    date: msg.headers.date,
                    from: msg.headers.from,
                    to: msg.headers.to
                }));

            // ThreadDebugLogger.log('Preparing LLM prompt with thread data', {
            //     messageCount: threadData.length,
            //     subjects: threadData.map(m => m.subject),
            //     timestamps: threadData.map(m => m.date),
            //     contentAvailable: threadData.map(m => Boolean(m.content)),
            //     firstMessageContent: threadData[0]?.content?.substring(0, 100)
            // });

            const prompt = newTaskExtractionPrompt({
                thread: threadData,
                currentTimestamp: new Date().toISOString(),
                recipient: recipient || 'user'
            });

            //ThreadDebugLogger.log('Calling LLM service for task extraction');
            
            const response = await this.llmService.generateResponse(
                prompt, 
                'taskExtraction', 
                'task_extraction',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );

            // ThreadDebugLogger.log('Raw LLM response', {
            //     requires_action: response.requires_action,
            //     confidence_score: response.confidence_score,
            //     reason: response.reason,
            //     task: response.task ? {
            //         title: response.task.title,
            //         priority: response.task.priority,
            //         business_category: response.task.business_category,
            //         is_complex: response.task.is_complex
            //     } : null
            // });
            
            // Map business_category to category if it exists
            if (response.requires_action && response.task && response.task.business_category) {
                // Map business categories to our email categories
                const categoryMap = {
                    "Revenue-Generating": "Important Info",
                    "Operational": "Important Info",
                    "Relationship-Building": "Important Info",
                    "Compliance": "Important Info",
                    "Other": "Notifications"
                };
                
                // Set the category based on the business_category mapping or default to "Notifications"
                response.category = categoryMap[response.task.business_category] || "Notifications";

                // ThreadDebugLogger.log('Mapped business category to email category', {
                //     business_category: response.task.business_category,
                //     mapped_category: response.category
                // });
            } else {
                // Default category for non-action emails
                response.category = "Notifications";
                //ThreadDebugLogger.log('Using default category for non-action email');
            }
            
            return response;
        } catch (error) {
            // ThreadDebugLogger.log('Error in extractTaskFromEmail', {
            //     error: error.message,
            //     stack: error.stack,
            //     threadId: emailThread.id
            // });
            return {
                requires_action: false,
                confidence_score: 0,
                reason: "Error processing email: " + (error.message || "Unknown error"),
                category: "Notifications" // Default category for error cases
            };
        }
    }

    async generateDraft(emailThread: EmailThread, recipient: string, senderName?: string, actionType?: string, userId?: string) {
        const prompt = getDraftGenerationPrompt({
            thread: emailThread.messages,
            recipient: recipient,
            senderName: senderName,
            actionType: actionType
        });

        try {
            const response = await this.llmService.generateResponse(
                prompt, 
                'draftGeneration', 
                'draft_generation',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );
            
            // Validate response format
            if (!response || !response.subject || !response.body || !response.to) {
                //ThreadDebugLogger.log('Invalid draft response format', response);
                return null;
            }

            return {
                subject: response.subject,
                body: response.body,
                to: response.to,
                cc: response.cc || [] // Ensure cc is always an array
            };
        } catch (error) {
            //ThreadDebugLogger.log('Error generating draft', error);
            return null;
        }
    }

    async summarizeThreads(prompt: string, userId?: string): Promise<SummarizationResponse> {
        try {
            const response = await this.llmService.generateResponse(
                prompt, 
                'summary', 
                'summary',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );
            // Validate and sanitize the response to ensure it matches our expected format
            return validateThreadSummary(response);
        } catch (error) {
            //ThreadDebugLogger.log('Error in thread summarization', error);
            throw new Error('Failed to summarize threads');
        }
    }
}