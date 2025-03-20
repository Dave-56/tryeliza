// src/repositories/DailySummaryRepository.ts
import { dailySummaries, DailySummary, InsertDailySummary } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, desc, sql, lte, gte } from 'drizzle-orm';
import { UUID } from 'crypto';

export class DailySummaryRepository extends BaseRepository<DailySummary, InsertDailySummary> {
  protected table = dailySummaries;

  /**
   * Find summary by date, user ID, and period
   * @param userId - The user ID
   * @param summaryDate - Can be either a Date object or a formatted date string (YYYY-MM-DD)
   * @param period - The period ('morning' or 'evening')
   */
  async findByDateAndUser(
    userId: UUID, 
    summaryDate: Date | string,
    period: string = 'morning' // Default to morning
  ): Promise<DailySummary | undefined> {
    // Format date as YYYY-MM-DD to ensure proper date comparison
    let formattedDate: string;
    
    if (typeof summaryDate === 'string') {
      // If it's already a formatted string, use it directly
      formattedDate = summaryDate;
    } else {
      // If it's a Date object, format it using the local timezone
      formattedDate = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(summaryDate);
    }
    
    console.log(`[DEBUG] Repository date handling:`, {
      inputType: typeof summaryDate,
      inputValue: typeof summaryDate === 'string' ? summaryDate : summaryDate.toISOString(),
      formattedDate,
      userId,
      period
    });
    
    const results = await this.executeQuery((db) => 
      db.select({
        user_id: this.table.user_id,
        summary_date: this.table.summary_date,
        period: this.table.period,
        timezone: this.table.timezone,
        categories_summary: this.table.categories_summary,
        status: this.table.status,
        scheduled_time: this.table.scheduled_time,
        last_run_at: this.table.last_run_at,
        error_details: this.table.error_details,
        email_count: this.table.email_count,
        cache_duration_hours: this.table.cache_duration_hours,
        created_at: this.table.created_at,
        updated_at: this.table.updated_at
      })
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.summary_date, formattedDate),
            eq(this.table.period, period)
          )
        )
        .execute()
    );
    
    if (results.length > 0) {
      console.log(`Repository: Found summary for date ${formattedDate}, period ${period}`);
    } else {
      console.log(`Repository: No summary found for date ${formattedDate}, period ${period}`);
    }
    
    return results[0];
  }

  /**
   * Find all summaries for a user
   */
  async findByUser(
    userId: UUID, 
    limit = 30, 
    offset = 0
  ): Promise<DailySummary[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.user_id, userId))
        .orderBy(desc(this.table.summary_date))
        .limit(limit)
        .offset(offset)
        .execute()
    );
  }

  /**
   * Find summaries within a date range
   */
  async findByDateRange(
    userId: UUID, 
    startDate: Date,
    endDate: Date
  ): Promise<DailySummary[]> {
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            gte(sql`DATE(${this.table.summary_date})`, formattedStartDate),
            lte(sql`DATE(${this.table.summary_date})`, formattedEndDate)
          )
        )
        .orderBy(desc(this.table.summary_date))
        .execute()
    );
  }

  /**
   * Check if summary is expired
   */
  isExpired(summary: DailySummary): boolean {
    const now = new Date();
    // Handle the case where created_at might be null
    const createdAt = summary.created_at || new Date();
    const expirationTime = new Date(createdAt);
    // Handle the case where cache_duration_hours might be null
    const cacheDuration = summary.cache_duration_hours || 24; // Default to 24 hours
    expirationTime.setHours(expirationTime.getHours() + cacheDuration);
    return now > expirationTime;
  }

  /**
   * Update summary status using composite key
   */
  async updateStatus(
    userId: UUID,
    summaryDate: string | Date,
    period: string,
    status: string
  ): Promise<DailySummary | undefined> {
    // Format date if it's a Date object
    const formattedDate = typeof summaryDate === 'string' 
      ? summaryDate 
      : summaryDate.toISOString().split('T')[0];
    
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({ 
          status, 
          updated_at: new Date() 
        })
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.summary_date, formattedDate),
            eq(this.table.period, period)
          )
        )
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Update summary data using composite key
   */
  async updateSummary(
    userId: UUID,
    summaryDate: string | Date,
    period: string,
    data: Partial<InsertDailySummary>
  ): Promise<DailySummary | undefined> {
    // Format date if it's a Date object
    const formattedDate = typeof summaryDate === 'string' 
      ? summaryDate 
      : summaryDate.toISOString().split('T')[0];
    
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          ...data,
          updated_at: new Date()
        })
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.summary_date, formattedDate),
            eq(this.table.period, period)
          )
        )
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Find latest summary for period
   */
  async findLatestSummaryForPeriod(
    userId: UUID,
    summaryDate: Date,
    periodStart: string, // e.g., "00:00:00" for AM
    periodEnd: string    // e.g., "11:59:59" for AM
  ): Promise<DailySummary | undefined> {
    const formattedDate = summaryDate.toISOString().split('T')[0];
    
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(sql`DATE(${this.table.summary_date})`, formattedDate),
            gte(sql`TIME(${this.table.created_at})`, periodStart),
            lte(sql`TIME(${this.table.created_at})`, periodEnd)
          )
        )
        .orderBy(desc(this.table.created_at)) // Get the most recent in that period
        .limit(1)
        .execute()
    ).then(results => results[0]);
  }
}