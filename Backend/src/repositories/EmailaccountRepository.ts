import { emailAccounts, EmailAccount, InsertEmailAccount, emails, Email } from '../db/schema';
import { BaseRepository } from './BaseRepository';
import { eq, and } from 'drizzle-orm';
import { UUID } from 'crypto';

export class EmailAccountRepository extends BaseRepository<EmailAccount, InsertEmailAccount> {
  protected table = emailAccounts;

  /**
   * Find accounts by user ID
   */
  async findByUserId(userId: string): Promise<EmailAccount[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.user_id, userId))
        .execute()
    );
  }

  /**
   * Find accounts by provider
   */
  async findByProvider(provider: string): Promise<EmailAccount[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.provider, provider))
        .execute()
    );
  }

  /**
   * Find account by email address
   */
  async findByEmailAddress(emailAddress: string): Promise<EmailAccount | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(eq(this.table.email_address, emailAddress))
        .execute()
    );
    return results[0];
  }

  /**
   * Find emails by account ID
   */
  async findEmailsByAccountId(accountId: number): Promise<Email[]> {
    return this.executeQuery((db) => 
      db.select()
        .from(emails)
        .where(eq(emails.account_id, accountId))
        .execute()
    );
  }

  /**
   * Find primary account for a user
   */
  async findPrimaryAccount(userId: string): Promise<EmailAccount | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.is_primary, true)
          )
        )
        .execute()
    );
    
    return results[0];
  }

  /**
   * Find a specific account by user ID and email address
   */
  async findByUserAndEmail(userId: string, emailAddress: string): Promise<EmailAccount | undefined> {
    const results = await this.executeQuery((db) => 
      db.select()
        .from(this.table)
        .where(
          and(
            eq(this.table.user_id, userId),
            eq(this.table.email_address, emailAddress)
          )
        )
        .execute()
    );
    
    return results[0];
  }

  /**
   * Update authentication tokens
   */
  async updateTokens(
    accountId: number, 
    tokens: {
      access_token: string;
      refresh_token?: string;
      scope: string;
      token_type: string;
      expiry_date: number;
    }
  ): Promise<EmailAccount | undefined> {
    return this.update(accountId, {
      tokens,
      is_connected: true,
      last_sync: new Date()
    });
  }

  /**
   * Mark account as disconnected
   */
  async markAsDisconnected(accountId: number): Promise<EmailAccount | undefined> {
    return this.update(accountId, {
      is_connected: false
    });
  }

  /**
   * Update last sync time
   */
  async updateLastSync(accountId: number): Promise<EmailAccount | undefined> {
    return this.update(accountId, {
      last_sync: new Date()
    });
  }
}