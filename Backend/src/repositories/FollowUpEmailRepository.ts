// src/repositories/FollowUpEmailRepository.ts
import { followUpEmails, InsertFollowUpEmail, FollowUpEmail } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, lt, gte, or, isNull } from 'drizzle-orm';

export class FollowUpEmailRepository extends BaseRepository<FollowUpEmail, InsertFollowUpEmail> {
  protected table = followUpEmails;

  /**
   * Find by task ID
   */
  async findByTaskId(taskId: number): Promise<FollowUpEmail[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.task_id, taskId))
        .execute()
    );
  }

  /**
   * Find by status
   */
  async findByStatus(status: string): Promise<FollowUpEmail[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.status, status))
        .execute()
    );
  }

  /**
   * Find scheduled emails that need to be sent
   */
  async findScheduledEmailsDue(): Promise<FollowUpEmail[]> {
    const now = new Date();
    
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.status, 'scheduled'),
            lt(this.table.scheduled_time, now)
          )
        )
        .execute()
    );
  }

  /**
   * Update email status
   */
  async updateStatus(id: number, status: string): Promise<FollowUpEmail | undefined> {
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          status: status,
          updated_at: new Date()
        })
        .where(eq(this.table.id, id))
        .returning()
        .execute()
    );
    
    return results[0];
  }
}