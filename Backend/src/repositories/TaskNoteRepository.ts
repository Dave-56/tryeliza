// src/repositories/TaskNoteRepository.ts
import { taskNotes, TaskNote, InsertTaskNote } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, desc } from 'drizzle-orm';

export class TaskNoteRepository extends BaseRepository<TaskNote, InsertTaskNote> {
  protected table = taskNotes;

  /**
   * Find notes by task ID
   */
  async findByTaskId(taskId: number): Promise<TaskNote[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.task_id, taskId))
        .orderBy(desc(this.table.created_at))
        .execute()
    );
  }

  /**
   * Add a note to a task
   */
  async addNoteToTask(taskId: number, userId: string, text: string): Promise<TaskNote> {
    const noteToInsert: InsertTaskNote = {
      task_id: taskId,
      user_id: userId,
      text: text
    };
    
    const result = await this.executeQuery((db) => 
      db.insert(this.table)
        .values(noteToInsert)
        .returning()
        .execute()
    );
    
    return result[0];
  }

  /**
   * Delete a note
   */
  async deleteNote(noteId: number, userId: string): Promise<boolean> {
    try {
      const result = await this.executeQuery((db) => 
        db.delete(this.table)
          .where(
            eq(this.table.id, noteId)
          )
          .returning()
          .execute()
      );
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }
}