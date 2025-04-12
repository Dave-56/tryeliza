// EmailSummaryService.ts
import { db } from '../../db/index.js';
import { eq, and, desc, sql, inArray, or, gte, lte } from 'drizzle-orm';
import { users,EmailAccount, emails, emailAccounts, dailySummaries, DailySummary, categorizedDailySummaries, processedEmails, tasks } from '../../db/schema.js';
import { EmailCategory } from './types';
import { EmailThread, EmailMessage } from '../../Types/model';
import { emailSyncService } from '../EmailSync.js';
import { AgentService } from '../Agent/AgentService.js';
import { CategorizedDailySummaryRepository } from '../../repositories/CategorizedDailySummaryRepository';
import { EmailThreadAnalysisService } from '../../services/Agent/email-thread-analysis';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger'; // Import ThreadDebugLogger
import { GoogleService } from '../Google/GoogleService'; // Import GoogleService

export class EmailSummaryService {
  private categorizedDailySummaryRepository: CategorizedDailySummaryRepository;
  private agentService: AgentService;
  private threadAnalysisService: EmailThreadAnalysisService;

  constructor(agentService: AgentService) {
    this.agentService = agentService;
    this.categorizedDailySummaryRepository = new CategorizedDailySummaryRepository();
    this.threadAnalysisService = new EmailThreadAnalysisService(this.agentService);
  }

  async generateDailySummary(userId: string, period: 'morning' | 'evening') {
    // Start a transaction
    return await db.transaction(async (tx) => {
      try {

        const timezone = await this.getUserTimezone(tx, userId);
        
        // Calculate time range based on period
        const timeRange = this.calculateTimeRange(period, timezone);
        
        // Get email accounts for user
        const account = await tx.query.emailAccounts.findFirst({ 
          where: eq(emailAccounts.user_id, userId)
        });
        
        // Get threads for the time range (now with freshly synced data)
        let threads = await this.getThreadsForTimeRange(account, timeRange, userId, period);

        // Gmail Fallback API search
        if(!threads.length) {
          console.log('No threads found in DB, falling back to Gmail API');
          if (account) {
            const googleService = new GoogleService(
              account.tokens.access_token,
              account.tokens.refresh_token,
              account.id.toString()
            );
            const startOfDay = new Date().setHours(0,0,0,0).toString();
            threads = await googleService.getEmailsSinceStartOfDay(startOfDay);
            console.log(`Found ${threads.length} threads from Gmail API fallback`);
          }
        }

        // Only process first 5 threads for testing
        threads = threads.slice(0, 20);
        
        console.log(`Processing ${threads.length} threads for analysis`);
        
        // Debug log thread structure
        // ThreadDebugLogger.log('Thread data before categorization:', {
        //     sampleThread: threads[0] ? {
        //         id: threads[0].id,
        //         messages: threads[0].messages.map(msg => ({
        //             id: msg.id,
        //             subject: msg.headers?.subject,
        //             from: msg.headers?.from,
        //             bodyLength: msg.body?.length || 0,
        //             hasContent: !!msg.body,
        //             snippet: msg.snippet || 'No preview available',
        //             body: msg.body || 'No content available'
        //         }))
        //     } : 'No threads found',
        //     threadCount: threads.length
        // });

        // Use EmailThreadAnalysisService for categorization and summarization
        const analysisService = new EmailThreadAnalysisService(this.agentService);
        
        // Categorize all threads
        const allThreadsCategorized = await analysisService.categorizeThreadBatch(
          threads,
          userId,
          threads.length // total threads expected
        );

        if (!allThreadsCategorized) {
          throw new Error('Failed to categorize all threads');
        }

        // Generate summaries by category
        const summaries = await analysisService.generateSummaries(userId);
        await this.storeCategoryHighlights(userId, {
          summaries: summaries,
          totalProcessed: threads.length
        });

        // ThreadDebugLogger.log('Thread analysis complete', { 
        //   summaries,
        //   totalProcessed: threads.length
        // });

        if(!summaries) {
          console.log(`No recent summary found for user ${userId} in the specified time range`)
          return null; // Or handle this case differently since we should have a summary from sync
        }
        return summaries;
      } catch (error) {
        console.error('Error generating daily summary:', error);
        throw error;
      }
    });
  }
  
