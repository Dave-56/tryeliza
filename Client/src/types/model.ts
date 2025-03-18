 
export enum RequestHeaders {
    AUTH_HEADER = 'Authorization',
    USER_ID = 'x-user-id',
    REFRESH_TOKEN = 'x-refresh-token',
    TIMEZONE = 'x-timezone'
}

export interface BackendResponse<T> {
    data?: T;
    error?: string;
    isSuccess: boolean;
    isPending?: boolean;
}

export interface LogoutResponse {
    message: string;
  }

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface LoginResponse {
    userId: string;
    elizaAccessToken: string;
    elizaRefreshToken: string;
    expiresAt: string;
}

export interface SignupCredentials {
    name: string;
    email: string;
    password: string;
}

export interface SignupResponse {
    userId: string;
    elizaAccessToken: string;
    elizaRefreshToken: string;
    expiresAt?: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
}

export enum EmailProvider {
    GOOGLE = "google",
    OUTLOOK = "outlook"
}

export type Integration = {
    id: string;
    provider: EmailProvider;
    emailAddress: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    isActive: boolean;
}

export interface EmailThread {
    id: string;
    messages: EmailMessage[];
    subject?: string;
    _splitPart?: number;
    category?: string;
    confidence?: number;
}

export interface EmailMessage {
    id: string;
    threadId?: string;
    labelIds?: string[];
    snippet?: string;
    historyId?: string;
    internalDate?: string;
    headers: EmailHeaders;
    body: string;
    htmlBody?: string;
}

export interface EmailHeaders {
    subject: string;
    from: string;
    to: string;
    date: string;
}

export interface ThreadMessage {
    subject: string;
    content: string;
    date: string;
}

export interface LLMResponse {
    content: string;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

export enum HistoryChangeType {
    MESSAGE_ADDED = 'messageAdded',
}

export interface HistoryChange {
    type: HistoryChangeType;
    messageId: string;
    threadId?: string;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMProvider {
    generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
    isAvailable(): Promise<boolean>;
}

export interface LLMOptions {
    temperature?: number;
    max_tokens?: number;
    timeout?: number;
}

export interface LLMConfig {
    provider: 'openai' | 'ollama';
    model: string;
    maxRetries: number;
    timeout: number;
}

export interface ThreadSummarizationParams {
    threads: {
        id: string;
        subject: string;
        category?: string;
        messages: {
            id: string;
            from: string;
            to: string;
            date: string;
            content: string;
        }[];
    }[];
    currentDate: string;
    category?: string;
    userTasks?: {
        id: string;
        title: string;
        description?: string;
        priority: string;
        dueDate?: string;
        status: string;
    }[];
}

export interface SummarizationResponse {
    categories: {
        title: string;
        summaries: {
            title: string;
            headline: string;
            messageId: string;
            priorityScore: number;
            insights?: {
                key_highlights?: string[];
                why_this_matters?: string;
                next_step?: string[];
            };
        }[];
    }[];
    isPending: boolean;
    generatedAt?: Date;
}

export enum PriorityLevel {
    URGENT = "urgent",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}


// Add this after the EmailCategorization interface in model.ts
export interface TaskExtractionResponse {
    requires_action: boolean;
    task?: {
        title: string;
        description: string;
        priority: string;
        dueDate: string;
        completed: boolean;
        messageId: string;
        action_items?: {
            action_text: string;
            position: number;
        }[];
    };
    confidence_score: number;
    reason: string;
}

export interface EmailData {
    historyId: string;
    emailAddress: string;
    timestamp: string;
    emailAccountId: string;
    refresh_token: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    oauth_token?: string;
    contextual_drafting_enabled: boolean;
    action_item_conversion_enabled: boolean;
    timezone: string;
    is_active: boolean;
    created_at: string;
  }
  
  export interface LoginCredentials {
    email: string;
    password: string;
  }
  
  export interface SignupCredentials {
    email: string;
    password: string;
    name: string;
  }
  
  // Email-related types
  export interface Email {
    id: number;
    gmail_id: string;
    account_id: number;
    user_id: string;
    subject: string;
    enhanced_subject?: string;
    sender: string;
    received_at: string;
    category: string;
    ai_summary?: string;
    metadata?: {
      threadId?: string;
      labelIds?: string[];
      snippet?: string;
      historyId?: string;
      internalDate?: string;
    };
    is_processed: boolean;
    needs_draft_processing: boolean;
    draft_processed_at?: string;
  }
  
  // Task-related types
  export interface Task {
    id: number;
    user_id: string;
    email_id?: string;
    thread_id?: string;
    account_id?: number;
    title: string;
    sender_name: string;
    sender_email?: string;
    team_name?: string;
    column_id?: number;
    position?: number;
    description?: string;
    brief_text?: string;
    ai_summary?: string;
    category: string;
    status: string;
    priority: string;
    due_date?: string;
    received_date: string;
    created_at: string;
    updated_at: string;
  }
  
  export interface TaskAction {
    id: number;
    task_id: number;
    action_text: string;
    is_completed: boolean;
    position?: number;
    created_at: string;
    updated_at: string;
  }
  
  export interface WaitingTask {
    task_id: number;
    waiting_since: string;
    waiting_time: string;
    waiting_for?: string;
    reminder_sent: boolean;
    last_reminder_date?: string;
    created_at: string;
    updated_at: string;
  }
  
  export interface FollowUpEmail {
    id: number;
    task_id: number;
    email_subject: string;
    email_content: string;
    recipient: string;
    status: string;
    scheduled_time?: string;
    created_at: string;
    updated_at: string;
  }

  export interface TaskNote {
    id: number;
    task_id: number;
    user_id: string;
    text: string;
    created_at: string;
    updated_at: string;
  }