import { EmailMessage, ThreadSummary } from './email';

export interface TaskAction {
  id: number;
  text: string;
  isCompleted: boolean;
  position?: number;
}

export interface FormattedTaskNote {
  id: number;
  content: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  sender?: string;
  dueDate?: string;
  receivedDate: string;
  message: string;
  waitingTime?: string;
  actions?: TaskAction[];
  priority?: 'High' | 'Medium' | 'Low' | 'Urgent';
  status?: string;
  description?: string;
  aiSummary?: string;
  email_id?: string;
  thread_id?: string;
  email_content?: EmailMessage[];
  emailContent?: EmailMessage[];
  notes?: FormattedTaskNote[];
  threadSummary?: ThreadSummary;
  reminderSent?: boolean;
  emailLoadError?: string;
}

// Database task interface
export interface DbTask {
  id: number;
  title: string;
  position: number | null;
  created_at: Date | null;
  updated_at: Date | null;
  user_id: string;
  email_id: string | null;
  thread_id: string | null;
  account_id: number | null;
  column_id: number;
  description: string | null;
  priority: string | null;
  due_date: Date | null;
  sender_name: string | null;
  sender_email: string | null;
  team_name: string | null;
  category: string | null;
  status: string | null;
  brief_text: string | null;
  ai_summary: string | null;
  received_date: Date;
}

export interface DbTaskExtended extends DbTask {
  actions?: any[];
  waitingInfo?: { 
    reminder_sent: boolean | null 
  };
  parsed_email_content?: EmailMessage[];
}