  private calculateTimeRange(period: 'morning' | 'evening', timezone: string): { start: Date, end: Date } {
    // Get current date in the user's timezone
    const now = new Date();
    const today = new Date(now.toLocaleDateString('en-US', { timeZone: timezone }));
    
    // Set start and end times based on period
    let start: Date, end: Date;
    
    if (period === 'morning') {
      // For morning summary (7 AM):
      // Start: Previous day 4 PM (or whenever the last evening summary ran)
      // End: Current day 7 AM
      const previousDay = new Date(today);
      previousDay.setDate(previousDay.getDate() - 1);
      previousDay.setHours(16, 0, 0, 0); // 4 PM previous day
      
      const morningToday = new Date(today);
      morningToday.setHours(7, 0, 0, 0); // 7 AM today
      
      start = previousDay;
      end = morningToday;
    } else {
      // For evening summary (4 PM):
      // Start: Current day 7 AM (or whenever the last morning summary ran)
      // End: Current day 4 PM
      const morningToday = new Date(today);
      morningToday.setHours(7, 0, 0, 0); // 7 AM today
      
      const eveningToday = new Date(today);
      eveningToday.setHours(16, 0, 0, 0); // 4 PM today
      
      start = morningToday;
      end = eveningToday;
    }
    
    return { start, end };
  }
  
  /**
   * Stores category highlights from LLM
   * @param userId The user ID
   * @param summaries The summaries from thread analysis
   * @param providedPeriod Optional period override (morning/evening)
   * @returns Success status
   */
  public async storeCategoryHighlights(
    userId: string, 
    summaries: { 
      summaries: { 
        [key in EmailCategory]?: { 
          key_highlights: string; 
          category_name: EmailCategory; 
        } 
      };
      totalProcessed: number 
    },
    providedPeriod?: 'morning' | 'evening'
  ): Promise<boolean> {
    try {
      // Get user timezone
      const userTimezone = await this.getUserTimezone(db, userId);
      
      // Create date in user's timezone
      const userDate = new Date(new Date().toLocaleString('en-US', { timeZone: userTimezone }));
      
      // Format the date as YYYY-MM-DD in the user's timezone
      const today = this.formatDateInTimezone(userDate, userTimezone);

      // Determine the period - use provided period if available, otherwise calculate based on time
      let period: 'morning' | 'evening';
      if (providedPeriod && (providedPeriod === 'morning' || providedPeriod === 'evening')) {
        period = providedPeriod;
        console.log(`Using provided period: ${period}`);
      } else {
        // Get the current hour in the user's timezone
        const currentHour = userDate.getHours();
        period = currentHour >= 15 ? 'evening' : 'morning'; // Set to evening if after 3 PM
        console.log(`Calculated period based on time (${currentHour}): ${period}`);
      }
      
      console.log(`Using date ${today} and period ${period}`);

      // Store using repository
      try {
        await this.categorizedDailySummaryRepository.upsertCategorySummaries(
          userId,
          userDate, // Use our timezone-aware date instead of new Date()
          period,
          summaries.summaries,
          userTimezone.toString() // Convert timezone object to string
        );
        console.log('Successfully stored category highlights');
      } catch (dbError) {
        console.error('Error storing category highlights in database:', dbError);
        throw dbError; // Re-throw to be caught by outer try-catch
      }

      return true;
    } catch (error) {
      console.error('Error storing category highlights:', error);
      return false;
    }
  }

  /**
   * Generate summary for a single email thread
   */
  public async generateSummary(account: EmailAccount, emailThread: EmailThread): Promise<string | null> {
    try {
      // Use the thread analysis service to generate summary
      const summary = await this.threadAnalysisService.summarizeThread(emailThread);
      
      // Store the summary in the database
      if (summary) {
        await db.update(emails)
          .set({ 
            ai_summary: summary,
          } as any) // temporary type assertion until Drizzle types are fixed
          .where(and(
            eq(emails.gmail_id, emailThread.messages[0].id),
            eq(emails.account_id, account.id)
          ));
      }

      return summary;
    } catch (error) {
      console.error('Error generating summary:', error);
      return null;
    }
  }

  /**
   * Gets the latest non-expired daily summary for a user
   * @param userId The user ID
   * @returns The latest summary or null if none exists or is expired
   */

