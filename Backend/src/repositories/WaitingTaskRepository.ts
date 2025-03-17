// src/repositories/WaitingTaskRepository.ts
import { waitingTasks, WaitingTask, InsertWaitingTask } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, lt, gte, or, isNull } from 'drizzle-orm';

export class WaitingTaskRepository extends BaseRepository<WaitingTask, InsertWaitingTask> {
  protected table = waitingTasks;

  /**
   * Find by task ID
   */
  async findByTaskId(taskId: number): Promise<WaitingTask | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.task_id, taskId))
        .execute()
    );
    
    return results[0];
  }

  /**
   * Find tasks that need reminders
   * This finds waiting tasks that haven't had a reminder sent 
   * and have been waiting for at least 3 days
   */
  async findTasksNeedingReminders(): Promise<WaitingTask[]> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.reminder_sent, false),
            or(
              isNull(this.table.last_reminder_date),
              lt(this.table.last_reminder_date, threeDaysAgo)
            ),
            lt(this.table.waiting_since, threeDaysAgo)
          )
        )
        .execute()
    );
  }

  /**
   * Mark that a reminder was sent
   */
  async markReminderSent(taskId: number): Promise<WaitingTask | undefined> {
    const results = await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          reminder_sent: true,
          last_reminder_date: new Date()
        })
        .where(eq(this.table.task_id, taskId))
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Update waiting information
   */
  async updateWaitingInfo(
    taskId: number, 
    waitingFor: string, 
    waitingTime: string
  ): Promise<WaitingTask | undefined> {
    const existing = await this.findByTaskId(taskId);
    
    if (existing) {
      return this.executeQuery((db) => 
        db.update(this.table)
          .set({
            waiting_for: waitingFor,
            waiting_time: waitingTime,
            updated_at: new Date()
          })
          .where(eq(this.table.task_id, taskId))
          .returning()
          .execute()
      ).then(results => results[0]);
    } else {
      return this.executeQuery((db) => 
        db.insert(this.table)
          .values({
            task_id: taskId,
            waiting_since: new Date(),
            waiting_time: waitingTime,
            waiting_for: waitingFor,
            reminder_sent: false
          })
          .returning()
          .execute()
      ).then(results => results[0]);
    }
  }

  /**
   * Get tasks waiting for more than a specific duration
   */
  async getTasksOverdue(days: number): Promise<WaitingTask[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(lt(this.table.waiting_since, cutoffDate))
        .execute()
    );
  }
}