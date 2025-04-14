import { LLMService } from '../LLMService.js';
import { getDraftGenerationPrompt, newTaskExtractionPrompt} from '../../utils/prompts.js';
import { getThreadCategorizationPrompt, generateSummaryPrompt, generateSingleThreadSummaryPrompt } from '../../utils/new-prompts';
import { SummarizationResponse, EmailThread } from '../../Types/model';
import { cleanEmailText, cleanMessageForLLM, validateThreadSummary } from '../../utils/utils.js';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';
import { ThreadCategorizationResult, ThreadSummarizationResult, ThreadSummarizationParams, ThreadCategorizationParams } from '../Summary/types.js';

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
                // ThreadDebugLogger.log('Cleaned email content', {
                //     messageId: message.id,
                //     hasCleanedBody: !!result.cleanedBody,
                //     hasCleanedSnippet: !!result.cleanedSnippet,
                //     cleanedBodyPreview: result.cleanedBody ? result.cleanedBody.substring(0, 100) : null
                // });

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
            } else {
                // Default category for non-action emails
                response.category = "Notifications";
            }
            
            return response;
        } catch (error) {
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
            throw new Error('Failed to summarize threads');
        }
    }

    async categorizeThreads(params: ThreadCategorizationParams, userId?: string): Promise<ThreadCategorizationResult> {
        // ThreadDebugLogger.log('Calling categorizeThreads');
        // Clean excessive whitespace from message bodies
        params.threads = params.threads.map(thread => ({
            ...thread,
            preview: cleanMessageForLLM(thread.preview)
        }));

        // Debug log threads before categorization
        // ThreadDebugLogger.log('Threads before categorization', {
        //     threads: params.threads.map(thread => ({
        //         id: thread.id,
        //         preview: thread.preview,
        //         previewLength: thread.preview.length,
        //         estimatedSize: JSON.stringify(thread).length
        //     }))
        // });
 
        const prompt = getThreadCategorizationPrompt(params);
        //ThreadDebugLogger.log('Prompt for categorization', prompt);
        try {
            const response = await this.llmService.generateResponse(
                prompt,
                'categorization',
                'categorization',
                undefined,
                userId
            );

            //Log raw response
            // ThreadDebugLogger.log('Raw response from LLM:', {
            //     response: response
            // });

            // Validate response structure
            if (!response.categories || !Array.isArray(response.categories)) {
                //ThreadDebugLogger.log('Invalid response structure - missing categories array');
                throw new Error('Invalid response structure - missing categories array');
            }

            // Track which threads get categorized
            const categorizedThreadIds = new Set<string>();

            // Ensure subjects are properly set from message headers
            const validatedResponse = {
                categories: response.categories.map(category => {
                    // Extract thread IDs from the threads array
                    const threadIds = (category.threads || [])
                        .filter(thread => thread && typeof thread === 'object' && thread.id)
                        .map(thread => thread.id)
                        .filter(threadId => {
                            // Find the original thread
                            const originalThread = params.threads.find(t => t.id === threadId);
                            
                            if (originalThread) {
                                categorizedThreadIds.add(originalThread.id);
                                return true;
                            }
                            
                            return false;
                        });
                    
                    return {
                        name: category.name,
                        threadIds
                    };
                })
            };
            
            // Find threads that LLM dropped
            const uncategorizedThreads = params.threads.filter(t => !categorizedThreadIds.has(t.id));
            
            if (uncategorizedThreads.length > 0) {
                // ThreadDebugLogger.log('Found dropped threads - attempting recategorization', {
                //     droppedCount: uncategorizedThreads.length,
                //     droppedThreads: uncategorizedThreads.map(t => ({
                //         id: t.id,
                //         subject: t.preview.substring(0, 100) + '...'    
                //     }))
                // });

                // Try to categorize dropped threads
                try {
                    const retryParams: ThreadCategorizationParams = {
                        threads: uncategorizedThreads,
                        currentDate: new Date().toISOString()
                    };

                    // ThreadDebugLogger.log('Retrying categorization for dropped threads', {
                    //     threadCount: uncategorizedThreads.length
                    // });

                    const retryResponse = await this.llmService.generateResponse(
                        getThreadCategorizationPrompt(retryParams),
                        'categorization',
                        'categorization',
                        undefined,
                        userId  // Use the function parameter instead of params.userId
                    );

                    if (retryResponse.categories && Array.isArray(retryResponse.categories)) {
                        // Process retry results and add threads to appropriate categories
                        retryResponse.categories.forEach(retryCat => {
                            if (!retryCat.name) return;
                            
                            // Extract thread IDs from the threads array
                            const threadIds = (retryCat.threads || [])
                                .filter(thread => thread && typeof thread === 'object' && thread.id)
                                .map(thread => thread.id);
                            
                            // Skip if no valid thread IDs
                            if (!threadIds.length) return;
                            
                            // Find or create category
                            let existingCat = validatedResponse.categories.find(c => c.name === retryCat.name);
                            if (!existingCat) {
                                existingCat = {
                                    name: retryCat.name,
                                    threadIds: []
                                };
                                validatedResponse.categories.push(existingCat);
                            }
                            
                            // Add valid thread IDs to the category
                            threadIds.forEach(threadId => {
                                const originalThread = params.threads.find(t => t.id === threadId);
                                if (originalThread) {
                                    categorizedThreadIds.add(originalThread.id);
                                    existingCat.threadIds.push(originalThread.id);
                                }
                            });
                        });
                    } else {
                        // If retry response has no valid categories, add all uncategorized to Notifications
                        addToNotificationsCategory(
                            validatedResponse, 
                            uncategorizedThreads.map(thread => thread.id)
                        );
                    }
                    
                    // Find threads that are still uncategorized after retry
                    const stillUncategorizedThreads = params.threads.filter(t => !categorizedThreadIds.has(t.id));
                    
                    if (stillUncategorizedThreads.length > 0) {
                        // ThreadDebugLogger.log('Threads still uncategorized after retry', {
                        //     count: stillUncategorizedThreads.length
                        // });
                        
                        // Add to Notifications category
                        addToNotificationsCategory(
                            validatedResponse, 
                            stillUncategorizedThreads.map(thread => thread.id)
                        );
                    }
                } catch (retryError) {
                    // On retry error, fall back to Notifications
                    addToNotificationsCategory(
                        validatedResponse, 
                        uncategorizedThreads.map(thread => thread.id)
                    );
                }
            }

            // Log category stats
            // ThreadDebugLogger.log('Response category stats:', {
            //     totalCategories: validatedResponse.categories.length,
            //     inputThreadCount: params.threads.length,
            //     categorizedThreadCount: validatedResponse.categories.reduce(
            //         (sum, cat) => sum + (cat.threadIds?.length || 0), 0
            //     )
            // });

            // Return the validated response
            // ThreadDebugLogger.log('Returning validated response:', {
            //     totalCategories: validatedResponse.categories.length,
            //     allCategoryNames: validatedResponse.categories.map(c => c.name),
            //     categoryDetails: validatedResponse.categories.map(c => ({
            //         name: c.name,
            //         threadCount: c.threadIds?.length || 0,
            //         threadIds: c.threadIds || []
            //     })),
            //     totalThreadsInCategories: validatedResponse.categories.reduce(
            //         (sum, cat) => sum + (cat.threadIds?.length || 0), 0
            //     ),
            //     inputThreadCount: params.threads.length,
            //     inputThreadIds: params.threads.map(t => t.id)
            // });
            return validatedResponse;
        } catch (error) {
            // ThreadDebugLogger.log('Error in categorizeThreads:', {
            //     error: error.message,
            //     inputThreadCount: params.threads.length
            // });
            throw new Error(`Failed to categorize threads: ${error.message}`);
        }
    }

    async summarizeThreadsNew(params: ThreadSummarizationParams, userId?: string): Promise<ThreadSummarizationResult> {
        // Normalize message data to ensure content is properly passed to the LLM
        const normalizedParams = {
            ...params,
            category_threads: params.category_threads.map(thread => ({
                ...thread,
                messages: thread.messages.map(msg => ({
                    ...msg,
                    // Ensure body field contains content if original body is missing
                    body: msg.body || (msg as any).content || 'No body content available'
                }))
            }))
        };
        
        // ThreadDebugLogger.log('Starting summarization for category:', {
        //     category_name: normalizedParams.category_name,
        //     thread_count: normalizedParams.category_threads.length,
        //     threads_detail: normalizedParams.category_threads.map(thread => ({
        //         id: thread.id,
        //         subject: thread.subject,
        //         is_duplicate_of: thread.is_duplicate_of,
        //         messages: thread.messages.map(msg => ({
        //             id: msg.id,
        //             from: msg.from,
        //             to: msg.to,
        //             date: msg.date,
        //             body: msg.body // Body is now guaranteed to have content
        //         }))
        //     }))
        // });
        
        const prompt = generateSummaryPrompt(normalizedParams);
        //ThreadDebugLogger.log('Starting summarization for category:', {
        //    category_name: normalizedParams.category_name,
        //    thread_count: normalizedParams.category_threads.length,
        //    threads_detail: normalizedParams.category_threads.map(thread => ({
        //        id: thread.id,
        //        subject: thread.subject,
        //        is_duplicate_of: thread.is_duplicate_of,
        //        messages: thread.messages.map(msg => ({
        //            id: msg.id,
        //            from: msg.from,
        //            to: msg.to,
        //            date: msg.date,
        //            body: msg.body // Body is now guaranteed to have content
        //        })))
        //    }))
        //});
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
            //ThreadDebugLogger.log('Response from summarizeThreadsNew', response);
            return response
        } catch (error) {
            throw new Error('Failed to summarize threads');
        }
    }

    async summarizeSingleThread(thread: EmailThread, userId?: string): Promise<string | null> {
        try {
            const prompt = generateSingleThreadSummaryPrompt(thread, new Date().toISOString());
            const response = await this.llmService.generateResponse(
                prompt,
                'summary',
                'single_thread_summary',
                undefined,
                userId
            );
            return response.summary || null;
        } catch (error) {
            console.error('Failed to summarize single thread:', error);
            return null;
        }
    }
}

// Helper function to add threads to Notifications category
function addToNotificationsCategory(response, threadIds) {
    let notificationsCategory = response.categories.find(c => c.name === 'Notifications');
    if (!notificationsCategory) {
        notificationsCategory = {
            name: 'Notifications',
            threadIds: []
        };
        response.categories.push(notificationsCategory);
    }
    
    notificationsCategory.threadIds.push(...threadIds);
}