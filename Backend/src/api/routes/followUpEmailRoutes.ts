// Add to src/api/routes/followUpEmailRoutes.ts
import express, { Request, Response } from 'express';
import { followUpEmailRepository, taskRepository, emailAccountRepository } from '../../repositories';
import auth from '../middleware/auth';
import { BackendResponse } from '../../Types/model';
import { FollowUpEmail } from '../../db/schema';
import { DraftActions } from '../../services/Google/Actions/draft';

// Extended interface for the response that includes reminder_sent
interface FollowUpEmailResponse extends FollowUpEmail {
  reminder_sent?: string;
}

const router = express.Router();

// Get all follow-up emails for a task
router.get('/task/:taskId', auth, async (
  req: Request<{ taskId: string }>, 
  res: Response<BackendResponse<FollowUpEmail[]>>
) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to access this task', isSuccess: false });
    }
    
    // Get follow-up emails
    const followUpEmails = await followUpEmailRepository.findByTaskId(taskId);
    
    res.json({
      data: followUpEmails,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching follow-up emails:', error);
    res.status(500).json({ error: 'Failed to fetch follow-up emails', isSuccess: false });
  }
});

// Create a new follow-up email
router.post('/task/:taskId', auth, async (
  req: Request<
    { taskId: string }, 
    {}, 
    { 
      email_subject: string, 
      email_content: string, 
      recipient: string, 
      status: string, 
      scheduled_time?: string 
    }
  >, 
  res: Response<BackendResponse<FollowUpEmail>>
) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { email_subject, email_content, recipient, status, scheduled_time } = req.body;
    
    if (!email_subject || !email_content || !recipient || !status) {
      return res.status(400).json({ 
        error: 'Subject, content, recipient and status are required', 
        isSuccess: false 
      });
    }
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this task', isSuccess: false });
    }
    
    // Create follow-up email
    const newFollowUpEmail = await followUpEmailRepository.create({
      task_id: taskId,
      email_subject,
      email_content,
      recipient,
      status,
      scheduled_time: scheduled_time ? new Date(scheduled_time) : undefined,
    });
    
    res.status(201).json({
      data: newFollowUpEmail,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error creating follow-up email:', error);
    res.status(500).json({ error: 'Failed to create follow-up email', isSuccess: false });
  }
});

// Send a follow-up email
router.post('/send/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<FollowUpEmailResponse>>
) => {
  try {
    const emailId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // Get the follow-up email
    const followUpEmail = await followUpEmailRepository.findById(emailId);
    if (!followUpEmail) {
      return res.status(404).json({ error: 'Follow-up email not found', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(followUpEmail.task_id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to send this follow-up email', isSuccess: false });
    }
    
    // Get the email account associated with the task
    let emailAccount;
    
    if (task.account_id) {
      // If task has an account_id, use that specific account
      emailAccount = await emailAccountRepository.findById(task.account_id);
    } else {
      // Fallback to primary account if task doesn't have an account_id
      emailAccount = await emailAccountRepository.findPrimaryAccount(task.user_id);
    }
    
    if (!emailAccount || !emailAccount.tokens) {
      return res.status(400).json({ 
        error: 'No connected email account found', 
        isSuccess: false 
      });
    }
    
    const { access_token, refresh_token } = emailAccount.tokens;
    console.log("access token is : ", access_token)
    console.log("refresh token is : ", refresh_token)
    console.log("email address is : ", emailAccount.email_address)
    
    if (!access_token) {
      return res.status(400).json({ 
        error: 'Invalid email account credentials', 
        isSuccess: false 
      });
    }
    
    // Create a Gmail draft using Eliza AI
    const draftActions = new DraftActions(
      access_token,
      refresh_token || '',
      emailAccount.id.toString() // Pass the email account ID, not the email address
    );
    // for testing,let's use draft but we'll need to change to send_message
    await draftActions.createDraft(
      {
        to: followUpEmail.recipient,
        subject: followUpEmail.email_subject,
        body: followUpEmail.email_content
      },
      task.thread_id || '' // Provide empty string as fallback if thread_id is null
    );
    
    // Update the follow-up email status
    const updatedEmail = await followUpEmailRepository.updateStatus(emailId, 'created_in_gmail');
    
    console.log(`Created Gmail draft for follow-up email ${emailId}`);

    // Can we fetch the value of reminder_sent for the waiting_task associated with this task_id?
    const waitingTask = await taskRepository.findByTaskId(taskId);
    if (!waitingTask) {
      return res.status(404).json({ error: 'Waiting task not found', isSuccess: false });
    }
    
    // fetch the reminder_sent value
    const reminderSent = waitingTask.reminder_sent;
    
    // Create a response object that includes the updatedEmail data plus the reminder_sent field
    const responseData: FollowUpEmailResponse | undefined = updatedEmail ? {
      ...updatedEmail,
      reminder_sent: reminderSent || ''
    } : undefined;
    
    res.json({
      data: responseData,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error sending follow-up email:', error);
    res.status(500).json({ error: 'Failed to send follow-up email', isSuccess: false });
  }
});

// Update a follow-up email
router.put('/:id', auth, async (
  req: Request<
    { id: string }, 
    {}, 
    { 
      email_subject?: string, 
      email_content?: string, 
      recipient?: string, 
      status?: string, 
      scheduled_time?: string 
    }
  >, 
  res: Response<BackendResponse<FollowUpEmail>>
) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user.id;
    const updateData = req.body;
    
    // Get the follow-up email
    const followUpEmail = await followUpEmailRepository.findById(id);
    if (!followUpEmail) {
      return res.status(404).json({ error: 'Follow-up email not found', isSuccess: false });
    }
    
    // Verify task belongs to user
    const task = await taskRepository.findById(followUpEmail.task_id);
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this follow-up email', isSuccess: false });
    }
    
    // Convert scheduled_time to Date if provided
    if (updateData.scheduled_time) {
      updateData.scheduled_time = new Date(updateData.scheduled_time);
    }
    
    // Update follow-up email
    const updatedFollowUpEmail = await followUpEmailRepository.update(id, updateData);
    
    res.json({
      data: updatedFollowUpEmail,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating follow-up email:', error);
    res.status(500).json({ error: 'Failed to update follow-up email', isSuccess: false });
  }
});

// Delete a follow-up email
router.delete('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ message: string }>>
) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user.id;
        
        // Get the follow-up email
        const followUpEmail = await followUpEmailRepository.findById(id);
        if (!followUpEmail) {
          return res.status(404).json({ error: 'Follow-up email not found', isSuccess: false });
        }
        
        // Verify task belongs to user
        const task = await taskRepository.findById(followUpEmail.task_id);
        if (!task || task.user_id !== userId) {
          return res.status(403).json({ error: 'Not authorized to delete this follow-up email', isSuccess: false });
        }
        
        // Delete the follow-up email
        const deleted = await followUpEmailRepository.delete(id);
        
        if (deleted) {
          res.json({
            data: { message: 'Follow-up email deleted successfully' },
            isSuccess: true
          });
        } else {
          res.status(500).json({ error: 'Failed to delete follow-up email', isSuccess: false });
        }
      } catch (error) {
        console.error('Error deleting follow-up email:', error);
        res.status(500).json({ error: 'Failed to delete follow-up email', isSuccess: false });
      }
    });
    
export default router;