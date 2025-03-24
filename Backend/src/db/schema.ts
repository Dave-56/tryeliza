import { pgTable, text, serial, timestamp, integer, boolean, jsonb, uuid, date, primaryKey, time, numeric, foreignKey, unique} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Keep existing tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // This will be linked to auth.users in the SQL migration
  email: text("email").notNull(),
  name: text("name").notNull(),
  oauth_token: text("oauth_token"),  
  contextual_drafting_enabled: boolean("contextual_drafting_enabled").default(false),
  action_item_conversion_enabled: boolean("action_item_conversion_enabled").default(false),
  timezone: text("timezone").default('UTC'),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

// New table for email accounts (allows multiple accounts per user)
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email_address: text("email_address").notNull(),
  provider: text("provider").notNull(), // 'gmail', 'outlook', etc.
  is_connected: boolean("is_connected").default(false),
  is_primary: boolean("is_primary").default(false),
  history_id: text("history_id"),
  last_sync: timestamp("last_sync"),
  tokens: jsonb("tokens").$type<{
    access_token: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
    expiry_date: number;
  }>(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Add unique constraint to prevent duplicate accounts
  user_email_unique: unique("user_email_unique").on(table.user_id, table.email_address),
}));

export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  gmail_id: text("gmail_id").notNull().unique(),
  account_id: integer("account_id")
    .notNull()
    .references(() => emailAccounts.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  subject: text("subject").notNull(),
  enhanced_subject: text("enhanced_subject"),
  sender: text("sender").notNull(),
  received_at: timestamp("received_at").notNull(),
  category: text("category").notNull(),
  ai_summary: text("ai_summary"),
  metadata: jsonb("metadata").$type<{
    threadId?: string;
    labelIds?: string[];
    snippet?: string; // Only store a short snippet, not full content
    historyId?: string;
    internalDate?: string;
  }>(),
  is_processed: boolean("is_processed").default(false),
  needs_draft_processing: boolean("needs_draft_processing").default(false),
  draft_processed_at: timestamp("draft_processed_at"),
});

// Add new kanban board columns table
export const columns = pgTable("columns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(), // 'Inbox', 'In Progress', 'Waiting', 'Completed'
  position: integer("position").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Modify existing tasks table to work with kanban board
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email_id: text("email_id")
    .references(() => emails.gmail_id, { onDelete: 'cascade' }),
  thread_id: text("thread_id").unique(),  // Add thread_id field to track tasks at thread level
  account_id: integer("account_id")
    .references(() => emailAccounts.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  sender_name: text("sender_name").notNull(),
  sender_email: text("sender_email"),
  team_name: text("team_name"),
  column_id: integer("column_id")
    .references(() => columns.id, { onDelete: 'set null' }),
  position: integer("position"), // Order within column
  description: text("description"),
  brief_text: text("brief_text"), // For "Eliza's Brief" section
  ai_summary: text("ai_summary"), // AI-generated summary
  category: text("category").default('Other'),
  status: text("status").notNull().default('Inbox'),
  priority: text("priority").default('medium'), // 'High', 'Medium', 'Low'
  due_date: timestamp("due_date"), // Will convert to text like "Tomorrow", "Today", "Friday" in the API or frontend
  received_date: timestamp("received_date").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Add a composite unique constraint on email_id and user_id
  // This ensures each user can have only one task per email
  // email_id_user_id_unique: unique("email_id_user_id_unique").on(table.email_id, table.user_id),
}));

