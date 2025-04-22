import "reflect-metadata";
import dotenv from 'dotenv';
import path from 'path';
import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';   
import cors from 'cors';
import { db } from './db';
import { validateEnv, validateProductionEnv } from './config/environment';
import userRoutes from './api/routes/userRoutes';
import emailAccountRoutes from './api/routes/emailAccountRoutes';
import taskActionRoutes from './api/routes/taskActionRoutes';
import emailRoutes from './api/routes/emailRoutes';
import taskRoutes from './api/routes/taskRoutes';
import taskNoteRoutes from './api/routes/taskNoteRoutes';
import columnRoutes from './api/routes/columnRoutes';
import dailySummaryRoutes from './api/routes/dailySummaryRoutes';
import analyticsRoutes from './api/routes/analyticsRoutes';
import waitingTaskRoutes from './api/routes/waitingTaskRoutes';
import webhookRoutes from './api/routes/webhookEndpoint';
import followUpEmailRoutes from './api/routes/followUpEmailRoutes';
//Import Webhook and Schedulers
import { SchedulerService } from './services/Scheduler/SchedulerService';
import { setupWatchRenewal } from './utils/webhookHelper';
import { checkWaitingTasks, initializeWaitingTaskScheduler } from './services/Scheduler/waitingTaskScheduler'; 
// Import Agent Service
import { AgentService } from './services/Agent/AgentService';

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development' });

// Initialize and start the scheduler
const schedulerService = new SchedulerService(new AgentService());
//schedulerService.startScheduledJobs();
// Initialize the waiting task scheduler
initializeWaitingTaskScheduler();

// Initialize Express application
const app: Express = express();
const PORT: number = parseInt(process.env.PORT || '5001', 10);

// CORS configuration
const allowedOrigins: string[] = [
    process.env.FRONTEND_URL!,
    'http://localhost:3001',
    'https://app.tryeliza.ai',
    'app.tryeliza.ai' // Include without https:// prefix
];

// Debug endpoint to check headers
app.get('/api/debug-cors', (req, res) => {
    console.log('Debug CORS headers:', {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer,
        'user-agent': req.headers['user-agent']
    });
    res.json({
        message: 'CORS debug info',
        headers: req.headers,
        allowedOrigins: allowedOrigins,
        env: {
            NODE_ENV: process.env.NODE_ENV,
            FRONTEND_URL: process.env.FRONTEND_URL
        }
    });
});

// Debug endpoint to manually trigger summary generation
app.get('/api/debug-trigger-summary', async (req, res) => {
    try {
        const period = (req.query.period as 'morning' | 'evening') || 'morning';
        const timezone = req.query.timezone as string;
        
        console.log(`[${new Date().toISOString()}] Manually triggering ${period} summary${timezone ? ` for timezone ${timezone}` : ''}`);
        
        await schedulerService.manuallyTriggerSummary(period, timezone);
        
        res.json({ 
            success: true, 
            message: `Summary generation triggered for ${period}${timezone ? ` in timezone ${timezone}` : ''}`,
            timestamp: new Date().toISOString(),
            serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error triggering summary:`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to trigger summary',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Received request from origin:`, origin);
      console.log(`[${timestamp}] Allowed origins:`, allowedOrigins);
      
      // Allow requests with no origin (like mobile apps, curl requests, or preflight OPTIONS)
      if (!origin) {
        console.log(`[${timestamp}] Request has no origin, allowing access`);
        callback(null, true);
        return;
      }
      
      // Check if the origin matches any allowed origins
      // Also check without https:// prefix since some browsers/configurations might strip it
      const originWithoutProtocol = origin.replace(/^https?:\/\//, '');
      
      if (allowedOrigins.includes(origin) || 
          allowedOrigins.includes(originWithoutProtocol) ||
          allowedOrigins.some(allowed => allowed.includes(originWithoutProtocol))) {
        console.log(`[${timestamp}] Origin ${origin} is allowed`);
        callback(null, true);
      } else {
        console.error(`[${timestamp}] CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};


// Test database connection before starting server
async function initializeApp() {
  try {
    // Validate environment variables
    validateEnv();
    validateProductionEnv();
    
    // Test database connection with a simple query
    await db.execute('SELECT 1');
    console.log('✅ Database connection successful');
    
    // Middleware
    // Apply CORS middleware
    app.use(cors(corsOptions));

    // Add preflight handling for all routes
    app.options('*', cors(corsOptions));
    app.use(bodyParser.json());
    app.use(express.json());
    
    // Basic error handler
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error(err.stack);
      res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
    
    // Root route
    app.get('/', (req: Request, res: Response) => {
      res.send('Server is running!');
    });

    app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });

    // Add back the /api/health endpoint for Railway
    app.get('/api/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });
    
 
    app.use('/api/users', userRoutes);
    app.use('/api/email-accounts', emailAccountRoutes);
    app.use('/api/emails', emailRoutes);
    app.use('/api/tasks', taskRoutes);
    app.use('/api/task-notes', taskNoteRoutes);
    app.use('/api/task-actions', taskActionRoutes);
    app.use('/api/columns', columnRoutes);
    app.use('/api/daily-summaries', dailySummaryRoutes);
    app.use('/api/webhooks', webhookRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/waiting-tasks', waitingTaskRoutes);
    app.use('/api/follow-up-emails', followUpEmailRoutes);

    // For production, conditionally serve static files
    // Serve React app
    if(process.env.NODE_ENV !== 'production') {
      // Serve static files from the React app
      app.use(express.static(path.join(__dirname, '../../Client/dist')));
      
      // Catch-all route for the React app (only in development)
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(__dirname, '../../Client/dist/index.html'));
      });
    }
    
    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Page Not found' });
    });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Initialize and start the scheduler with detailed logging
      console.log(`[${new Date().toISOString()}] Initializing summary scheduler...`);
      try {
        schedulerService.startScheduledJobs();
        console.log(`[${new Date().toISOString()}] Summary scheduler successfully initialized`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to initialize summary scheduler:`, error);
      }

      // Set up Gmail webhook renewal (runs every 6 hours)
      setInterval(async () => {
        try {
          console.log('Running scheduled Gmail webhook renewal');
          await setupWatchRenewal();
        } catch (error) {
          console.error('Error in scheduled Gmail webhook renewal:', error);
        }
      }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
      
      // Initial webhook renewal on startup
      setupWatchRenewal().catch(error => {
        console.error('Error in initial Gmail webhook renewal:', error);
      });

    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run initialization
initializeApp();

export default app;