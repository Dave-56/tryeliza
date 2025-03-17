// src/api/routes/analyticsRoutes.ts
import express, { Request, Response } from 'express';
import { analyticsRepository } from '../../repositories';
import { BackendResponse } from '../../Types/model';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get user analytics
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    console.log('Fetching analytics for user:', userId);
    
    const analytics = await analyticsRepository.getUserAnalytics(userId);
    console.log('Fetched analytics:', JSON.stringify(analytics));
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch analytics data' 
    });
  }
});

// Get total analytics
router.get('/total', auth, async (req: Request, res: Response) => {
  try {
    console.log('Fetching total analytics');
    
    const totalAnalytics = await analyticsRepository.getTotalAnalytics();
    
    res.json({
      success: true,
      data: totalAnalytics
    });
  } catch (error) {
    console.error('Error fetching total analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch total analytics data' 
    });
  }
});

// Get analytics by date range
router.get('/date-range', auth, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    console.log('Fetching analytics for date range:', startDate, endDate);
    
    const analytics = await analyticsRepository.getAnalyticsByDateRange(startDate, endDate);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching analytics by date range:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch analytics data' 
    });
  }
});

// Get draft activities for a user
router.get('/draft-activities', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    console.log('Fetching draft activities for user:', userId, 'with limit:', limit);
    
    const activities = await analyticsRepository.getDraftActivities(userId, limit);
    
    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching draft activities:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch draft activities' 
    });
  }
});

export default router;