// routes/dailySummaryRoutes.ts
import express, { Request, Response } from 'express';
import { dailySummaryRepository, emailRepository } from '../../repositories';
import { BackendResponse } from '../../Types/model';
import auth from '../middleware/auth.js';
import { SchedulerService } from '../../services/Scheduler/SchedulerService.js';
import { formatForAPI, isValidDateFormat, formatForEmailSummary } from '../../utils/dateUtils.js';

const schedulerService = new SchedulerService();

// Helper function to safely format dates
function formatDate(date: any): string {
  if (!date) return new Date().toISOString().replace('T', ' ').substring(0, 16);
  
  if (typeof date === 'string') {
    // If it's already a string in YYYY-MM-DD format, add current time
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const now = new Date();
      return `${date} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    // Otherwise try to parse it and format with time
    try {
      const parsedDate = new Date(date);
      return parsedDate.toISOString().replace('T', ' ').substring(0, 16);
    } catch (e) {
      return new Date().toISOString().replace('T', ' ').substring(0, 16);
    }
  }
  
  if (date instanceof Date) {
    return date.toISOString().replace('T', ' ').substring(0, 16);
  }
  
  // Fallback: try to create a date from whatever we have
  try {
    return new Date(date).toISOString().replace('T', ' ').substring(0, 16);
  } catch (e) {
    return new Date().toISOString().replace('T', ' ').substring(0, 16);
  }
}


// Define interface for daily summary response
interface DailySummaryResponse {
  userId: string;
  summaryDate: string;
  period: string;
  timezone: string;
  categoriesSummary: Array<{
    category: string;
    count: number;
    summaries: Array<{
      title: string;
      subject: string;
      gmail_id: string;
      sender: string;
      receivedAt: string;
      headline: string;
      priority_score: number;
      insights?: {
        key_highlights?: string[];
        why_this_matters?: string;
        next_step?: string[];
      };
      is_processed: boolean;
    }>;
  }>;
  status: string;
  createdAt: string;
  lastUpdated: string;
  currentServerTime: string;
  isSuccess: boolean;
}

const router = express.Router();

// Get summary for a specific date (defaults to today)
router.get('/', auth, async (
  req: Request, 
  res: Response<BackendResponse<DailySummaryResponse>>
) => {
  try {
    console.log('[ENV CHECK] Supabase URL:', process.env.SUPABASE_URL?.substring(0, 15) + '...');
    console.log('[ENV CHECK] Supabase Key exists:', !!process.env.SUPABASE_ANON_KEY);

    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    // Parse and validate query parameters
    
    const dateStr = req.query.date as string | undefined;
    console.log('[DEBUG] Raw date string from request:', dateStr);
    const period = (req.query.period as string) || 'morning';
    
    // Get the user's timezone from the database or request, or default to system timezone
    const userTimezone = req.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log('[DEBUG] User timezone:', userTimezone);

    // Create a date object in the user's timezone
    let date: Date;
    
    if (dateStr) {
      // If date string is provided, ensure it's interpreted in the user's timezone
      if (!isValidDateFormat(dateStr)) {
        return res.status(400).json({ 
          error: 'Invalid date format. Use YYYY-MM-DD', 
          isSuccess: false 
        });
      }
      // Parse the date string directly in user's timezone without UTC conversion
      const [year, month, day] = dateStr.split('-').map(Number);
      date = new Date(Date.UTC(year, month - 1, day));
      console.log('[DEBUG] Input date string:', dateStr);
      console.log('[DEBUG] Parsed UTC date:', date.toISOString());
    } else {
      // When no date provided, format current time directly in user's timezone
      const formattedDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      
      // Parse the formatted date to create a UTC date object for other uses
      const [year, month, day] = formattedDate.split('-').map(Number);
      date = new Date(Date.UTC(year, month - 1, day));
      console.log('[DEBUG] Using default date (today):', formattedDate);
    }
    
    // Use dateStr if provided, otherwise use the already formatted date from above
    const formattedDate = dateStr || (new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()));
    
    console.log(`[DEBUG] Formatted date for query: ${formattedDate}, period: ${period}, userId: ${userId}`);
    
    console.log(`API: Querying for date ${formattedDate} and period ${period} based on user timezone ${userTimezone}`);
    
    // Pass the formatted date string directly to the repository instead of the Date object
    // This ensures we're using the exact same date format in both the API and repository
    console.log('[DEBUG] Calling repository.findByDateAndUser with params:', { userId, formattedDate, period });
    const summary = await dailySummaryRepository.findByDateAndUser(userId, formattedDate, period);
    console.log('[DEBUG] Repository returned summary:', summary ? 'Found' : 'Not found');

    if (summary && summary.categories_summary) {
      console.log('[DEBUG] Summary has categories:', summary.categories_summary.length);
      console.log('[DEBUG] Full summary object:', JSON.stringify(summary, null, 2));
      console.log('[DEBUG] Categories summary:', JSON.stringify(summary.categories_summary, null, 2));
    }
    if (!summary) {
      console.log('[DEBUG] No summary found, returning empty response');
      // Return a valid response structure with empty categories instead of an error
      // This allows the frontend to handle the case where no summary exists yet
      return res.json({
        data: {
          userId: userId,
          summaryDate: formatForAPI(date),
          period: period,
          timezone: userTimezone,
          categoriesSummary: [], // Empty array instead of undefined
          status: 'pending',
          createdAt: formatForAPI(new Date()),
          lastUpdated: formatForAPI(new Date()),
          currentServerTime: formatForAPI(new Date()),
          isSuccess: true
        },
        isSuccess: true,
        error: `No summary found for ${formatForEmailSummary(date, userTimezone)}. You can generate one using the 'Generate New Summary' button.`
      });
    }

    // Determine the most recent update timestamp
    const lastRunAt = summary.last_run_at ? new Date(summary.last_run_at) : null;
    const updatedAt = summary.updated_at ? new Date(summary.updated_at) : null;
    
    // Use the most recent timestamp, or fall back to created_at if neither exists
    let lastUpdated = summary.created_at;
    if (lastRunAt && updatedAt) {
      lastUpdated = lastRunAt > updatedAt ? lastRunAt : updatedAt;
    } else if (lastRunAt) {
      lastUpdated = lastRunAt;
    } else if (updatedAt) {
      lastUpdated = updatedAt;
    }

    // Add a cache-busting timestamp to ensure frontend always sees the latest value
    const currentTimestamp = new Date();

    // Function to sort emails by priority (High > Medium > Low)
    const sortEmailsByPriority = (categoriesSummary: any[] | null) => {
      if (!categoriesSummary) return [];
      
      const sortedCategories = categoriesSummary.map(category => {
        // Sort the items array by priority_score (highest first)
        const sortedItems = [...category.summaries].sort((a, b) => {
          const scoreA = a.priority_score || 50; // Default to medium priority (50) if not provided
          const scoreB = b.priority_score || 50;
          return scoreB - scoreA; // Sort in descending order (higher scores first)
        });
        
        // Return a new category object with sorted items
        return {
          ...category,
          summaries: sortedItems
        };
      });

      // Log the sorted results
      console.log('[DEBUG] Sorted categories by priority:', JSON.stringify(sortedCategories, null, 2));
      
      return sortedCategories;
    };

    // Check if summary is expired and needs refreshing
    if (dailySummaryRepository.isExpired(summary)) {
      // You might want to queue a background job to refresh it here
      // For now, just return the expired summary with a notice
      return res.json({
        data: {
          userId: summary.user_id,
          summaryDate: formatForAPI(new Date(summary.summary_date)),
          period: summary.period,
          timezone: summary.timezone || 'UTC',
          categoriesSummary: sortEmailsByPriority(summary.categories_summary?.map(category => ({
            title: category.category,  
            count: category.count,
            summaries: category.summaries?.map(item => ({
              title: item.subject,  
              subject: item.subject,
              gmail_id: item.gmail_id,
              sender: item.sender,
              receivedAt: item.received_at,
              headline: item.headline,
              priority_score: item.priority_score || 50,
              insights: item.insights,
              is_processed: true
            })) || []
          })) || []),
          status: summary.status,
          createdAt: formatForAPI(new Date(summary.created_at)),
          lastUpdated: formatForAPI(new Date(lastUpdated)),
          currentServerTime: formatForAPI(currentTimestamp),
          isSuccess: true
        },
        isSuccess: true,
        error: 'This summary is outdated and is being refreshed'
      });
    }
    
    return res.json({
      data: {
        userId: summary.user_id,
        summaryDate: formatDate(summary.summary_date),
        period: summary.period,
        timezone: summary.timezone || 'UTC',
        categoriesSummary: sortEmailsByPriority(summary.categories_summary?.map(category => ({
          title: category.category,  
          count: category.count,
          summaries: category.summaries?.map(item => ({
            title: item.subject,  
            subject: item.subject,
            gmail_id: item.gmail_id,
            sender: item.sender,
            receivedAt: item.received_at,
            headline: item.headline,
            priority_score: item.priority_score || 50,
            insights: item.insights,
            is_processed: true
          })) || []
        })) || []),
        status: summary.status,
        createdAt: formatForAPI(summary.created_at),
        lastUpdated: formatForAPI(lastUpdated),
        currentServerTime: formatForAPI(currentTimestamp),
        isSuccess: true
      },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error retrieving daily summary:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve daily summary', 
      isSuccess: false 
    });
  }
});

// Get all summaries for the current user (paginated)
router.get('/history', auth, async (
  req: Request, 
  res: Response<BackendResponse<DailySummaryResponse[]>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }
    
    const limit = Number(req.query.limit) || 30;
    const offset = Number(req.query.offset) || 0;
    
    // Validate pagination params
    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return res.status(400).json({ 
        error: 'Invalid pagination parameters', 
        isSuccess: false 
      });
    }
    
    const summaries = await dailySummaryRepository.findByUser(userId, limit, offset);
    
    const summariesWithTimestamps = summaries.map(summary => {
      // Determine the most recent update timestamp
      const lastRunAt = summary.last_run_at ? new Date(summary.last_run_at) : null;
      const updatedAt = summary.updated_at ? new Date(summary.updated_at) : null;
      
      // Use the most recent timestamp, or fall back to created_at if neither exists
      let lastUpdated = summary.created_at;
      if (lastRunAt && updatedAt) {
        lastUpdated = lastRunAt > updatedAt ? lastRunAt : updatedAt;
      } else if (lastRunAt) {
        lastUpdated = lastRunAt;
      } else if (updatedAt) {
        lastUpdated = updatedAt;
      }
      
      // Add a cache-busting timestamp to ensure frontend always sees the latest value
      const currentTimestamp = new Date();

      return {
        userId: summary.user_id,
        summaryDate: formatDate(summary.summary_date),
        period: summary.period,
        timezone: summary.timezone,
        categoriesSummary: summary.categories_summary,
        status: summary.status,
        createdAt: formatDate(summary.created_at),
        lastUpdated: formatDate(lastUpdated),
        currentServerTime: formatDate(currentTimestamp),
        isSuccess: true
      };
    });
    
    return res.json({
      data: summariesWithTimestamps,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error retrieving summary history:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve summary history', 
      isSuccess: false 
    });
  }
});

// Get summaries within a date range
router.get('/range', auth, async (
  req: Request, 
  res: Response<BackendResponse<DailySummaryResponse[]>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }
    
    const startDateStr = req.query.startDate as string;
    const endDateStr = req.query.endDate as string;
    
    if (!startDateStr || !endDateStr) {
      return res.status(400).json({ 
        error: 'Both startDate and endDate are required', 
        isSuccess: false 
      });
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use YYYY-MM-DD', 
        isSuccess: false 
      });
    }
    
    // Ensure start date is earlier than end date
    if (startDate > endDate) {
      return res.status(400).json({ 
        error: 'Start date must be earlier than end date', 
        isSuccess: false 
      });
    }
    
    const summaries = await dailySummaryRepository.findByDateRange(userId, startDate, endDate);
    
    const summariesWithTimestamps = summaries.map(summary => {
      // Determine the most recent update timestamp
      const lastRunAt = summary.last_run_at ? new Date(summary.last_run_at) : null;
      const updatedAt = summary.updated_at ? new Date(summary.updated_at) : null;
      
      // Use the most recent timestamp, or fall back to created_at if neither exists
      let lastUpdated = summary.created_at;
      if (lastRunAt && updatedAt) {
        lastUpdated = lastRunAt > updatedAt ? lastRunAt : updatedAt;
      } else if (lastRunAt) {
        lastUpdated = lastRunAt;
      } else if (updatedAt) {
        lastUpdated = updatedAt;
      }
      
      // Add a cache-busting timestamp to ensure frontend always sees the latest value
      const currentTimestamp = new Date();

      return {
        userId: summary.user_id,
        summaryDate: formatDate(summary.summary_date),
        period: summary.period,
        timezone: summary.timezone,
        categoriesSummary: summary.categories_summary,
        status: summary.status,
        createdAt: formatDate(summary.created_at),
        lastUpdated: formatDate(lastUpdated),
        currentServerTime: formatDate(currentTimestamp),
        isSuccess: true
      };
    });
    
    return res.json({
      data: summariesWithTimestamps,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error retrieving summary range:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve summary range', 
      isSuccess: false 
    });
  }
});

// Generate new summary, force refresh
router.post('/trigger', auth, async (
  req: Request, 
  res: Response<BackendResponse<any>>
) => {
  try {
    // In production, you might want to restrict this to admin users only
    const period = (req.body.period as 'morning' | 'evening') || 'morning';
    console.log("Period at the backend: ", period);
    // Validate period
    if (period !== 'morning' && period !== 'evening') {
      return res.status(400).json({ 
        error: 'Invalid period. Must be "morning" or "evening"', 
        isSuccess: false 
      });
    }
    
    // Trigger summary generation
    // For testing, we can trigger it just for the current user
    const userId = req.user.id;
    
    // Generate summary for the current user
    console.log(`Manually triggering ${period} summary generation for user ${userId}`);
    await schedulerService.emailSummaryService.generateDailySummary(userId, period);
    
    return res.json({
      data: { 
        message: `${period} summary generation completed for your account`,
      },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error triggering summary generation:', error);
    return res.status(500).json({ 
      error: 'Failed to trigger summary generation', 
      isSuccess: false 
    });
  }
});

export default router;