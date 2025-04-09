// src/types/email-digest.ts

// Backend response type
export interface CategorySummaryItem {
  category_name: string;
  key_highlights: string;
}

export interface EmailSummary {
  categories_summary: CategorySummaryItem[];
  created_at: string;
  period: 'morning' | 'evening';
  status: string;
  summary_date: string;
  timezone: string;
  total_threads_processed: number;
  updated_at: string;
  user_id: string;
}

export interface BackendResponse {
  data: {
    message: string;
    summary: EmailSummary;
  };
  isSuccess: boolean;
}
// New inbox summary types
export interface InboxCategorySummary {
  category_name: string;
  key_highlights: string;
}

export interface InboxSummaryData {
  categories_summary: InboxCategorySummary[];
  created_at: string;
  period: 'morning' | 'evening';
  status: 'completed';
  summary_date: string;
  timezone: string;
  total_threads_processed: number;
  updated_at: string;
  user_id: string;
}

export interface InboxSummaryResponse {
  data: {
    message: string;
    summary: InboxSummaryData;
  };
  lastUpdated?: string;
  isSuccess: boolean;
}


// Old daily summary types
export interface DailySummaryResponse {
    userId: string;
    summaryDate: string;
    period: string;
    timezone: string;
    categoriesSummary: Array<{
      count?: number;
      title: string;  // Changed from 'category' to 'title' to match database schema
      summaries: Array<{
        title: string;
        subject: string;
        gmail_id: string;
        sender: string;
        receivedAt: string;
        headline: string;
        priority_score: number;
        insights?: {
          key_highlights?: string[];
          why_this_matters?: string;
          next_step?: string[];
  };
        is_processed: boolean;
      }>;
    }>;
    status: string;
    createdAt: string;
    lastUpdated: string;
    currentServerTime: string; // Server's current time when the response was generated
  isSuccess: boolean;
}

// Type guard to check if response matches our expected structure
// export function isDailySummaryResponse(response: any): response is DailySummaryResponse {
//   return (
//     response &&
//     typeof response === 'object' &&
//     'data' in response &&
//     'isSuccess' in response &&
//     typeof response.data === 'object' &&
//     'message' in response.data &&
//     'summary' in response.data &&
//     typeof response.data.summary === 'object' &&
//     'categories_summary' in response.data.summary &&
//     Array.isArray(response.data.summary.categories_summary)
//   );
// }

// Frontend email item type
//   export interface EmailSummary {
//   title: string;
//   subject: string;
//   headline: string;
//   gmail_id: string;
//   receivedAt: string; // Not optional as it's used in date formatting
//   sender: string; // Not optional as it's always provided in transformation
//   is_processed: boolean; // Not optional, defaults to false
//   priority_score?: number; // Optional priority level
//   insights?: {
//     key_highlights?: string[];
//     why_this_matters?: string;
//     next_step?: string[];
//   };
// }

// Frontend category type
  export interface CategorySummary {
  category: string;
  count: number;
  summaries: EmailSummary[];
  summary: string;
}


// Final transformed response type
export interface EmailDigestResponse {
  connected: boolean;
  message?: string;
    categories: CategorySummary[];
  lastUpdated: string;
  currentServerTime?: string; // Optional server time when the response was generated
}

export interface Summary {
  summaries: [
    {
      category_name: string;
      key_highlights: string
    }
  ]
}