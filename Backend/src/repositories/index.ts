// src/repositories/index.ts
export * from './BaseRepository';
export * from './UserRepository';
export * from './EmailaccountRepository';
export * from './EmailRepository';
export * from './TaskRepository';
export * from './ColumnRepository';
export * from './TaskActionRepository';
export * from './WaitingTaskRepository';
export * from './DailySummaryRepository';
export * from './TaskNoteRepository';
export * from './AnalyticsRepository';
export * from './FollowUpEmailRepository';
export * from './CategorizedDailySummaryRepository';


// Repository instances
import { UserRepository } from './UserRepository';
import { EmailAccountRepository } from './EmailaccountRepository';
import { EmailRepository } from './EmailRepository';
import { TaskRepository } from './TaskRepository';
import { ColumnRepository } from './ColumnRepository';
import { TaskActionRepository } from './TaskActionRepository';
import { WaitingTaskRepository } from './WaitingTaskRepository';
import { DailySummaryRepository } from './DailySummaryRepository';
import { TaskNoteRepository } from './TaskNoteRepository';
import { AnalyticsRepository } from './AnalyticsRepository';
import { FollowUpEmailRepository } from './FollowUpEmailRepository';
import { CategorizedDailySummaryRepository } from './CategorizedDailySummaryRepository';

// Create singleton instances
export const userRepository = new UserRepository();
export const emailAccountRepository = new EmailAccountRepository();
export const emailRepository = new EmailRepository();
export const taskRepository = new TaskRepository();
export const columnRepository = new ColumnRepository();
export const taskActionRepository = new TaskActionRepository();
export const waitingTaskRepository = new WaitingTaskRepository();
export const dailySummaryRepository = new DailySummaryRepository(); 
export const taskNoteRepository = new TaskNoteRepository();
export const analyticsRepository = new AnalyticsRepository();
export const followUpEmailRepository = new FollowUpEmailRepository();
export const categorizedDailySummaryRepository = new CategorizedDailySummaryRepository();