// src/repositories/CategorizedDailySummaryRepository.ts
import { categorizedDailySummaries, CategorizedDailySummary, InsertCategorizedDailySummary } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, desc, sql, lte, gte } from 'drizzle-orm';
import { UUID } from 'crypto';

export class CategorizedDailySummaryRepository extends BaseRepository<CategorizedDailySummary, InsertCategorizedDailySummary> {
  protected table = categorizedDailySummaries;

  async findByDateAndUser(
    userId: string, 
    summaryDate: Date | string,
    period: string = 'morning'
  ): Promise<CategorizedDailySummary | undefined> {
    const formattedDate = typeof summaryDate === 'string' 
      ? summaryDate 
      : summaryDate.toISOString().split('T')[0];
    
    console.log('Repository: Finding summary with params:', {
      userId,
      formattedDate,
      period,
      table: 'categorized_daily_summaries'
    });

    const results = await this.executeQuery((db) => 
      db.select()
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
    
    console.log('Repository: Query results:', results);
    return results[0];
  }

  async updateSummary(
    userId: string,
    summaryDate: string | Date,
    period: string,
    data: Partial<InsertCategorizedDailySummary>
  ): Promise<CategorizedDailySummary | undefined> {
    const formattedDate = typeof summaryDate === 'string' 
      ? summaryDate 
      : summaryDate.toISOString().split('T')[0];
    
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set(data)
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

  async findLatestSummaryForPeriod(
    userId: UUID,
    summaryDate: Date,
    periodStart: string,
    periodEnd: string
  ): Promise<CategorizedDailySummary | undefined> {
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
        .orderBy(desc(this.table.created_at))
        .limit(1)
        .execute()
    ).then(results => results[0]);
  }

  async upsertCategorySummaries(
    userId: string,
    summaryDate: Date | string,
    period: 'morning' | 'evening',
    summaries: Record<string, { key_highlights: string; category_name: string }>,
    userTimezone: string
  ): Promise<CategorizedDailySummary> {
    const formattedDate = typeof summaryDate === 'string' 
      ? summaryDate 
      : new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: userTimezone
        }).format(summaryDate);

    // Get existing summary
    const existing = await this.findByDateAndUser(userId, formattedDate, period);
  
    // Convert new summaries to array format
    const newSummaries = Object.entries(summaries).map(([_, data]) => ({
      category_name: data.category_name,
      key_highlights: data.key_highlights
    }));

    // Combine existing and new summaries
    const mergedSummaries = existing?.categories_summary 
      ? [...existing.categories_summary, ...newSummaries]
      : newSummaries;

    const data = {
      user_id: userId,
      summary_date: formattedDate,
      period,
      timezone: userTimezone,
      categories_summary: mergedSummaries,
      status: 'completed',
      last_run_at: this.getScheduledTimeFromPeriod(formattedDate, period, userTimezone),
      total_threads_processed: mergedSummaries.length,
      updated_at: new Date()
    };

    // Upsert with merged data
    const result = await this.executeQuery((db) =>
      db.insert(this.table)
        .values(data)
        .onConflictDoUpdate({
          target: [this.table.user_id, this.table.summary_date, this.table.period],
          set: {
            [this.table.categories_summary.name]: mergedSummaries,
            [this.table.status.name]: 'completed',
            [this.table.total_threads_processed.name]: mergedSummaries.length,
            [this.table.updated_at.name]: new Date(),
            [this.table.last_run_at.name]: this.getScheduledTimeFromPeriod(formattedDate, period, userTimezone)
          }
        })
        .returning()
    );

    return result[0];
  }

  /**
   * Returns the scheduled time for a summary based on the period
   * @param dateString Date string in YYYY-MM-DD format
   * @param period 'morning' or 'evening'
   * @param timezone User's timezone
   * @returns Date object representing the scheduled run time
   */
  private getScheduledTimeFromPeriod(dateString: string, period: 'morning' | 'evening', timezone: string): Date {
    const date = new Date(dateString);
    
    // Set hours based on period (7 AM for morning, 4 PM for evening)
    const hours = period === 'morning' ? 7 : 16;
    date.setHours(hours, 0, 0, 0);
    
    return date;
  }
}