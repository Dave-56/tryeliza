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
    task?: Task;  // Optional task associated with this email
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
        taskInfo?: {
            has_task: boolean;
            task_id: number;
            task_priority: string;
            task_created_at: string;
        };
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

export interface Task {
    id: number;
    title: string;
    status: string;
    priority: string;
    due_date?: string;
    description?: string;
}

export interface EmailCategorization {
    isActionRequired: boolean;
    task?: Task;
}

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