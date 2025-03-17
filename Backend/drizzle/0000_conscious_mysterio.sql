CREATE TABLE "columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "draft_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" integer NOT NULL,
	"email_id" text,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"gmail_draft_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email_address" text NOT NULL,
	"provider" text NOT NULL,
	"is_connected" boolean DEFAULT false,
	"last_sync" timestamp,
	"tokens" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"gmail_id" text NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"enhanced_subject" text,
	"sender" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"category" text NOT NULL,
	"ai_summary" text,
	"metadata" jsonb,
	"is_processed" boolean DEFAULT false,
	"needs_draft_processing" boolean DEFAULT false,
	"draft_processed_at" timestamp,
	CONSTRAINT "emails_gmail_id_unique" UNIQUE("gmail_id")
);
--> statement-breakpoint
CREATE TABLE "follow_up_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"email_subject" text NOT NULL,
	"email_content" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_time" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "processed_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"history_id" text NOT NULL,
	"processed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"action_text" text NOT NULL,
	"is_completed" boolean DEFAULT false,
	"position" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email_id" text,
	"account_id" integer,
	"title" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text,
	"team_name" text,
	"column_id" integer,
	"position" integer,
	"description" text,
	"brief_text" text,
	"ai_summary" text,
	"category" text DEFAULT 'Other',
	"status" text DEFAULT 'Inbox' NOT NULL,
	"priority" text DEFAULT 'medium',
	"due_date" text,
	"received_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"oauth_token" text,
	"contextual_drafting_enabled" boolean DEFAULT false,
	"action_item_conversion_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "waiting_tasks" (
	"task_id" integer PRIMARY KEY NOT NULL,
	"waiting_since" timestamp NOT NULL,
	"waiting_time" text NOT NULL,
	"waiting_for" text,
	"reminder_sent" boolean DEFAULT false,
	"last_reminder_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "draft_activities" ADD CONSTRAINT "draft_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_activities" ADD CONSTRAINT "draft_activities_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_activities" ADD CONSTRAINT "draft_activities_email_id_emails_gmail_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("gmail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_emails" ADD CONSTRAINT "follow_up_emails_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_notifications" ADD CONSTRAINT "processed_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_actions" ADD CONSTRAINT "task_actions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_email_id_emails_gmail_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("gmail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_tasks" ADD CONSTRAINT "waiting_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;