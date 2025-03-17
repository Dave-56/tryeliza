// src/api/routes/emailRoutes.ts
import { Router, Request, Response } from 'express';
import auth from '../middleware/auth';
import { emailAccountRepository } from '../../repositories';
import { GoogleService } from '../../services/Google/GoogleService';
import { TaskRepository } from '../../repositories/TaskRepository';
import { EmailUtils } from '../../services/Google/emailUtils';

const router = Router();
const taskRepository = new TaskRepository();

router.get('/thread/:threadId', async (req: Request, res: Response) => {
  const { threadId } = req.params;
  const type = req.query.type as string || 'latest';
  console.log("fetching thread id")
  try {
    // Find the task associated with this thread_id to get the correct account
    const task = await taskRepository.findByThreadId(threadId);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found for this thread' });
      return;
    }
    
    // Verify that the task belongs to the authenticated user
    // if (task.user_id !== req.user.id) {
    //   res.status(403).json({ error: 'Not authorized to access this thread' });
    //   return;
    // }
    
    // Check if the task has an associated account
    if (!task.account_id) {
      res.status(400).json({ error: 'No email account associated with this task' });
      return;
    }
    
    // Get the email account associated with this task
    const userAccount = await emailAccountRepository.findById(task.account_id);

    if (!userAccount) {
      res.status(401).json({ error: 'Email account not found' });
      return;
    }

    if (!userAccount.tokens) {
      res.status(401).json({ error: 'User not authenticated with Gmail' });
      return;
    }

    // Check if tokens contain the required access_token and refresh_token
    if (!userAccount.tokens.access_token || !userAccount.tokens.refresh_token) {
      res.status(401).json({ error: 'Invalid authentication tokens' });
      return;
    }

    // Initialize GoogleService with user tokens
    const googleService = new GoogleService(
      userAccount.tokens.access_token,
      userAccount.tokens.refresh_token,
      userAccount.id.toString()
    );
    
    // Ensure token validity
    await googleService.ensureValidToken();
    
    // Use the public getThreadById method from GoogleService
    const threadData = await googleService.getThreadById(threadId);
    
    // Return only the original message or all messages based on type
    const responseMessages = type === 'original' 
      ? threadData.messages.slice(0, 1) 
      : threadData.messages;
    
    // console.log("response messages: ", responseMessages);


    // Set status first, then send json response
    res.status(200).json({
      messages: responseMessages,
      messageCount: threadData.messageCount,
      participants: threadData.participants
    });
  } catch (error) {
    console.error('Error fetching email thread:', error);
    
    // More specific error handling
    if (error.message === 'Thread not found') {
      res.status(404).json({ error: 'Thread not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch email thread' });
    }
  }
});

/**
 * Route to fetch just the thread summary (participants and message count)
 * This is a lightweight alternative when you don't need the full content
 */
router.get('/thread/:threadId/summary', async (req: Request, res: Response) => {
  const { threadId } = req.params;
  console.log("Fetching thread summary for thread ID:", threadId);
  
  try {
    // Find the task associated with this thread_id to get the correct account
    const task = await taskRepository.findByThreadId(threadId);
    //console.log("Task found:", task);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found for this thread' });
      return;
    }
    
    // Check if the task has an associated account
    if (!task.account_id) {
      res.status(400).json({ error: 'No email account associated with this task' });
      return;
    }
    
    // Get the email account associated with this task
    const userAccount = await emailAccountRepository.findById(task.account_id);
    //console.log("User account found:", userAccount);

    if (!userAccount) {
      res.status(401).json({ error: 'Email account not found' });
      return;
    }

    if (!userAccount.tokens) {
      res.status(401).json({ error: 'User not authenticated with Gmail' });
      return;
    }

    // Check if tokens contain the required access_token and refresh_token
    if (!userAccount.tokens.access_token || !userAccount.tokens.refresh_token) {
      res.status(401).json({ error: 'Invalid authentication tokens' });
      return;
    }

    // Initialize GoogleService with user tokens
    const googleService = new GoogleService(
      userAccount.tokens.access_token,
      userAccount.tokens.refresh_token,
      userAccount.id.toString()
    );
    
    // Ensure token validity
    await googleService.ensureValidToken();
    
    // Use the getThreadById method but only return the summary data
    const threadData = await googleService.getThreadById(threadId);
    //console.log("Thread data:", threadData);
    
    // Return only the summary information
    res.status(200).json({
      messageCount: threadData.messageCount,
      participants: threadData.participants,
    });
  } catch (error) {
    console.error('Error fetching thread summary:', error);
    
    // More specific error handling
    if (error.message === 'Thread not found') {
      res.status(404).json({ error: 'Thread not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch thread summary' });
    }
  }
});

/**
 * Route to fetch a single email's content by email ID
 */
router.get('/:emailId', async (req: Request, res: Response) => {
  const { emailId } = req.params;
  console.log("Fetching email content for email ID:", emailId);
  
  try {
    // Find the task associated with this email_id to get the correct account
    const task = await taskRepository.findByEmailId(emailId);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found for this email' });
      return;
    }
    
    // Check if the task has an associated account
    if (!task.account_id) {
      res.status(400).json({ error: 'No email account associated with this task' });
      return;
    }
    
    // Get the email account associated with this task
    const userAccount = await emailAccountRepository.findById(task.account_id);

    if (!userAccount) {
      res.status(401).json({ error: 'Email account not found' });
      return;
    }

    if (!userAccount.tokens) {
      res.status(401).json({ error: 'User not authenticated with Gmail' });
      return;
    }

    // Check if tokens contain the required access_token and refresh_token
    if (!userAccount.tokens.access_token || !userAccount.tokens.refresh_token) {
      res.status(401).json({ error: 'Invalid authentication tokens' });
      return;
    }

    // Initialize GoogleService with user tokens
    const googleService = new GoogleService(
      userAccount.tokens.access_token,
      userAccount.tokens.refresh_token,
      userAccount.id.toString()
    );
    
    try {
      // First try to get the thread that contains this email
      // This approach assumes the email ID might be part of a thread
      const threadResponse = await googleService.getThreadById(task.thread_id || '');
      
      // Find the specific email in the thread
      const emailMessage = threadResponse.messages.find(msg => msg.id === emailId);
      
      if (emailMessage) {
        // Return the found email
        res.status(200).json(emailMessage);
        return;
      }
      
      // If email not found in thread, use the new getEmailById method
      const email = await googleService.getEmailById(emailId);
      
      if (!email) {
        throw new Error('Email not found');
      }
      
      // Return the formatted email
      res.status(200).json(email);
    } catch (error) {
      console.error('Error fetching email content:', error);
      
      // More specific error handling
      if (error.message === 'Email not found') {
        res.status(404).json({ error: 'Email not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch email content' });
      }
    }
  } catch (error) {
    console.error('Error fetching email content:', error);
    
    // More specific error handling
    if (error.message === 'Email not found') {
      res.status(404).json({ error: 'Email not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch email content' });
    }
  }
});

export default router;