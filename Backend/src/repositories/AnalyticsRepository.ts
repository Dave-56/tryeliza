// src/repositories/AnalyticsRepository.ts
import { emails, tasks, draftActivities, processedEmails } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, count, sql, between, gte, lte, desc } from 'drizzle-orm';

export interface UserAnalytics {
  emailsProcessed: number;
  taskConversion: {
    percentage: number;
    emailsToTasks: number;
  };
  draftsCreated: number;
  pendingDrafts: number;
}

export interface TotalAnalytics {
  totalEmailsProcessed: number;
  totalTasksCreated: number;
  totalDraftsCreated: number;
  totalPendingDrafts: number;
}

export interface DateRangeAnalytics {
  emailsProcessed: number;
  tasksCreated: number;
  draftsCreated: number;
}

export interface DraftActivity {
  id: number;
  title: string;
  status: string;
  created_at: Date | null;
  email_id: string | null;
  gmail_draft_id: string | null;
}

export class AnalyticsRepository extends BaseRepository<any, any> {
  protected table = emails; // Default table, but we'll use multiple tables

  /**
   * Get analytics data for a specific user
   */
  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    // Count emails processed for this user
    const emailsProcessedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(processedEmails)
        .where(eq(processedEmails.user_id, userId))
        .execute()
    );
    
    const emailsProcessed = emailsProcessedResult[0]?.count || 0;
    
    // Count tasks created from emails
    const tasksFromEmailsResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(tasks)
        .where(and(
          eq(tasks.user_id, userId),
          sql`${tasks.email_id} IS NOT NULL`
        ))
        .execute()
    );
    
    const tasksFromEmails = tasksFromEmailsResult[0]?.count || 0;
    
    // Calculate task conversion percentage
    const taskConversionPercentage = emailsProcessed > 0 
      ? Math.round((tasksFromEmails / emailsProcessed) * 100) 
      : 0;
    
    // Count drafts created
    const draftsCreatedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(draftActivities)
        .where(and(
          eq(draftActivities.user_id, userId),
          eq(draftActivities.status, 'Draft Created')
        ))
        .execute()
    );
    
    const draftsCreated = draftsCreatedResult[0]?.count || 0;
    
    // Count pending drafts (emails that need draft processing)
    const pendingDraftsResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(emails)
        .where(and(
          eq(emails.user_id, userId),
          eq(emails.needs_draft_processing, true),
          sql`${emails.draft_processed_at} IS NULL`
        ))
        .execute()
    );
    
    const pendingDrafts = pendingDraftsResult[0]?.count || 0;
    
    return {
      emailsProcessed,
      taskConversion: {
        percentage: taskConversionPercentage,
        emailsToTasks: tasksFromEmails
      },
      draftsCreated,
      pendingDrafts
    };
  }

  /**
   * Get total analytics data across all users
   */
  async getTotalAnalytics(): Promise<TotalAnalytics> {
    // Count total emails processed
    const totalEmailsProcessedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(processedEmails)
        .execute()
    );
    
    const totalEmailsProcessed = totalEmailsProcessedResult[0]?.count || 0;
    
    // Count total tasks created from emails
    const totalTasksCreatedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(tasks)
        .where(sql`${tasks.email_id} IS NOT NULL`)
        .execute()
    );
    
    const totalTasksCreated = totalTasksCreatedResult[0]?.count || 0;
    
    // Count total drafts created
    const totalDraftsCreatedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(draftActivities)
        .where(eq(draftActivities.status, 'Draft Created'))
        .execute()
    );
    
    const totalDraftsCreated = totalDraftsCreatedResult[0]?.count || 0;
    
    // Count total pending drafts
    const totalPendingDraftsResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(emails)
        .where(and(
          eq(emails.needs_draft_processing, true),
          sql`${emails.draft_processed_at} IS NULL`
        ))
        .execute()
    );
    
    const totalPendingDrafts = totalPendingDraftsResult[0]?.count || 0;
    
    return {
      totalEmailsProcessed,
      totalTasksCreated,
      totalDraftsCreated,
      totalPendingDrafts
    };
  }

  /**
   * Get analytics data for a specific date range
   */
  async getAnalyticsByDateRange(startDate: any, endDate: any): Promise<DateRangeAnalytics> {
    // Convert string dates to Date objects if needed
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    
    // Count emails processed in date range
    const emailsProcessedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(processedEmails)
        .where(and(
          gte(processedEmails.processed_at, start),
          lte(processedEmails.processed_at, end)
        ))
        .execute()
    );
    
    const emailsProcessed = emailsProcessedResult[0]?.count || 0;
    
    // Count tasks created in date range
    const tasksCreatedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(tasks)
        .where(and(
          gte(tasks.created_at, start),
          lte(tasks.created_at, end),
          sql`${tasks.email_id} IS NOT NULL`
        ))
        .execute()
    );
    
    const tasksCreated = tasksCreatedResult[0]?.count || 0;
    
    // Count drafts created in date range
    const draftsCreatedResult = await this.executeQuery((db) => 
      db.select({ count: count() })
        .from(draftActivities)
        .where(and(
          gte(draftActivities.created_at, start),
          lte(draftActivities.created_at, end),
          eq(draftActivities.status, 'Draft Created')
        ))
        .execute()
    );
    
    const draftsCreated = draftsCreatedResult[0]?.count || 0;
    
    return {
      emailsProcessed,
      tasksCreated,
      draftsCreated
    };
  }

  /**
   * Get draft activities for a user
   * @param userId The user ID
   * @param limit Optional limit for the number of activities to return (default: 10)
   * @returns Array of draft activities
   */
  async getDraftActivities(userId: string, limit: number = 10): Promise<DraftActivity[]> {
    try {
      const activities = await this.executeQuery((db) => 
        db.select({
          id: draftActivities.id,
          title: draftActivities.title,
          status: draftActivities.status,
          created_at: draftActivities.created_at,
          email_id: draftActivities.email_id,
          gmail_draft_id: draftActivities.gmail_draft_id
        })
        .from(draftActivities)
        .where(eq(draftActivities.user_id, userId))
        .orderBy(desc(draftActivities.created_at))
        .limit(limit)
        .execute()
      );
      
      return activities;
    } catch (error) {
      console.error('Error fetching draft activities:', error);
      throw error;
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();