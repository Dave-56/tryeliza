import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { ENV } from '../config/environment';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Use Supabase database URL if available, otherwise fall back to local
let connectionString = ENV.SUPABASE_DB_URL || ENV.DATABASE_URL;

// Create postgres connection with SSL for Supabase
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: ENV.SUPABASE_DB_URL ? { rejectUnauthorized: false } : false, // Accept self-signed certificates
});

// Create drizzle instance
export const db = drizzle(client, { schema });

// Export query helper function
export async function query<T>(
  callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  try {
    return await callback(db);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}