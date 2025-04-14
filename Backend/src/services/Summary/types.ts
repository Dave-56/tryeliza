import { EmailThread } from '../../Types/model';

// Define valid email categories
export type EmailCategory = 
  | "Important Info"
  | "Calendar"
  | "Payments"
  | "Travel"
  | "Newsletters"
  | "Notifications";

export interface ThreadCategorizationParams {
    threads: SimplifiedThread[];
    currentDate: string;
}

export interface ThreadCategorizationResult {
    categories: {
        name: string;
        threadIds: string[];
    }[];
}

export interface SimplifiedThread {
  id: string;
  subject: string;
  from: string;
  preview: string;
  threadNumber: number; // For "Thread X of Y" tracking
  totalThreads: number; // Total thread count
  extractedTask?: {
    has_task: boolean;
    task_priority: string;
  };
}

// export interface ThreadCategorizationResult {
//     categories: {
//         name: EmailCategory;  
//         threads: {
//             id: string;
//             subject?: string;
//             messages: {
//                 id: string;
//                 headers: {
//                     subject: string;
//                     from: string;
//                     to: string;
//                     date: string;
//                 };
//                 body: string;
//                 threadId: string;
//             }[];
//             extractedTask?: {
//                 has_task: boolean;
//                 task_priority: string;
//             };
//         }[];
//     }[];
// }

// Takes a single category from ThreadCategorizationResult
export interface ThreadSummarizationParams {
    category_name: EmailCategory;  
    category_threads: {
        id: string;  
        subject?: string;
        is_duplicate_of?: string | null;  
        messages: {
            id: string;
            from: string;  
            to: string;    
            date: string;  
            body: string;  
        }[];
        extractedTask?: {
            has_task: boolean;
            task_priority: string;
        };
    }[];
    currentDate: string;
}

// Alternative interface for single thread summarization
export interface ThreadSummarizationParamsAlternative {
    threads: EmailThread[];
    currentDate: string;
}

export interface ThreadSummarizationResultAlternative {
    threads: Array<{
        id: string;
        summary: string;
    }>;
}

export interface ThreadSummarizationResult {
    key_highlights: string; 
    category_name: EmailCategory;  
}
