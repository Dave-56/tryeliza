// src/types/email-digest.ts

// Backend response type
export interface DailySummaryResponse {
    userId: string;
    summaryDate: string;
    period: string;
    timezone: string;
    categoriesSummary: Array<{
      count: number;
      category: string;
      items: Array<{
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
  
  // Frontend email item type
  export interface EmailSummary {
    title: string;
    subject: string;
    headline: string;
    gmail_id: string;
    receivedAt: string; // Not optional as it's used in date formatting
    sender: string; // Not optional as it's always provided in transformation
    is_processed: boolean; // Not optional, defaults to false
    priority_score?: number; // Optional priority level
    insights?: {
      key_highlights?: string[];
      why_this_matters?: string;
      next_step?: string[];
    };
  }
  
  // Frontend category type
  export interface CategorySummary {
    category: string;
    emails: EmailSummary[];
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