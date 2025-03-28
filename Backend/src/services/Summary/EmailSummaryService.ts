// EmailSummaryService.ts
import { db } from '../../db/index.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { CategorySummary } from './types'
import { users, EmailAccount, emailAccounts, dailySummaries, emails, processedEmails, tasks, DailySummary } from '../../db/schema.js';
import { EmailProcessingService } from '../Email/EmailProcessingService';
import { SummarizationResponse, EmailThread, EmailMessage } from '../../Types/model.js';
import { emailSyncService } from '../EmailSync.js';

export class EmailSummaryService {
  private emailProcessingService: EmailProcessingService;
    
  constructor() {
    this.emailProcessingService = new EmailProcessingService();
  }

  async generateDailySummary(userId: string, period: 'morning' | 'evening') {
    // Start a transaction
    return await db.transaction(async (tx) => {
      try {
        // Get user's timezone preference
        const user = await tx.query.users.findFirst({
          where: eq(users.id, userId)
        });
        
        // Use user's timezone or default to UTC if user not found
        const timezone = user?.timezone || 'UTC';
        
        // Calculate time range based on period
        const timeRange = this.calculateTimeRange(period, timezone);
        
        // Get email accounts for user
        const accounts = await tx.query.emailAccounts.findMany({ 
          where: eq(emailAccounts.user_id, userId)
        });
        
        // First, sync new emails for all accounts to ensure we have the latest data
        try {
          console.log(`Syncing emails for user ${userId} before generating ${period} summary`);
          
          // If we have accounts, sync each one individually to better handle errors
          if (accounts.length > 0) {
            for (const account of accounts) {
              try {
                console.log(`Syncing account ${account.id} (${account.email_address})`);
                await emailSyncService.syncEmails(userId, account.id, period);
              } catch (accountSyncError) {
                console.error(`Error syncing account ${account.id}:`, accountSyncError);
                // Continue with next account
              }
            }
          }
           //else {
          //   // Fallback: sync all accounts if the accounts array is empty for some reason
          //   await emailSyncService.syncEmails(userId, undefined, period);
          // }
          
          console.log(`Email sync completed for user ${userId}`);
        } catch (syncError) {
          console.error(`Error syncing emails for user ${userId}:`, syncError);
          // Continue with summary generation even if sync fails
          // This ensures we at least generate a summary with existing data
        }
        
        // Get threads for the time range (now with freshly synced data)
        const threads = await this.getThreadsForTimeRange(accounts, timeRange, userId, period);


        // Instead of generating a new summary, retrieve the one created during sync
        const summary = await this.getLatestDailySummary(userId);

        if(!summary) {
          console.log(`No recent summary found for user ${userId} in the specified time range`)
          const newSummary = await this.emailProcessingService.summarizeThreads(threads, userId);
          await this.storeSummary(tx, userId, period, newSummary);
          return newSummary;
        }
        return summary;
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
  
  private async getThreadsForTimeRange(accounts: EmailAccount[], timeRange: { start: Date, end: Date }, userId: string, period: 'morning' | 'evening'): Promise<EmailThread[]> {
    // Logic to fetch threads for the given time range
    const threads: EmailThread[] = [];
    let timeRangeEmailCount = 0;
    let unprocessedEmailCount = 0;
    
    console.log(`Fetching emails in time range: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`);
    
    for (const account of accounts) {
      try {
        // Convert Date objects to ISO strings for the SQL query
        const startISO = timeRange.start.toISOString();
        const endISO = timeRange.end.toISOString();
        
        console.log(`Querying emails for account ${account.id} (${account.email_address}) in time range`);
        
        // Query emails and their associated tasks for this account within the time range
        const emailsInRange = await db.query.emails.findMany({
          where: and(
            eq(emails.account_id, account.id),
            sql`${emails.received_at} >= ${startISO}`,
            sql`${emails.received_at} <= ${endISO}`
          ),
          with: {
            tasks: true // Include associated tasks
          },
          orderBy: [desc(emails.received_at)]
        });
        
        timeRangeEmailCount += emailsInRange.length;
        console.log(`Found ${emailsInRange.length} emails for account ${account.id} in time range`);
        
        // Group emails by thread_id
        const threadMap = new Map<string, EmailMessage[]>();
        
        for (const email of emailsInRange) {
          // Get threadId from metadata
          const metadata = email.metadata as { threadId?: string } || {};
          const threadId = metadata.threadId || email.gmail_id;
          
          if (!threadMap.has(threadId)) {
            threadMap.set(threadId, []);
          }
          
          // Convert DB email to EmailMessage format
          const message: EmailMessage = {
            id: email.gmail_id,
            threadId: threadId,
            snippet: email.metadata?.snippet || '',
            internalDate: email.metadata?.internalDate || email.received_at?.getTime().toString() || '',
            headers: {
              subject: email.subject || '',
              from: email.sender || '',
              to: '', 
              date: email.received_at?.toISOString() || ''
            },
            body: '',
            // Add task information if this email has an associated task
            task: email.tasks?.[0] ? {
              id: email.tasks[0].id,
              title: email.tasks[0].title,
              status: email.tasks[0].status,
              priority: email.tasks[0].priority,
              due_date: email.tasks[0].due_date?.toISOString(),
              description: email.tasks[0].description
            } : undefined
          };
          
          threadMap.get(threadId)?.push(message);
        }

        // Include both time-based emails and webhook-processed emails that haven't been included in a summary yet
        console.log(`Querying unprocessed emails for account ${account.id} that haven't been included in a summary yet`);
        const processedEmailResults = await db
          .select({
            emails: emails,
            processedEmails: processedEmails,
            tasks: tasks
          })
          .from(emails)
          .innerJoin(processedEmails, eq(emails.gmail_id, processedEmails.email_id))
          .leftJoin(tasks, eq(emails.gmail_id, tasks.email_id))  // Include tasks
          .where(and(
            eq(emails.user_id, userId),
            eq(emails.account_id, account.id),
            eq(processedEmails.included_in_summary, false)
          ));
        
        unprocessedEmailCount += processedEmailResults.length;
        console.log(`Found ${processedEmailResults.length} unprocessed emails for account ${account.id} that haven't been included in a summary yet`);
        
        // Process these emails and add them to the threadMap
        for (const result of processedEmailResults) {
          const email = result.emails;
          const task = result.tasks;
          
          const metadata = email.metadata as { threadId?: string } || {};
          const threadId = metadata.threadId || email.gmail_id;
          
          if (!threadMap.has(threadId)) {
            threadMap.set(threadId, []);
          }
          
          const message: EmailMessage = {
            id: email.gmail_id,
            threadId: threadId,
            snippet: email.metadata?.snippet || '',
            internalDate: email.metadata?.internalDate || email.received_at?.getTime().toString() || '',
            headers: {
              subject: email.subject || '',
              from: email.sender || '',
              to: '',
              date: email.received_at?.toISOString() || ''
            },
            body: '',
            // Add task information if this email has an associated task
            task: task ? {
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              due_date: task.due_date?.toISOString(),
              description: task.description
            } : undefined
          };
          
          threadMap.get(threadId)?.push(message);
        }
        
        // After processing, mark these emails as included in summary
        if (processedEmailResults.length > 0) {
          const emailIds = processedEmailResults.map(result => result.emails.gmail_id);
          
          await db.update(processedEmails)
            .set({
              included_in_summary: true,
              summary_period: period
            })
            .where(
              and(
                eq(processedEmails.user_id, userId),
                eq(processedEmails.account_id, account.id),
                eq(processedEmails.included_in_summary, false),
                inArray(processedEmails.email_id, emailIds)
              )
            );
        }
        
        // Convert threadMap to array of EmailThread objects
        for (const [threadId, messages] of threadMap.entries()) {
          threads.push({
            id: threadId,
            messages: messages
          });
        }
        
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        // Continue with next account
      }
    }
    
    console.log(`Total emails found: ${timeRangeEmailCount} in time range, ${unprocessedEmailCount} unprocessed`);
    return threads;
  }
  
  private async storeSummary(tx: any, userId: string, period: 'morning' | 'evening', summary: SummarizationResponse) {
    // Get user's timezone or default to system timezone
    const userTimezone = await this.getUserTimezone(tx, userId);
    
    // Create date string in the user's timezone using en-CA locale for YYYY-MM-DD format
    const now = new Date();
    const summaryDateStr = this.formatDateInTimezone(now, userTimezone);
    
    console.log(`Creating summary with date ${summaryDateStr} using timezone ${userTimezone}`);
    
    // Create a sanitized version of the summary
    const sanitizedSummary = {
      ...summary,
      generatedAt: summary.generatedAt || now
    };
    
    // Check if a summary already exists for this user, date, and period
    const existingSummary = await this.findExistingSummary(tx, userId, summaryDateStr, period);
    
    if (existingSummary) {
      console.log(`Updating existing summary for user ${userId}, date ${summaryDateStr}, period ${period}`);
      
    // Merge existing and new summaries
    const mergedCategories = await this.mergeSummaries(
      existingSummary.categories_summary || [],
      sanitizedSummary.categories || []
    );
    
    // Calculate email count from merged categories
    const emailCount = this.calculateEmailCount(mergedCategories);
    
    // Update with merged data
    await tx.update(dailySummaries)
      .set({
        last_run_at: now,
        email_count: emailCount,
        [dailySummaries.categories_summary.name]: mergedCategories,
        [dailySummaries.status.name]: 'completed',
        updated_at: now,
        timezone: userTimezone
      })
      .where(and(
        eq(dailySummaries.user_id, userId),
        eq(dailySummaries.summary_date, summaryDateStr),
        eq(dailySummaries.period, period)
      ));
    } else {
      console.log(`Creating new summary for user ${userId}, date ${summaryDateStr}, period ${period}`);
      
      const categories = sanitizedSummary.categories || [];
      
      // Insert a new summary
      await tx.insert(dailySummaries).values({
        [dailySummaries.user_id.name]: userId,
        [dailySummaries.summary_date.name]: summaryDateStr,
        [dailySummaries.period.name]: period,
        [dailySummaries.scheduled_time.name]: period === 'morning' ? '07:00:00' : '16:00:00',
        [dailySummaries.last_run_at.name]: now,
        [dailySummaries.email_count.name]: this.calculateEmailCount(categories),
        [dailySummaries.categories_summary.name]: categories,
        [dailySummaries.status.name]: 'completed',
        [dailySummaries.timezone.name]: userTimezone
      });
    }
  }

  private calculateEmailCount(categories: CategorySummary[]): number {
    return categories.reduce((count, category) => 
      count + (category.summaries?.length || 0), 0);
  }

  private async mergeSummaries(existing: CategorySummary[], newData: CategorySummary[]): Promise<CategorySummary[]> {
    // Create a merged summary by combining categories
    const mergedSummary = {};
    
    // First, add all existing categories
    for (const category of existing) {
      mergedSummary[category.category] = category.summaries || [];
    }
    
    // Then, add new summaries, avoiding duplicates by message ID
    for (const category of newData) {
      if (!mergedSummary[category.category]) {
        mergedSummary[category.category] = [];
      }
      
      // Add only new items that don't exist in the current category
      for (const item of category.summaries) {
        const isDuplicate = mergedSummary[category.category].some(
          existing => existing.gmail_id === item.gmail_id
        );
        
        if (!isDuplicate) {
          mergedSummary[category.category].push(item);
        }
      }
    }
    
    // Sort items in each category by priority_score
    for (const category in mergedSummary) {
      if (mergedSummary[category].length > 0) {
        mergedSummary[category].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
      }
    }
    
    // Convert back to array format
    return Object.keys(mergedSummary).map(category => ({
      category,
      count: mergedSummary[category].length,
      summaries: mergedSummary[category]
    }));
  }

  /**
   * Stores a summary generated during email sync
   * @param userId The user ID
   * @param summary The generated summary
   * @param providedPeriod The period of the summary (morning or evening)
   */
  async storeSummaryFromSync(userId: string, summary: any, providedPeriod?: 'morning' | 'evening') {
    try {
      console.log(`storeSummaryFromSync called with providedPeriod: ${providedPeriod}`);
      console.log('Raw LLM summary structure:', JSON.stringify(summary, null, 2));
      
      const emailIds = summary.categories
        .flatMap(category => category.summaries.map(summary => summary.messageId))
        .filter(id => id); // Filter out any undefined/null IDs

      // Look up sender information for these emails
      const emailSenders = emailIds.length > 0 
        ? await db.query.emails.findMany({
            where: inArray(emails.gmail_id, emailIds),
            columns: {
              gmail_id: true,
              sender: true
            }
          })
        : [];

      // Create a map for quick lookup
      const senderMap = new Map(
        emailSenders.map(email => [email.gmail_id, email.sender])
      );

      // Prepare the data for categories summary
      // Get the user's timezone or default to system timezone
      const userTimezone = await this.getUserTimezone(db, userId);
      
      // Create a date object in the user's timezone
      const now = new Date();
      
      // Format the date as YYYY-MM-DD in the user's timezone
      const today = this.formatDateInTimezone(now, userTimezone);
      
      // Determine the period - use provided period if available, otherwise calculate based on time
      let period: 'morning' | 'evening';
      if (providedPeriod && (providedPeriod === 'morning' || providedPeriod === 'evening')) {
        period = providedPeriod;
        console.log(`Using provided period: ${period}`);
      } else {
        // Get the current hour in the user's timezone
        const currentHour = new Date(now.toLocaleString('en-US', { timeZone: userTimezone })).getHours();
        period = currentHour >= 15 ? 'evening' : 'morning'; // Set to evening if after 3 PM
        console.log(`Calculated period based on time (${currentHour}): ${period}`);
      }
      
      console.log(`Final period being used for summary: ${period}`);
      
      console.log(`Using date ${today} and period ${period}`);
      
      // Group summaries by category
      const summariesByCategory = new Map<string, Array<{
        title: string;
        headline: string;
        messageId: string;
        priorityScore: number;
        insights?: {
          key_highlights?: string[];
          why_this_matters?: string;
          next_step?: string[];
        };
      }>>();
      
      // Initialize the map with empty arrays for each category
      const categories = [
        'Important Info', 'Calendar', 'Payments', 
        'Travel', 'Newsletters', 'Notifications'
      ];
      
      categories.forEach(category => {
        summariesByCategory.set(category, []);
      });

      // Log categories from LLM before processing
      console.log('Categories from LLM:', summary.categories.map(c => c.title));
      console.log('Raw summariesByCategory map:', Array.from(summariesByCategory.entries()).map(([key, value]) => key));
      
      // Group summaries by their category
      summary.categories.forEach(category => {
        // Use title instead of name for the category
        const categoryTitle = category.title;
        const categorySummaries = category.summaries;
        
        if (summariesByCategory.has(categoryTitle)) {
          summariesByCategory.get(categoryTitle)!.push(...categorySummaries);
        } else {
          summariesByCategory.set(categoryTitle, categorySummaries);
        }
      });
      
      // Sort summaries by priority score within each category (highest first)
      for (const [category, summaries] of summariesByCategory.entries()) {
        if (summaries.length > 0) {
          summariesByCategory.set(
            category, 
            summaries.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
          );
        }
      }
      
      // Convert to the format expected by the database
      const categoriesSummaryData = Array.from(summariesByCategory.entries())
        .filter(([_, summaries]) => summaries.length > 0) // Only include categories with summaries
        .map(([category, summaries]) => ({
          category,
          count: summaries.length,
          summaries: summaries.map(summary => {
            // Access the messageId from the summary object
            const gmail_id = summary.messageId || '';
            // Look up sender from our map, or use empty string if not found
            const sender = senderMap.get(gmail_id) || '';
            return {
              subject: summary.title || 'No Subject',
              gmail_id,
              sender,
              received_at: new Date().toISOString(),
              headline: summary.headline || '',
              priority_score: summary.priorityScore || 50, // Default to medium priority if not provided
              insights: summary.insights // Store the structured insights
            };
          })
        }));

      // Log categories after processing
      console.log('Categories after processing:', categoriesSummaryData.map(c => c.category));

      // Check if a summary already exists for today
      const existingSummary = await this.findExistingSummary(db, userId, today, period);

      if(existingSummary) {
          console.log('Existing summary categories:', existingSummary.categories_summary && Array.isArray(existingSummary.categories_summary) 
            ? existingSummary.categories_summary.map(c => c.category) 
            : 'No existing categories');

          // Merge with existing summary data
          const mergedCategories = await this.mergeSummaries(
            existingSummary.categories_summary || [],
            categoriesSummaryData
          );

          console.log('Categories after merging:', mergedCategories.map(c => c.category));
          
          // Update the existing summary with merged data
          await db.update(dailySummaries)
          .set({
              [dailySummaries.categories_summary.name]: mergedCategories,
              [dailySummaries.status.name]: 'completed',
              [dailySummaries.updated_at.name]: new Date() 
          })
          .where(and(
              eq(dailySummaries.user_id, userId),
              eq(dailySummaries.summary_date, today),
              eq(dailySummaries.period, period)
          ));

          console.log("Daily summary updated with merged data for user:", userId, "date:", today, "period:", period);
      } else {
          // Insert a new summary
          await db.insert(dailySummaries).values({
              user_id: userId,
              summary_date: today,
              period,
            [dailySummaries.categories_summary.name]: categoriesSummaryData,
            [dailySummaries.status.name]: 'completed',
              timezone: userTimezone,
              cache_duration_hours: 4 // Cache for 4 hours by default
          })
          .onConflictDoUpdate({
              target: [dailySummaries.user_id, dailySummaries.summary_date, dailySummaries.period],
              set: {
                  [dailySummaries.categories_summary.name]: categoriesSummaryData,
                  [dailySummaries.status.name]: 'completed',
                  [dailySummaries.updated_at.name]: new Date()
              }
          });

          console.log("Daily summary saved/updated for user:", userId, "date:", today, "period:", period);
      }
      
      return true;
    } catch (error) {
      console.error("Error saving daily summary:", error);
      // Continue execution even if summary saving fails
      return false;
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

  private async getUserTimezone(tx: any, userId: string): Promise<string> {
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

  private async findExistingSummary(tx: any, userId: string, date: string, period: string) {
    return tx.query.dailySummaries.findFirst({
      where: and(
        eq(dailySummaries.user_id, userId),
        eq(dailySummaries.summary_date, date),
        eq(dailySummaries.period, period)
      )
    });
  }

// Add to EmailSync.ts
// async syncOutlookEmails(userId: string, accountId: number) {
//     const account = await emailAccountRepository.findById(accountId);
//     if (!account || account.provider !== EmailProvider.OUTLOOK) {
//         throw new Error('Invalid Outlook account');
//     }
    
//     // Refresh token if needed
//     const outlookServices = new OutlookServices(
//         account.tokens.access_token,
//         account.tokens.refresh_token
//     );
    
//     // Fetch and process emails
//     const emails = await outlookServices.fetchEmails(account.last_sync);
    
//     // Process and store emails similar to Google implementation
// }
}