  async getLatestDailySummary(userId: string): Promise<DailySummary | null> {
      // Get the latest non-expired summary for the user
      const latestSummary = await db.query.dailySummaries.findFirst({
      where: and(
          eq(dailySummaries.user_id, userId),
          eq(dailySummaries.status, 'completed')
      ),
      orderBy: [desc(dailySummaries.created_at)],
      with: {
          user: true
      }
      });

      if (!latestSummary) {
      return null;
      }

      // Check if summary is expired
      if (!latestSummary.created_at) {
          return null;
      }
      
      const createdAt = new Date(latestSummary.created_at);
      // Use default of 24 hours if cache_duration_hours is null
      const cacheDuration = latestSummary.cache_duration_hours ?? 24;
      const expiryTime = new Date(createdAt.getTime() + (cacheDuration * 60 * 60 * 1000));
      const now = new Date();
      
      if (now > expiryTime) {
          return null;
      }

      return latestSummary;
  }

  public async findExistingSummary(tx: any, userId: string, date: string, period: string) {
    console.log('Finding existing summary with params:', { userId, date, period });
    try {
      // Get user's timezone
      const userTimezone = await this.getUserTimezone(tx, userId);
       // Add timezone debugging information

      console.log("[TIMEZONE DEBUG] Current user timezone:", userTimezone);

      // Use tx directly instead of going through the repository
      const result = await tx.select()
        .from(categorizedDailySummaries)
        .where(
          and(
            eq(categorizedDailySummaries.user_id, userId),
            eq(categorizedDailySummaries.summary_date, date),
            eq(categorizedDailySummaries.period, period)
          )
        )
        .execute();
      console.log('Query result:', result);
      
      const DEFAULT_CATEGORY_MESSAGES = {
        "Important Info": "Nothing urgent at the moment - Looks like you can actually enjoy your coffee while it's still hot.",
        "Calendar": "Your schedule's looking clear as a summer sky - Time to plan something fun or just enjoy the peace?",
        "Payments": "No money moves happening right now - Your wallet is taking a well-deserved break.",
        "Travel": "No travel plans just yet - Paris is lovely this time of year!",
        "Newsletters": "Your newsletters are taking a breather - Maybe they're off reading each other?",
        "Notifications": "All quiet on the notification front - Enjoy the digital silence."
      } as const;

      const CATEGORIES = Object.keys(DEFAULT_CATEGORY_MESSAGES);

      // Create a map of existing category summaries from the result
      const existingCategories = result[0]?.categories_summary?.reduce((map, category) => {
        if (category.category_name && category.key_highlights) {
          map.set(category.category_name, category.key_highlights);
        }
        return map;
      }, new Map<string, string>()) || new Map<string, string>();
      
      console.log('Result categories:', result[0]?.categories_summary);
      console.log('Existing categories:', Object.fromEntries(existingCategories));
      
      // Merge existing data with defaults for missing categories
      const categories_summary = CATEGORIES.map(category => {
        const existingHighlight = existingCategories.get(category);
        return {
          category_name: category,
          key_highlights: existingHighlight !== undefined 
            ? existingHighlight 
            : DEFAULT_CATEGORY_MESSAGES[category as keyof typeof DEFAULT_CATEGORY_MESSAGES]
        };
      });

      // If we have an existing record, use its last_run_at value
      // Otherwise, calculate it based on the period
      const date_obj = new Date(date);
      if (period === 'morning') {
        date_obj.setHours(7, 0, 0, 0);
      } else {
        date_obj.setHours(16, 0, 0, 0);
      }
      const last_run_at = result[0]?.last_run_at || date_obj;

      return {
        user_id: userId,
        summary_date: date,
        period: period,
        timezone: userTimezone,
        categories_summary,
        total_threads_processed: result.length || 0,
        status: 'completed' as const,
        created_at: new Date(),
        updated_at: new Date(),
        last_run_at
      };
    } catch (error) {
      console.error('Error finding existing summary:', error);
      return null;
    }
  }

