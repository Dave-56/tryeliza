// src/repositories/ColumnRepository.ts
import { columns, Column, InsertColumn, Task } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, asc, sql, gte } from 'drizzle-orm';

export class ColumnRepository extends BaseRepository<Column, InsertColumn> {
  protected table = columns;

  /**
   * Get all columns ordered by position
   */
  async getAllOrdered(): Promise<Column[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .orderBy(asc(this.table.position))
        .execute()
    );
  }

  /**
   * Get columns with their tasks
   */
  async getColumnsWithTasks(): Promise<(Column & { tasks: Task[] })[]> {
    return this.executeQuery((db) => 
      db.query.columns.findMany({
        orderBy: asc(columns.position),
        with: {
          tasks: {
            orderBy: (tasks, { asc }) => [asc(tasks.position)]
          }
        }
      })
    );
  }

  /**
   * Get columns with their tasks filtered by user ID
   * This performs the filtering at the database level instead of in memory
   */
  async getColumnsWithTasksByUserId(userId: string): Promise<(Column & { tasks: (Task & { actions: any[], waitingInfo?: { reminder_sent: boolean | null } })[] })[]> {
    return this.executeQuery((db) => 
      db.query.columns.findMany({
        orderBy: asc(columns.position),
        with: {
          tasks: {
            where: (tasks, { eq }) => eq(tasks.user_id, userId),
            orderBy: (tasks, { asc }) => [asc(tasks.position)],
            with: {
              actions: {
                orderBy: (actions, { asc }) => [asc(actions.position)]
              },
              waitingInfo: true
            }
          }
        }
      })
    );
  }

  /**
   * Reorder columns
   */
  async reorderColumns(columnIds: number[]): Promise<boolean> {
    try {
      await this.executeQuery(async (db) => {
        // Update each column's position based on its index in the columnIds array
        for (let i = 0; i < columnIds.length; i++) {
          await db.update(this.table)
            .set({ position: i })
            .where(eq(this.table.id, columnIds[i]))
            .execute();
        }
      });
      return true;
    } catch (error) {
      console.error('Error reordering columns:', error);
      return false;
    }
  }

  /**
   * Shift column positions to make room for a new column
   * @param position The position where the new column will be inserted
   * @returns True if successful
   */
  async shiftColumnPositions(position: number): Promise<boolean> {
    try {
      await this.executeQuery((db) => 
        db.update(this.table)
          .set({ 
            position: sql`${this.table.position} + 1` 
          })
          .where(gte(this.table.position, position))
          .execute()
      );
      return true;
    } catch (error) {
      console.error('Error shifting column positions:', error);
      return false;
    }
  }

  /**
   * Compact column positions after a column is deleted
   * @param position The position of the deleted column
   * @returns True if successful
   */
  async compactColumnPositions(position: number): Promise<boolean> {
    try {
      await this.executeQuery((db) => 
        db.update(this.table)
          .set({ 
            position: sql`${this.table.position} - 1` 
          })
          .where(gte(this.table.position, position))
          .execute()
      );
      return true;
    } catch (error) {
      console.error('Error compacting column positions:', error);
      return false;
    }
  }

  /**
   * Initialize default columns if none exist
   */
  async initializeDefaultColumns(): Promise<Column[]> {
    const existingColumns = await this.getAllOrdered();
    if (existingColumns.length > 0) {
      return existingColumns;
    }

    const defaultColumns: InsertColumn[] = [
      { title: 'Inbox', position: 0 },
      { title: 'In Progress', position: 1 },
      { title: 'Waiting', position: 2 },
      { title: 'Completed', position: 3 }
    ];

    return this.executeQuery(async (db) => {
      const results = await db.insert(this.table)
        .values(defaultColumns)
        .returning()
        .execute();
      
      return results;
    });
  }
}