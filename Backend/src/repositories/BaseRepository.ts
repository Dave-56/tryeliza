// src/repositories/BaseRepository.ts
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { query } from '../db';
import { eq } from 'drizzle-orm';

export abstract class BaseRepository<T, InsertT> {
  protected abstract table: any; // Table reference

  /**
   * Find all records
   */
  async findAll(): Promise<T[]> {
    return query((db) => 
      db.select()
        .from(this.table)
        .execute()
    );
  }

  /**
   * Find record by ID
   */
  async findById(id: string | number): Promise<T | undefined> {
    const results = await query((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.id, id))
        .execute()
    );
    
    return results[0];
  }

  /**
   * Create a new record
   */
  async create(data: InsertT): Promise<T> {
    const results = await query((db) => 
      db.insert(this.table)
        .values(data as any)
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Update a record
   */
  async update(id: number | string, data: Partial<InsertT>): Promise<T | undefined> {
    const results = await query((db) => 
      db.update(this.table)
        .set(data)
        .where(eq(this.table.id, id))
        .returning()
        .execute()
    );
    
    return results[0];
  }

  /**
   * Delete a record
   */
  async delete(id: number | string): Promise<boolean> {
    const results = await query((db) => 
      db.delete(this.table)
        .where(eq(this.table.id, id))
        .returning()
        .execute()
    );
    
    return results.length > 0;
  }

  /**
   * Execute a custom query
   */
  async executeQuery<R>(
    queryFn: (db: PostgresJsDatabase<typeof schema>) => Promise<R>
  ): Promise<R> {
    return query(queryFn);
  }
}