  public async getUserTimezone(tx: any, userId: string): Promise<string> {
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { timezone: true }
    });
    return user?.timezone || 'UTC';
  }

  private formatDateInTimezone(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    }).format(date);
  }

  private async getThreadsForTimeRange(account: EmailAccount | null, timeRange: { start: Date, end: Date }, userId: string, period: 'morning' | 'evening'): Promise<EmailThread[]> {
    let timeRangeEmailCount = 0;
    let unprocessedEmailCount = 0;
    const threads: EmailThread[] = [];
    
    // We only support single account for now
    if (!account) {
      console.log('No account found');
      return [];
    }

    try {
      const startISO = timeRange.start.toISOString();
      const endISO = timeRange.end.toISOString();
      
      console.log(`[Thread Debug] Fetching emails for time range: ${startISO} to ${endISO}`);
      
      // Query emails and their associated tasks
      const emailsInRange = await db.query.emails.findMany({
        where: and(
          eq(emails.account_id, account.id),
          gte(emails.received_at, timeRange.start),
          lte(emails.received_at, timeRange.end)
        ),
        with: {
          tasks: true
        },
        orderBy: [desc(emails.received_at)]
      });
      
      timeRangeEmailCount += emailsInRange.length;
      console.log(`Found ${emailsInRange.length} emails for account ${account.id} in time range`);
      
      // Debug log raw email structure
      // ThreadDebugLogger.log('Raw emails from database:', {
      //     sampleEmail: emailsInRange[0] ? {
      //         id: emailsInRange[0].gmail_id,
      //         subject: emailsInRange[0].subject,
      //         sender: emailsInRange[0].sender,
      //         metadata: emailsInRange[0].metadata,
      //         hasTask: !!emailsInRange[0].tasks?.length
      //     } : 'No emails found',
      //     emailCount: emailsInRange.length
      // });
      
      // Group emails by thread_id
      const threadMap = new Map<string, EmailMessage[]>();
      
      for (const email of emailsInRange) {
        const metadata = email.metadata as { threadId?: string } || {};
        const threadId = metadata.threadId || email.gmail_id;
        
        if (!threadMap.has(threadId)) {
          threadMap.set(threadId, []);
        }
        
        // Convert DB email to EmailMessage format
        const message: EmailMessage = {
          id: email.gmail_id,
          threadId: threadId,
          internalDate: email.received_at?.getTime().toString() || '',
          headers: {
            subject: email.subject || '',
            from: email.sender || '',
            date: email.received_at?.toISOString() || ''
          },
          task: email.tasks?.[0] ? {
            id: email.tasks[0].id,
            title: email.tasks[0].title,
            status: email.tasks[0].status,
            priority: email.tasks[0].priority,
            due_date: email.tasks[0].due_date?.toISOString(),
            description: email.tasks[0].description
          } : undefined
        };

        // If no AI summary, try to fetch and generate one
        //let emailBody = email.ai_summary;
        // ThreadDebugLogger.log('Thread debug:', {
        //   emailId: email.gmail_id,
        //   hasAiSummary: !!email.ai_summary
        // });
        const thread = await this.fetchGmailThread(account, email.gmail_id);
        message.body = thread?.messages?.[0]?.body || '';
        threadMap.get(threadId)?.push(message);
      }

      // Debug log thread map structure
      // ThreadDebugLogger.log('Thread map after processing emails:', {
      //     sampleThread: Array.from(threadMap.entries())[0] ? {
      //         threadId: Array.from(threadMap.entries())[0][0],
      //         messageCount: Array.from(threadMap.entries())[0][1].length,
      //         messages: Array.from(threadMap.entries())[0][1].map(msg => ({
      //             id: msg.id,
      //             subject: msg.headers?.subject,
      //             from: msg.headers?.from,
      //             bodyLength: msg.body?.length || 0,
      //             hasContent: !!msg.body,
      //             hasTask: !!msg.task
      //         }))
      //     } : 'No threads in map',
      //     totalThreads: threadMap.size
      // });

      // Process unprocessed emails
      const processedEmailResults = await db
        .select({
          emails: emails,
          processedEmails: processedEmails,
          tasks: tasks
        })
        .from(emails)
        .innerJoin(processedEmails, eq(emails.gmail_id, processedEmails.email_id))
        .leftJoin(tasks, eq(emails.gmail_id, tasks.email_id))
        .where(and(
          eq(emails.user_id, userId),
          eq(emails.account_id, account.id),
          or(
            eq(processedEmails.included_in_summary, false),
            and(
              eq(processedEmails.processing_status, 'completed'),
              sql`${processedEmails.processing_result}->>'$.metadata.requires_action' = 'true'`
            )
          )
        ));

      console.log(`[Thread Debug] Found ${processedEmailResults.length} unprocessed emails`);
      
      // Process unprocessed emails
      for (const result of processedEmailResults) {
        const email = result.emails;
        const task = result.tasks;
        
        const metadata = email.metadata as { threadId?: string } || {};
        const threadId = metadata.threadId || email.gmail_id;
        
        if (!threadMap.has(threadId)) {
          threadMap.set(threadId, []);
          console.log(`[Thread Debug] Created new thread ${threadId} for unprocessed email`);
        }
        
        const message: EmailMessage = {
          id: email.gmail_id,
          threadId: threadId,
          internalDate: email.received_at?.getTime().toString() || '',
          headers: {
            subject: email.subject || '',
            from: email.sender || '',
            date: email.received_at?.toISOString() || ''
          },
          task: task ? {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            due_date: task.due_date?.toISOString(),
            description: task.description
          } : undefined
        };

        // If no AI summary, try to fetch and generate one
        let emailBody = email.ai_summary;
        if (!emailBody) {
          const thread = await this.fetchGmailThread(account, email.gmail_id);
          emailBody = thread?.messages?.[0]?.body || '';
        }
        message.body = emailBody;
        threadMap.get(threadId)?.push(message);

        console.log(`[Thread Debug] Added unprocessed message to thread:`, JSON.stringify(message, null, 2));

      }
      
      // Mark emails as included in summary
      if (processedEmailResults.length > 0) {
        const emailIds = processedEmailResults.map(result => result.emails.gmail_id);
        await db.update(processedEmails)
          .set({
            included_in_summary: true,
            summary_period: period
          } as any )
          .where(
            and(
              eq(processedEmails.user_id, userId),
              eq(processedEmails.account_id, account.id),
              eq(processedEmails.included_in_summary, false),
              inArray(processedEmails.email_id, emailIds)
            )
          );
      }
      
      // Convert threadMap to array
      for (const [threadId, messages] of threadMap.entries()) {
        threads.push({
          id: threadId,
          messages: messages
        });
      }

      // Final thread structure debug log
      // ThreadDebugLogger.log('Final thread structure:', {
      //     sampleThread: threads[0] ? {
      //         id: threads[0].id,
      //         messages: threads[0].messages.map(msg => ({
      //             id: msg.id,
      //             subject: msg.headers?.subject,
      //             from: msg.headers?.from,
      //             bodyLength: msg.body?.length || 0,
      //             hasContent: !!msg.body,
      //             hasTask: !!msg.task
      //         }))
      //     } : 'No threads created',
      //     threadCount: threads.length
      // });
        
      } catch (error) {
        console.error(`[Thread Debug] Error processing emails:`, error);
      }
      
    return threads;
  }
    /**
   * Fetch email thread from Gmail if we don't have it in our database
   */
  private async fetchGmailThread(account: EmailAccount, messageId: string): Promise<EmailThread | null> {
    try {
      // Create GoogleService instance with account tokens
      const googleService = new GoogleService(
        account.tokens.access_token,
        account.tokens.refresh_token,
        account.id.toString()
      );

      // Ensure token is valid
      await googleService.ensureValidToken();

      // Get the thread directly
      const thread = await googleService.getThreadById(messageId);
      if (thread && thread.messages.length > 0) {
        // First message in thread has the metadata we need
        const firstMessage = thread.messages[0];
        const emailThread: EmailThread = {
          id: messageId,
          messages: thread.messages.map(msg => ({
            id: msg.id,
            threadId: messageId,
            headers: {
              subject: firstMessage.headers?.subject || '',
              from: firstMessage.headers?.from || '',
              date: firstMessage.headers?.date || ''
            },
            body: msg.content || msg.snippet
          }))
        };

        // Generate summary for this thread
        await this.generateSummary(account, emailThread);
        return emailThread;
      }
      return null;
    } catch (error: any) {
      // Log 404s at debug level since they're expected (emails/threads may be deleted)
      if (error?.status === 404) {
        console.debug(`Gmail thread/email not found: ${messageId}`);
      } else {
        console.error('Error fetching Gmail thread:', error);
      }
      return null;
    }
  }
}
