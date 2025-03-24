import { db } from '../db/index';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { emailAccounts, users, dailySummaries, emails, DailySummary, tasks, processedEmails } from '../db/schema';
import { GoogleService } from './Google/GoogleService';
import { EmailProcessingService } from './Email/EmailProcessingService';
import { EmailSummaryService } from './Summary/EmailSummaryService';
import { EmailThread, SummarizationResponse } from '../Types/model';
import ThreadDebugLogger from '../utils/ThreadDebugLogger';

interface SyncResult {
  synced: number;
  processed: number;
  failed: number;
  summary?: SummarizationResponse;
}

export class EmailSyncService {
    private emailProcessingService: EmailProcessingService;
    
    constructor() {
        this.emailProcessingService = new EmailProcessingService();
    }
    
    async syncEmails(userId: string, accountId?: number, period?: 'morning' | 'evening'): Promise<SyncResult> {
    try {
      // Fetch active email accounts for the user based on the parameters
      let activeEmailAccounts;

      if (accountId) {
          // If accountId is provided, only fetch that specific account
          activeEmailAccounts = await db.query.emailAccounts.findMany({
            where: and(
              eq(emailAccounts.id, accountId),
              eq(emailAccounts.user_id, userId),
              eq(emailAccounts.is_connected, true)
            )
          });
      }
      else {
        // Otherwise fetch all connected accounts for the user
        activeEmailAccounts = await db.query.emailAccounts.findMany({
            where: and(
              eq(emailAccounts.user_id, userId),
              eq(emailAccounts.is_connected, true)
            )
        });
      }

      console.log("Email accounts:", activeEmailAccounts);

      if (!activeEmailAccounts.length) {
        console.log("No active email accounts found for user:", userId);
        throw new Error("No active email accounts");
      }

      console.log("Starting email sync for user:", userId);

      const stats = { synced: 0, processed: 0, failed: 0 };
      const allThreads: EmailThread[] = [];
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Get user for the summary
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      for (const account of activeEmailAccounts) {
        const tokens = account.tokens;
        if (!tokens || !tokens.access_token || !tokens.refresh_token) {
          console.log("Skipping account due to missing tokens:", account.email_address);
          continue;
        }

        const googleServices = new GoogleService(tokens.access_token, tokens.refresh_token);
        console.log("Fetching today's emails for:", account.email_address);

        try {
          // Get messages from today
          const threads = await googleServices.getEmailsSinceStartOfDay(
            startOfToday.getTime().toString()
          );

          console.log("Messages fetched:", threads.length);

          stats.synced += threads.length;
          // Instead of spread, use forEach to preserve structure
          threads.forEach(thread => {
            // Ensure we preserve the body as a string
            const preservedThread = {
              ...thread,
              messages: thread.messages.map(msg => ({
                ...msg,
                // Convert body to string if it's not already a string
                body: msg.body ? String(msg.body) : ''
              }))
            };
            allThreads.push(preservedThread);
          });



          // Process each thread (limit to first 20)
          const threadsToProcess = threads.slice(0, 20);
          for (const thread of threadsToProcess) {
            try {
              const categorization = await this.emailProcessingService.categorizeEmail(account, thread);
              
              if (categorization) {
                console.log("Processed email thread:", thread.id, "Category:", categorization.isActionRequired ? "Action" : "No Action");
                stats.processed++;
              } else {
                console.log("Skipped thread (already processed or no action):", thread.id);
              }
            } catch (error) {
              console.error("Error processing thread:", thread.id, error);
              stats.failed++;
            }
          }

          // Update historyId using profile from GoogleServices
          const historyId = await googleServices.getLatestHistoryId();
          await db.update(emailAccounts)
            .set({
              history_id: historyId,
              last_sync: new Date()
            })
            .where(eq(emailAccounts.id, account.id));
        } catch (error) {
          console.error("Error fetching emails for account:", account.email_address, error);
          continue;
        }
      }
      
      // Generate summary for all collected threads
      console.log("Generating summary for threads:", allThreads.length);

      // Fetch tasks marked for summary inclusion
      const tasksForSummary = await db
        .select({
          email_id: processedEmails.email_id,
          task: tasks
        })
        .from(processedEmails)
        .innerJoin(tasks, eq(tasks.email_id, processedEmails.email_id))
        .where(and(
          eq(processedEmails.user_id, userId),
          eq(processedEmails.included_in_summary, true)
        ));

      // Create map of email_id to task
      const taskMap = new Map(tasksForSummary.map(t => [t.email_id, t.task]));

      // Add tasks to threads
      const threadsWithTasks = allThreads.map(thread => ({
        ...thread,
        messages: thread.messages.map(msg => ({
          ...msg,
          task: taskMap.get(msg.id) ? {
            ...taskMap.get(msg.id),
            due_date: taskMap.get(msg.id).due_date?.toISOString() || null,
            created_at: taskMap.get(msg.id).created_at?.toISOString() || null,
            updated_at: taskMap.get(msg.id).updated_at?.toISOString() || null,
            received_date: taskMap.get(msg.id).received_date?.toISOString() || null
          } : undefined
        }))
      }));

      const summary = await this.emailProcessingService.summarizeThreads(threadsWithTasks, userId);
      console.log("Summary generated successfully");

      // Save the summary to database
      try {
        // Use EmailSummaryService to store the summary
        const emailSummaryService = new EmailSummaryService();
        await emailSummaryService.storeSummaryFromSync(userId, summary, period);
      } catch (summaryError) {
        console.error("Error saving daily summary:", summaryError);
        // Continue execution even if summary saving fails
      }

      return { ...stats, summary };
    } catch (error) {
      console.error("Error in email sync:", error);
      ThreadDebugLogger.log('Error during email sync', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

export const emailSyncService = new EmailSyncService();