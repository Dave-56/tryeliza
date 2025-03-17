// src/repositories/EmailRepository.ts
import { emails, Email, InsertEmail } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, desc, sql } from 'drizzle-orm';

export class EmailRepository extends BaseRepository<Email, InsertEmail> {
  protected table = emails;

  /**
   * Find email by Gmail ID
   */
  async findByGmailId(gmailId: string): Promise<Email | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.gmail_id, gmailId))
        .execute()
    );
    
    return results[0];
  }

  /**
   * Find emails by user ID
   */
  async findByUserId(userId: string, limit = 50, offset = 0): Promise<Email[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.user_id, userId))
        .orderBy(desc(this.table.received_at))
        .limit(limit)
        .offset(offset)
        .execute()
    );
  }

  /**
   * Find emails by account ID
   */
  async findByAccountId(accountId: number, limit = 50, offset = 0): Promise<Email[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.account_id, accountId))
        .orderBy(desc(this.table.received_at))
        .limit(limit)
        .offset(offset)
        .execute()
    );
  }

  /**
   * Find emails that need draft processing
   */
  async findNeedsDraftProcessing(userId: string, limit = 10): Promise<Email[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.needs_draft_processing, true)
          )
        )
        .limit(limit)
        .execute()
    );
  }

  /**
   * Mark email as processed for drafts
   */
  async markDraftProcessed(emailId: string): Promise<Email | undefined> {
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          needs_draft_processing: false,
          draft_processed_at: new Date()
        })
        .where(eq(this.table.gmail_id, emailId))
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Update AI summary
   */
  async updateAiSummary(emailId: string, summary: string): Promise<Email | undefined> {
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          ai_summary: summary,
          is_processed: true
        })
        .where(eq(this.table.gmail_id, emailId))
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Get email count by category for a user
   */
  async getEmailCountByCategory(userId: string): Promise<Record<string, number>> {
    const results = await this.executeQuery((db) => 
      db.select({
        category: this.table.category,
        count: sql<number>`count(*)`.as('count')
      })
      .from(this.table)
      .where(eq(this.table.user_id, userId))
      .groupBy(this.table.category)
      .execute()
    );
    
    return results.reduce((acc, { category, count }) => {
      acc[category] = count;
      return acc;
    }, {} as Record<string, number>);
  }
}