// src/repositories/UserRepository.ts
import { users, User, InsertUser, EmailAccount } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and, ilike } from 'drizzle-orm';

export class UserRepository extends BaseRepository<User, InsertUser> {
  protected table = users;

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.email, email))
        .execute()
    );
    
    return results[0];
  }

/**
 * Save a new user
 */
async save(user: InsertUser): Promise<User> {
  return this.create(user);
}

  /**
   * Get all email accounts for a user
   */
  async findEmailAccounts(userId: string): Promise<EmailAccount[]> {
    return this.executeQuery((db) => 
      db.query.users.findFirst({
        where: eq(users.id, userId),
        with: {
          emailAccounts: true
        }
      }).then(user => user?.emailAccounts || [])
    );
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string, 
    contextualDraftingEnabled: boolean,
    actionItemConversionEnabled: boolean
  ): Promise<User | undefined> {
    return this.update(userId, {
      contextual_drafting_enabled: contextualDraftingEnabled,
      action_item_conversion_enabled: actionItemConversionEnabled
    });
  }
}