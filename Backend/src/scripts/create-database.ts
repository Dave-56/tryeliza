// scripts/create-database.ts
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

async function createDatabase() {
  // Extract database name from connection string
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Parse the database name from the connection string
  const dbNameMatch = connectionString.match(/\/([^?]*)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : null;

  if (!dbName) {
    console.error('Could not parse database name from DATABASE_URL');
    process.exit(1);
  }

  // Get postgres connection info without the specific database
  const pgConnectionString = connectionString.replace(`/${dbName}`, '/postgres');

  const client = new Client({
    connectionString: pgConnectionString,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    // Check if database exists
    const checkResult = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      // Create database if it doesn't exist
      // We use string escaping for the database name since parameterized queries 
      // don't work with CREATE DATABASE
      const escapedDbName = dbName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${escapedDbName}"`);
      console.log(`✅ Database '${dbName}' created successfully`);
    } else {
      console.log(`✅ Database '${dbName}' already exists`);
    }
  } catch (error) {
    console.error('❌ Error creating database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase().catch(console.error);