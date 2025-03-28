import cron from 'node-cron';
import { db } from '../../db/index';
import { eq, and } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { EmailSummaryService } from '../Summary/EmailSummaryService.js';

export class SchedulerService {
  public emailSummaryService: EmailSummaryService;
  private activeJobs: Map<string, cron.ScheduledTask>;

  constructor() {
    this.emailSummaryService = new EmailSummaryService();
    this.activeJobs = new Map();
  }

  startScheduledJobs() {
    // Check and update timezone jobs every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Checking for timezone updates...');
      await this.updateTimezoneJobs();
    });

    // Initial setup of timezone jobs
    this.updateTimezoneJobs();
    console.log('Summary scheduler initialized with timezone-aware jobs');
  }
  
  private async updateTimezoneJobs() {
    try {
      // Get all unique timezones from active users
      const result = await db.query.users.findMany({
        where: eq(users.is_active, true),
        columns: {
          timezone: true
        }
      });
      
      const uniqueTimezones = [...new Set(result.map(user => user.timezone || 'UTC'))];
      
      // Stop any jobs for timezones that no longer have users
      for (const [timezone, job] of this.activeJobs.entries()) {
        if (!uniqueTimezones.includes(timezone.replace('-morning', '').replace('-evening', ''))) {
          job.stop();
          this.activeJobs.delete(timezone);
          console.log(`Stopped jobs for inactive timezone: ${timezone}`);
        }
      }
      
      // Create/update jobs for each timezone
      for (const timezone of uniqueTimezones) {
        if (!this.activeJobs.has(`${timezone}-morning`)) {
          this.scheduleJobsForTimezone(timezone);
        }
      }
      
      console.log(`Active timezone jobs updated. Current timezones: ${[...this.activeJobs.keys()].map(key => key.replace('-morning', '').replace('-evening', '')).join(', ')}`);
    } catch (error) {
      console.error('Failed to update timezone jobs:', error);
    }
  }

  private scheduleJobsForTimezone(timezone: string) {
    try {
      // Morning summary at 7 AM in the timezone
      const morningJob = cron.schedule('0 7 * * *', async () => {
        const now = new Date();
        // Check if it's actually 7 AM in this timezone
        const tzTime = now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
        if (parseInt(tzTime) === 7) {
          console.log(`Running morning summary job for timezone: ${timezone}`);
          await this.generateSummariesForTimezone(timezone, 'morning');
        }
      }, {
        timezone
      });

      // Evening summary at 4 PM in the timezone
      const eveningJob = cron.schedule('0 16 * * *', async () => {
        try {
          const now = new Date();
          console.log(`Evening job triggered for ${timezone} at ${now.toISOString()}`);
          
          // Check if it's actually 4 PM in this timezone
          const tzTime = now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
          const hour = parseInt(tzTime);
          
          console.log(`Current time in ${timezone}: ${hour}:00 (${tzTime})`);
          
          if (isNaN(hour)) {
            console.error(`Invalid hour format for timezone ${timezone}: ${tzTime}`);
            return;
          }
          
          if (hour === 16) {
            console.log(`Running evening summary job for timezone: ${timezone}`);
            await this.generateSummariesForTimezone(timezone, 'evening');
          } else {
            console.log(`Skipping evening summary - wrong hour: ${hour} !== 16`);
          }
        } catch (error) {
          console.error(`Error in evening job for ${timezone}:`, error);
        }
      }, {
        timezone
      });

      // Store both jobs with consistent naming
      const morningKey = `${timezone}-morning`;
      const eveningKey = `${timezone}-evening`;
      
      // Stop existing jobs if any
      if (this.activeJobs.has(morningKey)) {
        console.log(`Stopping existing morning job for ${timezone}`);
        this.activeJobs.get(morningKey)?.stop();
      }
      if (this.activeJobs.has(eveningKey)) {
        console.log(`Stopping existing evening job for ${timezone}`);
        this.activeJobs.get(eveningKey)?.stop();
      }
      
      this.activeJobs.set(morningKey, morningJob);
      this.activeJobs.set(eveningKey, eveningJob);
      
      console.log(`Scheduled jobs for ${timezone}:`);
      console.log(`- Morning job (${morningKey})`);
      console.log(`- Evening job (${eveningKey})`);
      console.log(`Total active jobs: ${this.activeJobs.size}`);
    } catch (error) {
      console.error(`Failed to schedule jobs for timezone ${timezone}:`, error);
    }
  }
  
  private async generateSummariesForTimezone(timezone: string, period: 'morning' | 'evening') {
    try {
      // Get all active users in this timezone
      const activeUsers = await db.query.users.findMany({
        where: and(
          eq(users.is_active, true),
          eq(users.timezone, timezone)
        )
      });
      
      console.log(`Generating ${period} summaries for ${activeUsers.length} active users in timezone ${timezone}`);
      
      // Generate summaries for each user
      for (const user of activeUsers) {
        try {
          await this.emailSummaryService.generateDailySummary(user.id, period);
          console.log(`Successfully generated ${period} summary for user ${user.id} in timezone ${timezone}`);
        } catch (error) {
          console.error(`Failed to generate ${period} summary for user ${user.id}:`, error);
          // Log error but continue with next user
        }
      }
      
      console.log(`Completed ${period} summary generation for timezone ${timezone}`);
    } catch (error) {
      console.error(`Failed to run ${period} summary job for timezone ${timezone}:`, error);
    }
  }

  // Method to manually trigger summary generation for testing
  async manuallyTriggerSummary(period: 'morning' | 'evening', timezone?: string) {
    console.log(`Manually triggering ${period} summary generation${timezone ? ` for timezone ${timezone}` : ''}`);
    if (timezone) {
      await this.generateSummariesForTimezone(timezone, period);
    } else {
      // Get all timezones and generate for each
      const result = await db.query.users.findMany({
        where: eq(users.is_active, true),
        columns: {
          timezone: true
        }
      });
      const uniqueTimezones = [...new Set(result.map(user => user.timezone || 'UTC'))];
      for (const tz of uniqueTimezones) {
        await this.generateSummariesForTimezone(tz, period);
      }
    }
  }
}