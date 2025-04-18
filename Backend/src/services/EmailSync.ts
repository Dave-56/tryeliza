import { db } from '../db/index';
import { eq, and } from 'drizzle-orm';
import { emailAccounts, users } from '../db/schema';
import { GoogleService } from './Google/GoogleService';
import { EmailProcessingService } from './Email/EmailProcessingService';
import { EmailSummaryService } from './Summary/EmailSummaryService';
import { EmailThread } from '../Types/model';
import { AgentService } from './Agent/AgentService';
import { EmailThreadAnalysisService } from './Agent/email-thread-analysis';
import ThreadDebugLogger from '../utils/ThreadDebugLogger';

interface SyncResult {
  synced: number;
  processed: number;
  failed: number;
}

export class EmailSyncService {
  private emailProcessingService: EmailProcessingService;
  private emailThreadAnalysisService: EmailThreadAnalysisService;
  private emailSummaryService: EmailSummaryService;

  constructor(private agentService: AgentService) {
    this.emailProcessingService = new EmailProcessingService();
    this.emailThreadAnalysisService = new EmailThreadAnalysisService(agentService);
    this.emailSummaryService = new EmailSummaryService(agentService);
  }

    async syncEmails(userId: string, accountId?: number, period?: 'morning' | 'evening'): Promise<SyncResult> {
    // ThreadDebugLogger.log('[EmailSyncService.syncEmails] called', {
    //   userId,
    //   accountId,
    //   period,
    //   stack: new Error().stack,
    // });
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

          // OPTIMIZATION: Generate summaries first using the already fetched threads
          try {
            // Get the user's timezone for proper period determination
            let currentPeriod = period;
            if (!currentPeriod) {
              // If period is not specified, determine it based on user's timezone
              const userTimezone = user.timezone || 'UTC';
              const userLocalTime = new Date(new Date().toLocaleString('en-US', { timeZone: userTimezone }));
              currentPeriod = userLocalTime.getHours() < 16 ? 'morning' : 'evening';
              console.log(`Determined period '${currentPeriod}' based on user's timezone (${userTimezone})`);
            }
            
            // Pass the already fetched threads to avoid redundant Gmail API calls
            const summaries = await this.emailSummaryService.generateDailySummaryFromThreads(
              userId, 
              currentPeriod, 
              threads
            );
            
            console.log("Generated summaries for account:", account.email_address, 
              summaries ? "Summary generated successfully" : "No summary generated");

          } catch (error) {
            console.error("Error generating summaries:", error);
            // Continue with individual thread processing even if summary generation fails
          }

          // Process all threads in batches of 20
          for (let i = 0; i < threads.length; i += 20) {
            const threadsToProcess = threads.slice(i, Math.min(i + 20, threads.length));
            
            try {
              // Process individual threads for task extraction
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
            } catch (batchError) {
              console.error("Error processing batch:", batchError);
              stats.failed += threadsToProcess.length;
            }
          }
          
          console.log("Email sync complete for account:", account.email_address, stats);
              // Update historyId using profile from GoogleServices
          const historyId = await googleServices.getLatestHistoryId();
          await db.update(emailAccounts)
          .set({ 
            [emailAccounts.last_sync.name]: new Date(), 
            [emailAccounts.history_id.name]: historyId 
          })
          .where(eq(emailAccounts.id, account.id));
        } catch (error) {
          console.error("Error updating historyId:", error);
        }
      }
      return { ...stats };
    } catch (error) {
      console.error("Error in email sync:", error);
      throw error;
    }
  }
}

export const emailSyncService = new EmailSyncService(new AgentService());