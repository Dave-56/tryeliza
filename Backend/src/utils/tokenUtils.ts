import { EmailThread, EmailMessage } from "../Types/model";
import ThreadDebugLogger from "./ThreadDebugLogger";

// Rough estimation - can be replaced with a more accurate tokenizer
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough approximation
}

export const DEFAULT_TOKEN_LIMIT = 10000;

export async function chunkThreads(threads: EmailThread[], tokenLimit: number = DEFAULT_TOKEN_LIMIT): Promise<EmailThread[][]> {
    // Quick check - if no threads, return empty array
    if (threads.length === 0) {
        return [];
    }
    
    // Calculate total tokens for all threads
    let totalTokens = 0;
    const threadTokenCounts: {thread: EmailThread, tokens: number}[] = [];
    
    for (const thread of threads) {
        const threadTokens = estimateTokens(JSON.stringify(thread));
        threadTokenCounts.push({thread, tokens: threadTokens});
        totalTokens += threadTokens;
    }
    
    // If all threads combined are below the token limit, return as a single chunk
    if (totalTokens <= tokenLimit) {
        ThreadDebugLogger.log(`All threads fit within token limit - no chunking needed`, {
            totalTokens,
            tokenLimit
        });
        return [threads];
    }
    
    // Otherwise, perform chunking
    const chunks: EmailThread[][] = [];
    let currentChunk: EmailThread[] = [];
    let currentTokens = 0;

    for (const {thread, tokens: threadTokens} of threadTokenCounts) {
        if (currentTokens + threadTokens > tokenLimit) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentTokens = 0;
            }
            
            // Handle threads that exceed token limit by using the more sophisticated truncation
            if (threadTokens > tokenLimit) {
                console.warn(`Thread ${thread.id} exceeds token limit - using truncateThreadForLLM`);
                
                // Use the more sophisticated truncation function instead of splitLargeThread
                const truncatedThread = await truncateThreadForLLM(thread, tokenLimit);
                const truncatedTokens = estimateTokens(JSON.stringify(truncatedThread));
                
                if (currentTokens + truncatedTokens > tokenLimit) {
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                        currentTokens = 0;
                    }
                }
                
                currentChunk.push(truncatedThread);
                currentTokens += truncatedTokens;
                continue;
            }
        }
        
        currentChunk.push(thread);
        currentTokens += threadTokens;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

export function splitLargeThread(thread: EmailThread, tokenLimit: number): EmailThread[] {
    const splitThreads: EmailThread[] = [];
    let currentMessages: EmailMessage[] = [];
    let currentTokens = 0;
    
    // Keep thread metadata consistent but split messages
    const baseThread = {
        ...thread,
        messages: []
    };

    for (const message of thread.messages) {
        const messageTokens = estimateTokens(JSON.stringify(message));
        
        if (currentTokens + messageTokens > tokenLimit) {
            if (currentMessages.length > 0) {
                splitThreads.push({
                    ...baseThread,
                    messages: currentMessages,
                    _splitPart: splitThreads.length + 1
                });
                currentMessages = [];
                currentTokens = 0;
            }
            
            // If single message is too large, we could truncate it here
            if (messageTokens > tokenLimit) {
                console.warn(`Message in thread ${thread.id} exceeds token limit - truncating`);
                // Add truncated message logic here if needed
            }
        }
        
        currentMessages.push(message);
        currentTokens += messageTokens;
    }

    if (currentMessages.length > 0) {
        splitThreads.push({
            ...baseThread,
            messages: currentMessages,
            _splitPart: splitThreads.length + 1
        });
    }

    return splitThreads;
} 

/**
     * Truncate email thread content to fit within LLM token limits,
     * preserving sentence and paragraph boundaries
     */
export async function truncateThreadForLLM(thread: EmailThread, tokenLimit: number = DEFAULT_TOKEN_LIMIT): Promise<EmailThread> {
    ThreadDebugLogger.log(`Truncating thread ${thread.id} with ${thread.messages?.length || 0} messages`);

    ThreadDebugLogger.log('Full thread structure:', {
        threadId: thread.id,
        threadSubject: thread.subject,
        messageCount: thread.messages?.length,
        threadStructure: {
            ...thread,
            messages: thread.messages?.map(msg => ({
                id: msg.id,
                headers: msg.headers,
                snippet: msg.snippet || 'No preview available',
                body: msg.body ? msg.body : 'No content available',
                labelIds: msg.labelIds,
                internalDate: msg.internalDate
            }))
        }
    });

    // Calculate max message length based on token limit
    // This is a rough approximation - 100,000 chars is about 25,000 tokens
    const MAX_MESSAGE_LENGTH = Math.floor(tokenLimit * 4);

    if (thread.messages?.length > 10) {
        ThreadDebugLogger.log(`Thread ${thread.id} exceeds 10 messages, will be truncated`);
    }

    const truncatedMessages = await Promise.all((thread.messages || []).map(async message => {
        let messageBody = message.body;
        let messageSnippet = message.snippet;
        
        if (typeof messageBody === 'string' && messageBody) {
            if (messageBody.length > MAX_MESSAGE_LENGTH) {
                ThreadDebugLogger.log(`Splitting long message body for ${message.id}`, {
                    originalLength: messageBody.length,
                    chunks: Math.ceil(messageBody.length / MAX_MESSAGE_LENGTH)
                });
                
                const chunks: string[] = [];
                let currentPosition = 0;
                
                while (currentPosition < messageBody.length) {
                    let breakPoint = currentPosition + MAX_MESSAGE_LENGTH;
                    
                    let paragraphBreak = messageBody.lastIndexOf('\n\n', breakPoint);
                    if (paragraphBreak > currentPosition + MAX_MESSAGE_LENGTH * 0.8) {
                        breakPoint = paragraphBreak;
                    } else {
                        const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
                        for (const end of sentenceEnds) {
                            const pos = messageBody.lastIndexOf(end, breakPoint);
                            if (pos > currentPosition + MAX_MESSAGE_LENGTH * 0.8) {
                                breakPoint = pos + 1; 
                                break;
                            }
                        }
                    }
                    
                    if (breakPoint <= currentPosition + MAX_MESSAGE_LENGTH * 0.8) {
                        breakPoint = currentPosition + MAX_MESSAGE_LENGTH;
                    }
                    
                    chunks.push(messageBody.substring(currentPosition, breakPoint).trim());
                    currentPosition = breakPoint;
                }
                
                return chunks.map((chunk, index) => ({
                    ...message,
                    body: chunk,
                    snippet: index === 0 ? messageSnippet : `[Continued from part ${index}]`,
                    headers: {
                        ...message.headers,
                        subject: message.headers?.subject + (chunks.length > 1 ? ` (Part ${index + 1}/${chunks.length})` : '')
                    }
                }));
            }
        }
        
        return [{
            ...message,
            body: messageBody,
            snippet: messageSnippet,
            subject: message.headers?.subject
        }];
    }));

    const flattenedMessages = truncatedMessages.flat().filter(msg => msg !== null);
    
    ThreadDebugLogger.log(`Thread ${thread.id} processed messages:`, {
        originalCount: thread.messages?.length || 0,
        partsCount: flattenedMessages.length,
        splitMessages: flattenedMessages.length - (thread.messages?.length || 0)
    });
    
    return {
        ...thread,
        messages: flattenedMessages,
        subject: thread.subject
    };
}