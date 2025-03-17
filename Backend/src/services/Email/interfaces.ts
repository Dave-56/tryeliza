// src/services/Email/interfaces.ts

import { EmailThread, EmailMessage, SummarizationResponse, PriorityLevel, EmailCategorization } from '../../Types/model';
import { EmailAccount } from '../../db/schema';
// Common interfaces for categorization results
export interface CategoryResult {
  category: string | null;
  confidence: number;
  requiresAction: boolean;
}

export interface TaskData {
  requires_action: boolean;
  task?: {
    title: string;
    description: string;
    priority: PriorityLevel;
    dueDate?: string;
    is_complex?: boolean;
    action_items?: Array<{
      action_text: string;
      position: number;
    }>;
  };
  confidence_score: number;
  reason: string;
  category?: string;
}

export interface EmailFeatures {
  subjectTokens: string[];
  bodyTokens: string[];
  domainType: string;
  hasLinks: boolean;
  hasDateTime: boolean;
  hasActionWords: boolean;
  messageLength: number;
  hasCheckboxes: boolean;
  urgencyScore: number;
  promotionalScore: number;
  importantInfoScore: number;
}

// Feature Extractor Interface
export interface IEmailFeatureExtractor {
  extractFeatures(emailThread: EmailThread): EmailFeatures;
  tokenize(text: string): string[];
  extractDomainType(fromHeader: string): string;
  containsDateTime(text: string): boolean;
  containsActionWords(text: string): boolean;
  calculateUrgencyScore(message: EmailMessage): number;
  calculatePromotionalScore(message: EmailMessage): number;
  calculateImportantInfoScore(message: EmailMessage): number;
}

// Email Categorization Service Interface
export interface IEmailCategorizationService {
  ruleBasedCategorization(emailThread: EmailThread): Promise<CategoryResult>;
  categorizeEmail(emailAccount: EmailAccount, emailThread: EmailThread): Promise<EmailCategorization | null>;
}

// Email Task Service Interface
export interface IEmailTaskService {
  checkExistingTask(tx: any, emailThread: EmailThread): Promise<any>;
  createTaskAndActionItems(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount): Promise<any>;
}

// Email Record Service Interface
export interface IEmailRecordService {
  getMessagesToProcess(tx: any, emailThread: EmailThread, userId: string): Promise<EmailMessage[]>;
  processMessages(tx: any, messagesToProcess: EmailMessage[], emailAccount: EmailAccount, emailThread: EmailThread): Promise<void>;
  createEmailRecord(tx: any, message: EmailMessage, emailAccount: EmailAccount, emailThread: EmailThread): Promise<void>;
  createProcessedEmailRecord(tx: any, message: EmailMessage, emailAccount: EmailAccount, emailThread: EmailThread): Promise<void>;
  updateProcessedEmailsStatus(tx: any, messagesToProcess: EmailMessage[], userId: string, requiresAction: boolean): Promise<void>;
}

// Thread Summarization Service Interface
export interface IThreadSummarizationService {
  summarizeThreads(threads: EmailThread[]): Promise<SummarizationResponse>;
}

// Main Email Processing Service Interface
export interface IEmailProcessingService {
  categorizeEmail(emailAccount: EmailAccount, emailThread: EmailThread): Promise<EmailCategorization | null>;
  summarizeThreads(threads: EmailThread[]): Promise<SummarizationResponse>;
  checkExistingTask(tx: any, emailThread: EmailThread): Promise<any>;
  getMessagesToProcess(tx: any, emailThread: EmailThread, userId: string): Promise<EmailMessage[]>;
  processMessages(tx: any, messagesToProcess: EmailMessage[], emailAccount: EmailAccount, emailThread: EmailThread): Promise<void>;
  ruleBasedCategorization(emailThread: EmailThread): Promise<CategoryResult>;
  updateProcessedEmailsStatus(tx: any, messagesToProcess: EmailMessage[], userId: string, requiresAction: boolean): Promise<void>;
  extractTaskFromEmail(emailThread: EmailThread, recipient: string): Promise<any>;
  createTaskAndActionItems(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount): Promise<any>;
}