// Task notes/comments
export const taskNotes = pgTable("task_notes", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  text: text("text").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Add waiting tasks table (for tasks in waiting column)
export const waitingTasks = pgTable("waiting_tasks", {
  task_id: integer("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  waiting_since: timestamp("waiting_since").notNull(),
  waiting_time: text("waiting_time").notNull(), // "3 days", "5 days", etc.
  waiting_for: text("waiting_for"), // "John Peterson", "Finance Department"
  reminder_sent: boolean("reminder_sent").default(false),
  last_reminder_date: timestamp("last_reminder_date"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Task actions (checkboxes/to-dos for tasks)
export const taskActions = pgTable("task_actions", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  action_text: text("action_text").notNull(),
  is_completed: boolean("is_completed").default(false),
  position: integer("position"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Follow-up emails table
export const followUpEmails = pgTable("follow_up_emails", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  email_subject: text("email_subject").notNull(),
  email_content: text("email_content").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(), // 'drafted', 'sent', 'scheduled'
  scheduled_time: timestamp("scheduled_time"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Keep existing activity tracking tables
export const processedNotifications = pgTable("processed_notifications", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  history_id: text("history_id").notNull(),
  processed_at: timestamp("processed_at").defaultNow(),
});

export const draftActivities = pgTable("draft_activities", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  account_id: integer("account_id")
    .notNull()
    .references(() => emailAccounts.id, { onDelete: 'cascade' }),
  email_id: text("email_id")
    .references(() => emails.gmail_id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  status: text("status").notNull(), // e.g., "Draft Created", "Draft Updated"
  gmail_draft_id: text("gmail_draft_id"),
  created_at: timestamp("created_at").defaultNow(),
});

// Task history tracking
export const taskHistory = pgTable("task_history", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action_type: text("action_type").notNull(), // 'created', 'moved', 'updated'
  previous_value: text("previous_value"),
  new_value: text("new_value"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Add this with the other table definitions
export const dailySummaries = pgTable("daily_summaries", {
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  summary_date: date("summary_date").notNull(),
  timezone: text("timezone").default('UTC'),
  period: text("period").notNull().default('morning'),
  scheduled_time: time("scheduled_time"), // Store the exact time (7 AM or 4 PM)
  last_run_at: timestamp("last_run_at"), // When the summary generation was last attempted
  error_details: text("error_details"), // Store error information if status is 'failed'
  email_count: integer("email_count"), // Number of emails processed
  categories_summary: jsonb("categories_summary").$type<{
    category: string;
    count: number;
    summaries: Array<{
      subject: string;
      gmail_id: string;
      sender: string;
      received_at: string;
      headline: string;
      priority_score?: number;
      insights?: {
        key_highlights?: string[];
        why_this_matters?: string;
        next_step?: string[];
      };
    }>;
  }[]>(),
  status: text("status").notNull().default('completed'),  // 'pending', 'completed', 'failed'
  cache_duration_hours: integer("cache_duration_hours").default(24),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.user_id, table.summary_date, table.period] })
  };
});

//LLM interactions table with correct references
export const llmInteractions = pgTable("llm_interactions", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email_id: text("email_id")
    .references(() => emails.gmail_id, { onDelete: 'cascade' }),
  // Reference the composite key fields separately
  email_id_for_processed: text("email_id_for_processed"),
  user_id_for_processed: uuid("user_id_for_processed"),
  interaction_type: text("interaction_type").notNull(), // 'task_extraction', 'summarization', 'draft_generation'
  prompt: text("prompt").notNull(),
  response: jsonb("response").notNull(),
  model: text("model").notNull(), // 'gpt-4o', etc.
  temperature: numeric("temperature"),
  tokens_used: integer("tokens_used"),
  latency_ms: integer("latency_ms"),
  success: boolean("success").default(true),
  error_message: text("error_message"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Add the foreign key constraint for the composite key
    processedEmailFk: foreignKey({
      columns: [table.email_id_for_processed, table.user_id_for_processed],
      foreignColumns: [processedEmails.email_id, processedEmails.user_id],
      name: 'processed_email_fk' // Add a name for the constraint
    })
  };
});

// Add table to track emails processed by LLM
export const processedEmails = pgTable("processed_emails", {
  id: serial("id").primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email_id: text("email_id")
    .notNull()
    .references(() => emails.gmail_id, { onDelete: 'cascade' }),
  account_id: integer("account_id")
    .notNull()
    .references(() => emailAccounts.id, { onDelete: 'cascade' }),
  thread_id: text("thread_id").notNull(),
  processing_type: text("processing_type").notNull(), // 'task_extraction', 'summarization', 'draft_generation', etc.
  processing_status: text("processing_status").notNull().default('completed'), // 'pending', 'completed', 'failed'
  processing_result: jsonb("processing_result").$type<{
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
  }>(),
  included_in_summary: boolean('included_in_summary').default(false),
  summary_period: text('summary_period'),  // 'morning' or 'evening'
  processed_at: timestamp("processed_at").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    emailUserUnique: primaryKey({ columns: [table.email_id, table.user_id] })
  };
});

// Add table to track webhook notifications for idempotency
export const webhookNotifications = pgTable("webhook_notifications", {
  id: serial("id").primaryKey(),
  notification_id: text("notification_id").notNull().unique(), // Unique ID for the notification
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  account_id: integer("account_id")
    .notNull()
    .references(() => emailAccounts.id, { onDelete: 'cascade' }),
  email_address: text("email_address").notNull(),
  history_id: text("history_id").notNull(),
  status: text("status").notNull().default('processing'), // 'processing', 'completed', 'failed'
  error_message: text("error_message"),
  processed_at: timestamp("processed_at").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Update relations
export const emailsRelations = relations(emails, ({ one, many }) => ({
  user: one(users, {
    fields: [emails.user_id],
    references: [users.id],
  }),
  account: one(emailAccounts, {
    fields: [emails.account_id],
    references: [emailAccounts.id],
  }),
  tasks: many(tasks),
  draftActivities: many(draftActivities),
  processedEmails: many(processedEmails),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.user_id],
    references: [users.id],
  }),
  email: one(emails, {
    fields: [tasks.email_id],
    references: [emails.gmail_id],
  }),
  account: one(emailAccounts, {
    fields: [tasks.account_id],
    references: [emailAccounts.id],
  }),
  column: one(columns, {
    fields: [tasks.column_id],
    references: [columns.id],
  }),
  actions: many(taskActions),
  waitingInfo: one(waitingTasks, {
    fields: [tasks.id],
    references: [waitingTasks.task_id],
  }),
  followUps: many(followUpEmails),
  history: many(taskHistory),
  notes: many(taskNotes)
}));

export const waitingTasksRelations = relations(waitingTasks, ({ one }) => ({
  task: one(tasks, {
    fields: [waitingTasks.task_id],
    references: [tasks.id],
  }),
}));

export const taskActionsRelations = relations(taskActions, ({ one }) => ({
  task: one(tasks, {
    fields: [taskActions.task_id],
    references: [tasks.id],
  }),
}));

export const followUpEmailsRelations = relations(followUpEmails, ({ one }) => ({
  task: one(tasks, {
    fields: [followUpEmails.task_id],
    references: [tasks.id],
  }),
}));

export const taskHistoryRelations = relations(taskHistory, ({ one }) => ({
  task: one(tasks, {
    fields: [taskHistory.task_id],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskHistory.user_id],
    references: [users.id],
  }),
}));

export const columnsRelations = relations(columns, ({ many }) => ({
  tasks: many(tasks),
}));

export const draftActivitiesRelations = relations(draftActivities, ({ one }) => ({
  user: one(users, {
    fields: [draftActivities.user_id],
    references: [users.id],
  }),
  account: one(emailAccounts, {
    fields: [draftActivities.account_id],
    references: [emailAccounts.id],
  }),
  email: one(emails, {
    fields: [draftActivities.email_id],
    references: [emails.gmail_id],
  }),
}));

export const processedEmailsRelations = relations(processedEmails, ({ one }) => ({
  user: one(users, {
    fields: [processedEmails.user_id],
    references: [users.id],
  }),
  email: one(emails, {
    fields: [processedEmails.email_id],
    references: [emails.gmail_id],
  }),
  account: one(emailAccounts, {
    fields: [processedEmails.account_id],
    references: [emailAccounts.id],
  }),
}));

export const webhookNotificationsRelations = relations(webhookNotifications, ({ one }) => ({
  user: one(users, {
    fields: [webhookNotifications.user_id],
    references: [users.id],
  }),
  account: one(emailAccounts, {
    fields: [webhookNotifications.account_id],
    references: [emailAccounts.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  emailAccounts: many(emailAccounts),
  emails: many(emails),
  tasks: many(tasks),
  draftActivities: many(draftActivities),
  taskHistory: many(taskHistory),
  dailySummaries: many(dailySummaries),
  processedEmails: many(processedEmails),
  webhookNotifications: many(webhookNotifications),
  taskNotes: many(taskNotes)
}));

export const dailySummariesRelations = relations(dailySummaries, ({ one }) => ({
  user: one(users, {
    fields: [dailySummaries.user_id],
    references: [users.id],
  }),
}));

export const taskNotesRelations = relations(taskNotes, ({ one }) => ({
  task: one(tasks, {
    fields: [taskNotes.task_id],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskNotes.user_id],
    references: [users.id],
  }),
}));

// Export schemas - add new ones while keeping existing ones
export const insertEmailSchema = createInsertSchema(emails);
export const selectEmailSchema = createSelectSchema(emails);
export const insertTaskSchema = createInsertSchema(tasks);
export const selectTaskSchema = createSelectSchema(tasks);
export const insertDraftActivitySchema = createInsertSchema(draftActivities);
export const selectDraftActivitySchema = createSelectSchema(draftActivities);
export const insertDailySummarySchema = createInsertSchema(dailySummaries);
export const selectDailySummarySchema = createSelectSchema(dailySummaries);

// Add new schemas
export const insertColumnSchema = createInsertSchema(columns);
export const selectColumnSchema = createSelectSchema(columns);
export const insertTaskActionSchema = createInsertSchema(taskActions);
export const selectTaskActionSchema = createSelectSchema(taskActions);
export const insertWaitingTaskSchema = createInsertSchema(waitingTasks);
export const selectWaitingTaskSchema = createSelectSchema(waitingTasks);
export const insertFollowUpEmailSchema = createInsertSchema(followUpEmails);
export const selectFollowUpEmailSchema = createSelectSchema(followUpEmails);
export const insertTaskHistorySchema = createInsertSchema(taskHistory);
export const selectTaskHistorySchema = createSelectSchema(taskHistory);
export const insertEmailAccountSchema = createInsertSchema(emailAccounts);
export const selectEmailAccountSchema = createSelectSchema(emailAccounts);
export const insertProcessedEmailSchema = createInsertSchema(processedEmails);
export const selectProcessedEmailSchema = createSelectSchema(processedEmails);
export const insertWebhookNotificationSchema = createInsertSchema(webhookNotifications);
export const selectWebhookNotificationSchema = createSelectSchema(webhookNotifications);
export const insertTaskNoteSchema = createInsertSchema(taskNotes);
export const selectTaskNoteSchema = createSelectSchema(taskNotes);

export type TaskNote = typeof taskNotes.$inferSelect;
export type InsertTaskNote = typeof taskNotes.$inferInsert;

// User schemas with validation
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email format"),
  name: z.string().min(1, "Name is required"),
});

export const selectUserSchema = createSelectSchema(users);

// Types - keep existing and add new ones
export type Email = typeof emails.$inferSelect;
export type InsertEmail = typeof emails.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DraftActivity = typeof draftActivities.$inferSelect;
export type InsertDraftActivity = typeof draftActivities.$inferInsert;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = typeof emailAccounts.$inferInsert;

// New types
export type Column = typeof columns.$inferSelect;
export type InsertColumn = typeof columns.$inferInsert;
export type TaskAction = typeof taskActions.$inferSelect;
export type InsertTaskAction = typeof taskActions.$inferInsert;
export type WaitingTask = typeof waitingTasks.$inferSelect;
export type InsertWaitingTask = typeof waitingTasks.$inferInsert;
export type FollowUpEmail = typeof followUpEmails.$inferSelect;
export type InsertFollowUpEmail = typeof followUpEmails.$inferInsert;
export type TaskHistory = typeof taskHistory.$inferSelect;
export type InsertTaskHistory = typeof taskHistory.$inferInsert;
export type DailySummary = typeof dailySummaries.$inferSelect;
export type InsertDailySummary = typeof dailySummaries.$inferInsert;
export type ProcessedEmail = typeof processedEmails.$inferSelect;
export type InsertProcessedEmail = typeof processedEmails.$inferInsert;
export type WebhookNotification = typeof webhookNotifications.$inferSelect;
export type InsertWebhookNotification = typeof webhookNotifications.$inferInsert;