import { AgentService } from './AgentService';
import { ThreadCategorizationParams, ThreadSummarizationParams, EmailCategory, SimplifiedThread, ThreadCategorizationResult } from '../Summary/types';
import { EmailThread } from '../../Types/model';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';
import { chunkThreads, DEFAULT_TOKEN_LIMIT, truncateThreadForLLM } from '../../utils/tokenUtils';

export class EmailThreadAnalysisService {
    private categoryBuffer: Record<EmailCategory, Array<any>>;
    private totalThreadsExpected: number = 0;
    private processedThreads: number = 0;
    private originalThreadsMap: Map<string, EmailThread> = new Map<string, EmailThread>();

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
        this.originalThreadsMap.clear(); // Clear the map when resetting the buffer
    }

    async categorizeThreadBatch(threads: EmailThread[], userId: string, totalThreads: number) {
        //ThreadDebugLogger.log('Starting categorizeThreadBatch', {
        //    inputThreadCount: threads.length,
        //    totalThreadsExpected: totalThreads
        //});

        if (this.totalThreadsExpected === 0) {
            this.totalThreadsExpected = totalThreads;
        }

        // First, simplify the threads
        const simplifiedThreads = this.simplifyThreads(threads, totalThreads);
        //ThreadDebugLogger.log('Simplified threads', {
        //    simplifiedThreadCount: simplifiedThreads.length,
        //    sample: simplifiedThreads.slice(0, 3)
        //});
        
        //If we have original threads, use those
        if (threads && threads.length > 0) {
            threads.forEach(thread => this.originalThreadsMap.set(thread.id, thread));
        } 
        // Otherwise use simplified threads as fallback
        else if (simplifiedThreads && simplifiedThreads.length > 0) {
            //ThreadDebugLogger.log('WARNING: Using simplified threads as fallback', {
            //    reason: 'Original threads array is empty',
            //    simplifiedThreadCount: simplifiedThreads.length
            //});
            simplifiedThreads.forEach(thread => this.originalThreadsMap.set(thread.id, thread as any));
        }

        //ThreadDebugLogger.log('Original threads map updated', {
        //    mapSize: this.originalThreadsMap.size,
        //    threadIds: Array.from(this.originalThreadsMap.keys()),
        //    originalThreadsLength: threads.length,
        //    simplifiedThreadsLength: simplifiedThreads.length,
        //    sampleKeys: Array.from(this.originalThreadsMap.keys()).slice(0, 3)
        //});

        // Await the result since chunkThreads is now async
        const threadChunks = await chunkThreads(simplifiedThreads, DEFAULT_TOKEN_LIMIT);
        
        // ThreadDebugLogger.log('Created thread chunks', {
        //     originalThreadCount: threads.length,
        //     chunkCount: threadChunks.length
        // });

        // Create promises for all chunks
        const chunkPromises = threadChunks.map(async (chunkThreads: SimplifiedThread[], chunkIndex: number) => {
            // ThreadDebugLogger.log(`Processing chunk ${chunkIndex + 1}/${threadChunks.length}`, {
            //     chunkSize: chunkThreads.length,
            //     threadIds: chunkThreads.map(thread => thread.id),
            //     threadSizes: chunkThreads.map(thread => ({
            //         id: thread.id,
            //         previewLength: thread.preview.length || 0,
            //         estimatedSize: JSON.stringify(thread).length
            //     }))
            // });
            
            const categorizationParams: ThreadCategorizationParams = {
                threads: chunkThreads,
                currentDate: new Date().toISOString()
            };
            
            const llmResponse = await this.agentService.categorizeThreads(categorizationParams, userId);
            return llmResponse;
        });

        try {
            // Wait for all categorizations to complete
            const categorizationResults = await Promise.all(chunkPromises);

            // Reconstruct threads by category
            const reconstructedResults = categorizationResults.map(result => 
                this.reconstructThreadsByCategory(result)
            );

            // Get the map keys correctly - Map objects need Array.from(map.keys())
            const originalThreadIds = Array.from(this.originalThreadsMap.keys());

            // ThreadDebugLogger.log('Reconstructed results:', {
            //     chunkCount: categorizationResults.length,
            //     originalThreadCount: this.originalThreadsMap.size,
            //     originalThreadMapKeys: originalThreadIds.slice(0, 10), // Show first 10 keys for debugging
            //     reconstructedCategoryCounts: reconstructedResults.map(result => 
            //         Object.entries(result).reduce((acc, [category, threads]) => {
            //             acc[category] = threads.length;
            //             return acc;
            //         }, {} as Record<string, number>)
            //     ),
            //     totalReconstructedThreads: reconstructedResults.reduce(
            //         (sum, result) => sum + Object.values(result).flat().length, 0
            //     ),
            //     allThreadsAccountedFor: reconstructedResults.reduce(
            //         (sum, result) => sum + Object.values(result).flat().length, 0
            //     ) === this.originalThreadsMap.size
            // });
            
            // Merge results from all chunks
            this.categoryBuffer = this.mergeChunkResults(reconstructedResults);
            
        //     ThreadDebugLogger.log('After merging results', {
        //         categoryBufferSizes: Object.entries(this.categoryBuffer).reduce((acc, [category, threads]) => {
        //             acc[category] = threads.length;
        //             return acc;
        //         }, {} as Record<string, number>),
        //         uniqueThreadIds: Object.values(this.categoryBuffer).flat().length
        //    });
            
            // Update processed count based on the actual number of threads in the map
            // This ensures we're counting all threads that were actually processed
            this.processedThreads = this.originalThreadsMap.size;
            
            // Log the thread counting status
            // ThreadDebugLogger.log('Thread counting status', {
            //     processedThreads: this.processedThreads,
            //     totalThreadsExpected: this.totalThreadsExpected,
            //     allThreadsProcessed: this.processedThreads >= this.totalThreadsExpected,
            //     originalMapSize: this.originalThreadsMap.size
            // });
            
            return this.processedThreads >= this.totalThreadsExpected;
        } catch (error) {
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

            // ThreadDebugLogger.log(`Starting summarization for category: ${categoryName}`, {
            //     threadCount: categoryThreads.length
            // });
            
            // ThreadDebugLogger.log(`Thread details for ${categoryName}:`, 
            //     categoryThreads.map(thread => ({
            //         id: thread.id, 
            //         subject: thread.subject,
            //         from: thread.messages[0]?.headers?.from,
            //         messageCount: thread.messages.length,
            //         firstMessagePreview: thread.messages[0]?.body ? 
            //             thread.messages[0].body.substring(0, 100) + '...' : 
            //             thread.messages[0]?.snippet || thread.messages[0]?.content || 'No preview available',
            //         firstMessageBody: thread.messages[0]?.body || thread.messages[0]?.content || 'No content available'
            //     }))
            // );

            summaries[categoryName] = await this.agentService.summarizeThreadsNew(summarizationParams, userId);
            
            //ThreadDebugLogger.log(`Summarization result for ${categoryName}:`, summaries[categoryName]);
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
                // ThreadDebugLogger.log('No valid messages found in thread after truncation', {
                //     threadId: thread.id
                // });
                return null;
            }

            return await this.agentService.summarizeSingleThread(truncatedThread);
        } catch (error) {
            // ThreadDebugLogger.log('Error summarizing thread', {
            //     error: error.message,
            //     threadId: thread.id
            // });
            return null;
        }
    }

    /**
     * Merges results from multiple categorization chunks
     */
    private mergeChunkResults(results: any[]): Record<EmailCategory, any[]> {
        //ThreadDebugLogger.log('Merging chunk results', {
        //    resultCount: results.length,
        //    resultStructure: results.length > 0 ? 
        //        (Array.isArray(results[0]) ? 'array' : 
        //         (results[0].categories ? 'has categories' : 
        //          (Object.keys(results[0]).includes('Important Info') ? 'is category map' : 'unknown')))
        //        : 'empty'
        //});
        
        const mergedCategories = this.initializeEmptyCategories();
        
        // Track thread IDs to avoid duplicates
        const processedThreadIds = new Set<string>();
        
        // Process each chunk result
        for (const result of results) {
            // Check if result is already in the expected format (Record<EmailCategory, EmailThread[]>)
            if (result && typeof result === 'object' && !Array.isArray(result) && !result.categories) {
                // This is likely already a Record<EmailCategory, EmailThread[]>
                for (const [categoryName, threads] of Object.entries(result)) {
                    if (!Array.isArray(threads)) continue;
                    
                    for (const thread of threads) {
                        // Skip incomplete thread objects
                        if (!thread || !thread.id) continue;
                        
                        // Deduplication
                        if (!processedThreadIds.has(thread.id)) {
                            processedThreadIds.add(thread.id);
                            
                            // Add to the appropriate category
                            if (mergedCategories[categoryName as EmailCategory]) {
                                mergedCategories[categoryName as EmailCategory].push(thread);
                            }
                        }
                    }
                }
            } 
            // Original format with categories array
            else if (result && result.categories) {
                for (const category of result.categories) {
                    if (!category.threads) continue;
                    
                    // Add only non-duplicate threads to the appropriate category
                    for (const thread of category.threads) {
                        // Skip incomplete thread objects
                        if (!thread || !thread.id) continue;
                        
                        // Deduplication
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
        }
        
        // Log the merged results
        // ThreadDebugLogger.log('After merging', {
        //     totalThreads: processedThreadIds.size,
        //     categoryCounts: Object.entries(mergedCategories).reduce((acc, [category, threads]) => {
        //         acc[category] = threads.length;
        //         return acc;
        //     }, {} as Record<string, number>)
        // });
        
        return mergedCategories;
    }

    private simplifyThreads(threads: EmailThread[], totalThreadCount: number): SimplifiedThread[] {
        return threads.map((thread, index) => ({
          id: thread.id,
          subject: thread.messages?.[0]?.headers?.subject || '',
          from: thread.messages?.[0]?.headers?.from || '',
          preview: (thread.messages?.[0]?.body ? thread.messages?.[0]?.body.substring(0, 200) : '') || '',
          threadNumber: index + 1,
          totalThreads: totalThreadCount,
          extractedTask: thread.extractedTask // Pass through any existing task data
        }));
    }

    private reconstructThreadsByCategory(
        categorizedIds: ThreadCategorizationResult, 
        originalThreadsMap?: Map<string, EmailThread | SimplifiedThread>
    ): Record<EmailCategory, EmailThread[]> {
        // Create a record with empty arrays for each category
        const result = this.initializeEmptyCategories();
        
        // Use the provided map or fall back to the class-level map
        const threadsMap = originalThreadsMap || this.originalThreadsMap;
        
        // Log the map size for debugging
        // ThreadDebugLogger.log('Thread reconstruction', {
        //     mapSize: threadsMap.size,
        //     categorizedThreadCount: categorizedIds.categories.reduce(
        //         (sum, category) => sum + (category.threadIds?.length || 0), 0
        //     ),
        //     mapKeys: Array.from(threadsMap.keys()).slice(0, 5) // Show first 5 keys for debugging
        // });
    
        // Fill in the threads for each category
        categorizedIds.categories.forEach(category => {
            const categoryName = category.name as EmailCategory;
            if (result[categoryName]) {
                result[categoryName] = category.threadIds
                    .map(id => {
                        const thread = threadsMap.get(id);
                        if (!thread) {
                            //ThreadDebugLogger.log('Thread not found in map', { threadId: id });
                        }
                        return thread;
                    })
                    .filter(Boolean) as EmailThread[];
            }
        });
        
        return result;
    }

    private initializeEmptyCategories(): Record<EmailCategory, any[]> {
        return {
            'Important Info': [],
            'Calendar': [],
            'Payments': [],
            'Travel': [],
            'Newsletters': [],
            'Notifications': []
        };
    }
}