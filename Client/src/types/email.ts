export interface EmailMessage {
  id: string | number;
  sender: string;
  recipients: string[];
  subject: string;
  date: string;
  content: string;
  htmlBody?: string;
  isRead?: boolean;
}

// Interface for thread summary
export interface ThreadSummary {
  messageCount: number;
  participants: string[];
}

// Interface for thread response
export interface EmailThreadResponse {
  messages: EmailMessage[];
  messageCount: number;
  participants: string[];
}
