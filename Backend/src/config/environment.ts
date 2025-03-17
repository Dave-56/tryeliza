// config/environment.ts
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development') });

// Export isProduction as a separate variable
export const isProduction = process.env.NODE_ENV === 'production';

// Define and export required environment variables with types
export const ENV = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL as string,

  // Add Supabase variables
  SUPABASE_URL: process.env.SUPABASE_URL as string,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY as string,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL as string,

  // Add Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL as string,
  
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction,
  
  // Authentication
  JWT_SECRET: process.env.JWT_SECRET as string,
  
  // Gmail API
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID as string,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET as string,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI as string,
  
  // Azure OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY as string,
  OPENAI_MODEL: process.env.OPENAI_MODEL as string,
};

// Validate that required environment variables are present
export function validateEnv() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY',
    'FRONTEND_URL'
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !ENV[envVar as keyof typeof ENV]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
}

export function validateProductionEnv() {
  if (isProduction) {
    // Check that production URLs use HTTPS
    const urlVars = ['FRONTEND_URL', 'GOOGLE_REDIRECT_URI'];
    const insecureUrls = urlVars
      .filter(varName => ENV[varName as keyof typeof ENV])
      .filter(varName => {
        // Add type assertion to ensure we're working with strings
        const value = ENV[varName as keyof typeof ENV];
        return typeof value === 'string' && !value.startsWith('https://');
      });
    
    if (insecureUrls.length > 0) {
      throw new Error(`Production environment requires HTTPS URLs for: ${insecureUrls.join(', ')}`);
    }
  }
}