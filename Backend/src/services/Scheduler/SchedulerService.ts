// SchedulerService.ts
import cron from 'node-cron';
import { db } from '../../db/index';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { EmailSummaryService } from '../Summary/EmailSummaryService.js';

export class SchedulerService {
  public emailSummaryService: EmailSummaryService;

  constructor() {
    this.emailSummaryService = new EmailSummaryService();
  }

  startScheduledJobs() {
    // Morning summary at 7 AM
    cron.schedule('0 7 * * *', async () => {
      console.log('Running morning summary job');
      await this.generateSummariesForAllUsers('morning');
    });
    
    // Evening summary at 4 PM
    cron.schedule('0 16 * * *', async () => {
      console.log('Running evening summary job');
      await this.generateSummariesForAllUsers('evening');
    });

    console.log('Summary scheduler initialized with jobs at 7 AM and 4 PM');
  }
  
  private async generateSummariesForAllUsers(period: 'morning' | 'evening') {
    try {
      // Get all active users
      const activeUsers = await db.query.users.findMany({
        where: eq(users.is_active, true)
      });
      
      console.log(`Generating ${period} summaries for ${activeUsers.length} active users`);
      
      // Generate summaries for each user
      for (const user of activeUsers) {
        try {
          await this.emailSummaryService.generateDailySummary(user.id, period);
          console.log(`Successfully generated ${period} summary for user ${user.id}`);
        } catch (error) {
          console.error(`Failed to generate ${period} summary for user ${user.id}:`, error);
          // Log error but continue with next user
        }
      }
      
      console.log(`Completed ${period} summary generation`);
    } catch (error) {
      console.error(`Failed to run ${period} summary job:`, error);
      // Implement notification to admins if needed
    }
  }

  // Method to manually trigger summary generation for testing
  async manuallyTriggerSummary(period: 'morning' | 'evening') {
    console.log(`Manually triggering ${period} summary generation`);
    await this.generateSummariesForAllUsers(period);
  }
}