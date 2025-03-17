// Responsible for summarizing email threads
import { EmailThread, SummarizationResponse, ThreadSummarizationParams, EmailMessage } from '../../Types/model';
import { AgentService } from '../Agent/AgentService.js';
import { DEFAULT_TOKEN_LIMIT } from '../../utils/tokenUtils.js';
import { chunkThreads } from '../../utils/tokenUtils.js';
import { getThreadSummarizationPrompt } from '../../utils/prompts.js';
import { IThreadSummarizationService } from './interfaces';
import { EmailCategorizationService } from './EmailCategorizationService';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger.js';


export class ThreadSummarizationService implements IThreadSummarizationService {
    constructor(
      private readonly agentService: AgentService,
      private readonly categorizationService: EmailCategorizationService,
      private readonly tokenLimit: number = DEFAULT_TOKEN_LIMIT
    ) {}
    
    // Summarize threads
    public async summarizeThreads(threads: EmailThread[], userId?: string): Promise<SummarizationResponse> {
        try {
            ThreadDebugLogger.log('Starting thread summarization', {
                threadCount: threads.length,
                threadsIds: threads.map(t => t.id),
                threads
            });

            // Skip pre-categorization and directly process all threads together
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
                return this.agentService.summarizeThreads(prompt, userId);
            });
            
            // Wait for all categories to be processed
            const chunkResults = await Promise.all(chunkPromises);
            // console.log("results from summarized threads service: ", chunkResults)
            // Merge results
            return this.mergeChunkResults(chunkResults);
            
        } catch (error) {
            ThreadDebugLogger.log('Error summarizing threads:', error);
            console.error('Error summarizing threads:', error);
            throw new Error('Failed to summarize email threads');
        }
    }

    private mergeChunkResults(results: SummarizationResponse[]): SummarizationResponse {
        const categoryMap = new Map<string, typeof results[0]['categories'][0]>();
        const messageIdSet = new Set<string>(); // Track processed messageIds to avoid duplicates

        // Combine categories from all chunks
        for (const result of results) {
            for (const category of result.categories) {
                if (!categoryMap.has(category.title)) {
                    categoryMap.set(category.title, {
                        title: category.title,
                        summaries: []
                    });
                }
                
                // Add only non-duplicate summaries
                for (const summary of category.summaries) {
                    if (summary.messageId && !messageIdSet.has(summary.messageId)) {
                        messageIdSet.add(summary.messageId);
                        categoryMap.get(category.title)!.summaries.push(summary);
                    }
                }
            }
        }

        // Convert map back to array, maintaining category order
        const orderedCategories = [
            'Important Info',
            'Calendar',
            'Payments',
            'Travel',
            'Newsletters',
            'Notifications'
        ];

        const categories = orderedCategories
            .map(title => categoryMap.get(title))
            .filter((category): category is NonNullable<typeof category> => 
                category !== undefined && category.summaries.length > 0
            );

        return { 
            categories, 
            isPending: false,
            generatedAt: new Date()
        };
    }

    // Pre-categorize threads using rule-based and ML methods
    private async preCategorizeThreads(threads: EmailThread[]): Promise<(EmailThread & { category: string, confidence: number })[]> {
        return Promise.all(threads.map(async (thread) => {

            // Use the public wrapper method instead of accessing private methods directly
            const categoryResult = await this.categorizationService.getCategoryForThread(thread);
            
            ThreadDebugLogger.log('Pre-categorization result:', {
                threadId: thread.id,
                category: categoryResult.category,
                confidence: categoryResult.confidence
            });
            
            if (categoryResult.category && categoryResult.confidence > 0.8) {
                return { 
                    ...thread, 
                    category: categoryResult.category, 
                    confidence: categoryResult.confidence 
                };
            }
            
            // Default to "Uncategorized" if no category was determined with high confidence
            return { ...thread, category: "Uncategorized", confidence: 0 };
        }));
    }

    // Group threads by their pre-determined category
    private groupThreadsByCategory(categorizedThreads: (EmailThread & { category: string, confidence: number })[]): Record<string, (EmailThread & { category: string, confidence: number })[]> {
        // Define categories with proper typing
        const categories: Record<string, (EmailThread & { category: string, confidence: number })[]> = {
            'Important Info': [],
            'Actions': [],
            'Calendar': [],
            'Payments': [],
            'Travel': [],
            'Newsletters': [],
            'Promotions': [],
            'Alerts': []
        };
        
        // Group threads by category
        categorizedThreads.forEach(thread => {
            if (categories[thread.category]) {
                categories[thread.category].push(thread);
            } else {
                categories['Alerts'].push(thread);
            }
        });

        ThreadDebugLogger.log('Grouped threads by category:', {
            threadCount: categorizedThreads.length,
        categories: Object.keys(categories)
        });
        
        return categories;
    }

    // Merge results from multiple chunks within a category
    private mergeCategoryChunks(category: string, results: SummarizationResponse[]): { 
        title: string, 
        summaries: any[],
        priorityScore: number
    } {
        
        // Combine all summaries for this category
        const allSummaries = results.flatMap(result => 
            result.categories.find(c => c.title === category)?.summaries || []
        );
        
        // Remove duplicates based on messageId
        const uniqueSummaries = allSummaries.filter((summary, index, self) => 
            index === self.findIndex(s => s.messageId === summary.messageId)
        );
        
        // Assign a default priority score based on category
        const priorityScore = this.getDefaultPriorityScore(category);
        
        ThreadDebugLogger.log('Merging category chunks:', {
            category,
            summaryCount: uniqueSummaries.length,
            priorityScore,
            categoryCount: results.length,
            categories: results.map(c => c.categories)
        });
        
        return {
            title: category,
            summaries: uniqueSummaries,
            priorityScore
        };
    }

    // Get default priority score for a category
    private getDefaultPriorityScore(category: string): number {
        // Base priority by category
        const priorityMap: Record<string, number> = {
            'Important Info': 90,
            'Actions': 85,
            'Calendar': 80,
            'Payments': 75,
            'Travel': 70,
            'Newsletters': 50,
            'Promotions': 40,
            'Alerts': 60
        };
        
        return priorityMap[category] || 50; // Default to 50 if category not found
    }

    // Merge results from all categories
    private mergeCategoryResults(categoryResults: ({ title: string, summaries: any[], priorityScore: number } | null)[]): SummarizationResponse {
        // Filter out null results and sort categories by priority score
        const validCategories = categoryResults
            .filter((result): result is { title: string, summaries: any[], priorityScore: number } => result !== null)
            .sort((a, b) => b.priorityScore - a.priorityScore);

        ThreadDebugLogger.log('Merging category results', {
            categoryCount: categoryResults.length,
            categories: categoryResults.map(c => c?.title)
        });
        
        return { 
            categories: validCategories, 
            isPending: false, 
            generatedAt: new Date()
        };
    }

}