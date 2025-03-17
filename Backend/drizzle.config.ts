import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: "localhost",
    port: 5431,
    user: "preciousemakenemi",
    password: "root",
    database: "eliza-march-v1",
    ssl: false
  }
});