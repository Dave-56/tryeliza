import { EmailThread } from '../Types/model';

export interface ThreadCategorizationParams {
    threads: EmailThread[];
    currentDate: string;
}

export interface ThreadCategorizationResult {
    categories: {
        name: string;  // e.g., "Important Info", "Calendar", etc.
        threads: {
            id: string;
            subject?: string;
            messages: {
                id: string;
                headers: {
                    subject: string;
                    from: string;
                    to: string;
                    date: string;
                };
                body: string;
                threadId: string;
            }[];
            extractedTask?: {
                has_task: boolean;
                task_priority: string;
            };
        }[];
    }[];
}

// Takes a single category from ThreadCategorizationResult
export interface ThreadSummarizationParams {
    category_name: string;  // matches a category.name from ThreadCategorizationResult
    category_threads: {
        thread_id: string;  
        subject?: string;
        is_duplicate_of?: string | null;  
        messages: {
            id: string;
            from: string;  
            to: string;    
            date: string;  
            content: string;  
        }[];
        extractedTask?: {
            has_task: boolean;
            task_priority: string;
        };
    }[];
    currentDate: string;
}

export interface ThreadSummarizationResult {
    key_highlights: string; 
    category_name: string;  // Overall category summary
}
