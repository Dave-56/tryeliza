import { EmailThread, EmailMessage } from "../Types/model";

// Rough estimation - can be replaced with a more accurate tokenizer
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough approximation
}

export const DEFAULT_TOKEN_LIMIT = 10000;

export function chunkThreads(threads: EmailThread[], tokenLimit: number = DEFAULT_TOKEN_LIMIT): EmailThread[][] {
    const chunks: EmailThread[][] = [];
    let currentChunk: EmailThread[] = [];
    let currentTokens = 0;

    for (const thread of threads) {
        const threadTokens = estimateTokens(JSON.stringify(thread));
        
        if (currentTokens + threadTokens > tokenLimit) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentTokens = 0;
            }
            
            // Handle threads that exceed token limit by splitting messages
            if (threadTokens > tokenLimit) {
                console.warn(`Thread ${thread.id} exceeds token limit - splitting messages`);
                
                // Create a new thread object with subset of messages
                const splitThreads = splitLargeThread(thread, tokenLimit);
                
                // Add each split thread to chunks
                for (const splitThread of splitThreads) {
                    const splitTokens = estimateTokens(JSON.stringify(splitThread));
                    if (currentTokens + splitTokens > tokenLimit) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                        currentTokens = 0;
                    }
                    currentChunk.push(splitThread);
                    currentTokens += splitTokens;
                }
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