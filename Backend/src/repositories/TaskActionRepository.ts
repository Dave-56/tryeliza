// src/repositories/TaskActionRepository.ts
import { taskActions, TaskAction, InsertTaskAction } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, asc, sql } from 'drizzle-orm';

export class TaskActionRepository extends BaseRepository<TaskAction, InsertTaskAction> {
  protected table = taskActions;

  /**
   * Find actions by task ID
   */
  async findByTaskId(taskId: number): Promise<TaskAction[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.task_id, taskId))
        .orderBy(asc(this.table.position))
        .execute()
    );
  }

  /**
   * Toggle action completion status
   */
  async toggleCompletion(actionId: number): Promise<TaskAction | undefined> {
    return this.executeQuery(async (db) => {
      // First get the current status
      const currentAction = await db.select()
        .from(this.table)
        .where(eq(this.table.id, actionId))
        .execute();
      
      if (!currentAction[0]) {
        return undefined;
      }
      
      // Toggle the status
      const results = await db.update(this.table)
        .set({
          is_completed: !currentAction[0].is_completed
        })
        .where(eq(this.table.id, actionId))
        .returning()
        .execute();
      
      return results[0];
    });
  }

  /**
   * Add actions to a task
   */
  async addActionsToTask(taskId: number, actionTexts: string[]): Promise<TaskAction[]> {
    // First, get the highest current position
    const currentActions = await this.findByTaskId(taskId);
    const startPosition = currentActions.length > 0 
      ? Math.max(...currentActions.map(a => a.position || 0)) + 1 
      : 0;
    
    // Create the new actions
    const actionsToInsert: InsertTaskAction[] = actionTexts.map((text, index) => ({
      task_id: taskId,
      action_text: text,
      is_completed: false,
      position: startPosition + index
    }));
    
    return this.executeQuery((db) => 
      db.insert(this.table)
        .values(actionsToInsert)
        .returning()
        .execute()
    );
  }

  /**
   * Reorder actions
   */
  async reorderActions(taskId: number, actionIds: number[]): Promise<boolean> {
    try {
      await this.executeQuery(async (db) => {
        // Update each action's position based on its index in the actionIds array
        for (let i = 0; i < actionIds.length; i++) {
          await db.update(this.table)
            .set({ position: i })
            .where(
              and(
                eq(this.table.id, actionIds[i]),
                eq(this.table.task_id, taskId)
              )
            )
            .execute();
        }
      });
      return true;
    } catch (error) {
      console.error('Error reordering actions:', error);
      return false;
    }
  }

  /**
   * Get completion stats for a task
   */
  async getCompletionStats(taskId: number): Promise<{ completed: number, total: number }> {
    const stats = await this.executeQuery((db) => 
      db.select({
        completed: sql<number>`SUM(CASE WHEN ${this.table.is_completed} THEN 1 ELSE 0 END)`.as('completed'),
        total: sql<number>`COUNT(*)`.as('total')
      })
      .from(this.table)
      .where(eq(this.table.task_id, taskId))
      .execute()
    );
    
    return stats[0] || { completed: 0, total: 0 };
  }
}