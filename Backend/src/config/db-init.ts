import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import path from "path";
import dotenv from 'dotenv';
import { ENV } from "../config/environment";

dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development') });

async function main() {
  console.log("Initializing database...");

  // Use Supabase database URL if available
  const connectionString = ENV.SUPABASE_DB_URL || ENV.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("Database connection string is not defined.");
  }

  const sql = postgres(connectionString, {
    ssl: ENV.SUPABASE_DB_URL ? { rejectUnauthorized: false } : false, // Accept self-signed certificates
  });

  const db = drizzle(sql, { schema });

  // console.log("Running migrations...");
  
  try {
    // Just test the connection with a simple query
    const result = await sql`SELECT 1 as connected`;
    console.log("Successfully connected to Supabase database:", result);
    // // Run migrations from the specified directory
    // await migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });
    // console.log("Migrations applied successfully.");
  } catch (error) {
    console.error("Error connecting to database:", error);
    process.exit(1);
  }

  console.log("Database connection test complete.");
}

main();