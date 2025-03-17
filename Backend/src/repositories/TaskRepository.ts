// src/repositories/TaskRepository.ts
import { tasks, Task, InsertTask, TaskAction, WaitingTask } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, desc, asc, sql, gte } from 'drizzle-orm';
import { emailAccountRepository } from './index';

export class TaskRepository extends BaseRepository<Task, InsertTask> {
  protected table = tasks;

  /**
   * Find tasks by user ID
   */
  async findByUserId(userId: string ): Promise<Task[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.user_id, userId))
        .orderBy(desc(this.table.received_date))
        .execute()
    );
  }

  /**
   * Find tasks by column ID with position ordering
   */
  async findByColumnId(columnId: number): Promise<Task[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.column_id, columnId))
        .orderBy(asc(this.table.position))
        .execute()
    );
  }

  /**
   * Find tasks by email ID
   */
  async findByEmailId(emailId: string): Promise<Task | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.email_id, emailId))
        .execute()
    );
    
    return results[0];
  }

  /**
   * Find tasks with their actions
   */
  async findWithActions(taskId: number): Promise<{ task: Task, actions: TaskAction[] }> {
    return this.executeQuery(async (db) => {
      const result = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
        with: {
          actions: true
        }
      });
      
      if (!result) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      return {
        task: result,
        actions: result.actions || []
      };
    });
  }

  /**
   * Get waiting tasks
   */
  async getWaitingTasks(userId: string): Promise<{ task: Task, waitingInfo: WaitingTask }[]> {
    return this.executeQuery(async (db) => {
      const results = await db.query.tasks.findMany({
        where: and(
          eq(tasks.user_id, userId),
          eq(tasks.status, 'Waiting')
        ),
        with: {
          waitingInfo: true
        }
      });
      
      return results
        .filter(result => result.waitingInfo)
        .map(result => ({
          task: result,
          waitingInfo: result.waitingInfo!
        }));
    });
  }

  /**
   * Move task to column
   */
  async moveToColumn(taskId: number, columnId: number, position: number): Promise<Task | undefined> {
    // First, shift positions of other tasks in the target column
    await this.executeQuery((db) => 
      db.update(this.table)
        .set({
          position: sql`${this.table.position} + 1`
        })
        .where(
          and(
            eq(this.table.column_id, columnId),
            gte(this.table.position, position)
          )
        )
        .execute()
    );
    
    // Then update the task with new column and position
    return this.update(taskId, {
      column_id: columnId,
      position: position
    });
  }

  /**
   * Update task status
   */
  async updateStatus(taskId: number, status: string): Promise<Task | undefined> {
    return this.update(taskId, { status });
  }

  /**
   * Update task priority
   */
  async updatePriority(taskId: number, priority: string): Promise<Task | undefined> {
    return this.update(taskId, { priority });
  }

  /**
   * Get tasks count by status
   */
  async getTaskCountByStatus(userId: string): Promise<Record<string, number>> {
    const results = await this.executeQuery((db) => 
      db.select({
        status: this.table.status,
        count: sql<number>`count(*)`.as('count')
      })
      .from(this.table)
      .where(eq(this.table.user_id, userId))
      .groupBy(this.table.status)
      .execute()
    );
    
    return results.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Find tasks by account ID
   */
  async findByAccountId(accountId: number): Promise<Task[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.account_id, accountId))
        .orderBy(desc(this.table.received_date))
        .execute()
    );
  }

  /**
   * Find task by thread ID
   */
  async findByThreadId(threadId: string): Promise<Task | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.thread_id, threadId))
        .execute()
    );
    
    return results[0];
  }

  /**
   * Create a task with user's account
   * This method automatically includes the user's account in the task data
   * If account_id is provided, it uses that; otherwise it tries to find the primary account
   */
  async createTaskWithUserAccount(taskData: Omit<InsertTask, 'account_id'> & { 
    user_id: string; 
    account_id?: number | null;
  }): Promise<Task> {
    try {
      let accountId = taskData.account_id;
      
      // If no account_id is provided, try to find the primary account
      if (!accountId) {
        const primaryAccount = await emailAccountRepository.findPrimaryAccount(taskData.user_id);
        accountId = primaryAccount?.id || null;
      }
      
      // Create the task with account_id if available
      const taskWithAccount = {
        ...taskData,
        account_id: accountId
      };
      
      console.log('Creating task with account data:', {
        account_id: taskWithAccount.account_id,
        user_id: taskWithAccount.user_id
      });
      
      return this.create(taskWithAccount);
    } catch (error) {
      console.error('Error creating task with account:', error);
      // Fallback to creating task without account_id
      return this.create(taskData);
    }
  }
}