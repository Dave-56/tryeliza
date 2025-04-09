import { AgentService } from './AgentService';
import { ThreadCategorizationParams, ThreadSummarizationParams, EmailCategory } from '../Summary/types';
import { EmailThread } from '../../Types/model';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';
import { chunkThreads, DEFAULT_TOKEN_LIMIT, truncateThreadForLLM } from '../../utils/tokenUtils';

export class EmailThreadAnalysisService {
    private categoryBuffer: Record<EmailCategory, Array<any>>;
    private totalThreadsExpected: number = 0;
    private processedThreads: number = 0;

    constructor(private agentService: AgentService) {
        this.resetBuffer();
    }

    private resetBuffer() {
        this.categoryBuffer = {
            'Important Info': [],
            'Calendar': [],
            'Payments': [],
            'Travel': [],
            'Newsletters': [],
            'Notifications': []
        };
        this.totalThreadsExpected = 0;
        this.processedThreads = 0;
    }

    async categorizeThreadBatch(threads: EmailThread[], userId: string, totalThreads: number) {
        ThreadDebugLogger.log('Starting categorizeThreadBatch', {
            inputThreadCount: threads.length,
            totalThreadsExpected: totalThreads
        });

        if (this.totalThreadsExpected === 0) {
            this.totalThreadsExpected = totalThreads;
        }

        // Await the result since chunkThreads is now async
        const threadChunks = await chunkThreads(threads, DEFAULT_TOKEN_LIMIT);
        
        ThreadDebugLogger.log('Created thread chunks', {
            originalThreadCount: threads.length,
            chunkCount: threadChunks.length
        });

        // Create promises for all chunks
        const chunkPromises = threadChunks.map(async (chunkThreads: EmailThread[], chunkIndex: number) => {
            ThreadDebugLogger.log(`Processing chunk ${chunkIndex + 1}/${threadChunks.length}`, {
                chunkSize: chunkThreads.length,
                threadIds: chunkThreads.map(thread => thread.id),
                threadSizes: chunkThreads.map(thread => ({
                    id: thread.id,
                    messageCount: thread.messages?.length || 0,
                    estimatedSize: JSON.stringify(thread).length
                }))
            });
            
            const categorizationParams: ThreadCategorizationParams = {
                threads: chunkThreads,
                currentDate: new Date().toISOString()
            };
            
            const llmResponse = await this.agentService.categorizeThreads(categorizationParams, userId);
            ThreadDebugLogger.log('Raw response from LLM:', {
                response: llmResponse
            });
            return llmResponse;
        });

        try {
            // Wait for all categorizations to complete
            ThreadDebugLogger.log('Waiting for all categorizations to complete', {
                chunkCount: chunkPromises.length,
                totalThreads: threads.length
            });
            
            const categorizationResults = await Promise.all(chunkPromises);
            
            ThreadDebugLogger.log('All categorizations complete', {
                resultCount: categorizationResults.length,
                categoriesPerResult: categorizationResults.map(result => 
                    result.categories.map(cat => `${cat.name}(${cat.threads?.length || 0})`).join(', ')
                )
            });
            
            // Merge results from all chunks
            this.categoryBuffer = this.mergeChunkResults(categorizationResults);
            
            ThreadDebugLogger.log('After merging results', {
                categoryBufferSizes: Object.entries(this.categoryBuffer).reduce((acc, [category, threads]) => {
                    acc[category] = threads.length;
                    return acc;
                }, {} as Record<string, number>),
                uniqueThreadIds: Object.values(this.categoryBuffer).flat().length
            });
            
            // Update processed count
            this.processedThreads += threads.length;
            return this.processedThreads >= this.totalThreadsExpected;
        } catch (error) {
            ThreadDebugLogger.log('Error categorizing threads', {
                error: error.message,
                threadCount: threads.length
            });
            // Return false to indicate not all threads were processed
            return false;
        }
    }

    async generateSummaries(userId: string) {
        if (this.processedThreads < this.totalThreadsExpected) {
            throw new Error('Cannot generate summaries until all threads are categorized');
        }

        const summaries = {};
        for (const [categoryName, categoryThreads] of Object.entries(this.categoryBuffer) as [EmailCategory, any[]][]) {
            if (categoryThreads.length === 0) continue;

            const summarizationParams: ThreadSummarizationParams = {
                category_name: categoryName,
                category_threads: categoryThreads,
                currentDate: new Date().toISOString()
            };

            ThreadDebugLogger.log(`Starting summarization for category: ${categoryName}`, {
                threadCount: categoryThreads.length
            });
            
            ThreadDebugLogger.log(`Thread details for ${categoryName}:`, 
                categoryThreads.map(thread => ({
                    id: thread.id, 
                    subject: thread.subject,
                    from: thread.messages[0]?.headers?.from,
                    messageCount: thread.messages.length,
                    firstMessagePreview: thread.messages[0]?.body ? 
                        thread.messages[0].body.substring(0, 100) + '...' : 
                        thread.messages[0]?.snippet || thread.messages[0]?.content || 'No preview available',
                    firstMessageBody: thread.messages[0]?.body || thread.messages[0]?.content || 'No content available'
                }))
            );

            summaries[categoryName] = await this.agentService.summarizeThreadsNew(summarizationParams, userId);
            
            ThreadDebugLogger.log(`Summarization result for ${categoryName}:`, summaries[categoryName]);
        }

        this.resetBuffer();
        return summaries;
    }

    /**
     * Generates a summary for a single email thread
     */
    public async summarizeThread(thread: EmailThread): Promise<string | null> {
        try {
            // Truncate the email thread first
            const truncatedThread = await truncateThreadForLLM(thread);
            
            // Skip if no valid messages after truncation
            if (!truncatedThread.messages || truncatedThread.messages.length === 0) {
                ThreadDebugLogger.log('No valid messages found in thread after truncation', {
                    threadId: thread.id
                });
                return null;
            }

            return await this.agentService.summarizeSingleThread(truncatedThread);
        } catch (error) {
            ThreadDebugLogger.log('Error summarizing thread', {
                error: error.message,
                threadId: thread.id
            });
            return null;
        }
    }

    /**
     * Merges results from multiple categorization chunks
     */
    private mergeChunkResults(results: any[]): Record<EmailCategory, any[]> {
        const mergedCategories: Record<EmailCategory, any[]> = {
            'Important Info': [],
            'Calendar': [],
            'Payments': [],
            'Travel': [],
            'Newsletters': [],
            'Notifications': []
        };
        
        // Track thread IDs to avoid duplicates (similar to the messageIdSet)
        const processedThreadIds = new Set<string>();
        
        // Process each chunk result
        for (const result of results) {
            for (const category of result.categories) {
                if (!category.threads) continue;
                
                // Add only non-duplicate threads to the appropriate category
                for (const thread of category.threads) {
                    // Skip incomplete thread objects (must have id and messages)
                    if (!thread.id || !thread.messages || !Array.isArray(thread.messages) || thread.messages.length === 0) {
                        ThreadDebugLogger.log('Skipping incomplete thread object', {
                            threadId: thread.id || 'unknown',
                            hasMessages: !!thread.messages,
                            messagesLength: thread.messages ? thread.messages.length : 0
                        });
                        continue;
                    }
                    
                    // Use thread.id for deduplication (or another unique identifier)
                    if (!processedThreadIds.has(thread.id)) {
                        processedThreadIds.add(thread.id);
                        
                        // Add to the appropriate category
                        if (mergedCategories[category.name]) {
                            mergedCategories[category.name].push(thread);
                        }
                    }
                }
            }
        }
        
        return mergedCategories;
    }
}