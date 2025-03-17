// src/api/routes/waitingTasksRoutes.ts
import express, { Request, Response } from 'express';
import { waitingTaskRepository, taskRepository } from '../../repositories';
import auth from '../middleware/auth';
import { BackendResponse } from '../../Types/model';
import { WaitingTask } from '../../db/schema';
import { checkWaitingTasks } from '../../services/Scheduler/waitingTaskScheduler';

const router = express.Router();

// Get waiting info for a task
router.get('/task/:taskId', auth, async (
  req: Request<{ taskId: string }>, 
  res: Response<BackendResponse<WaitingTask>>
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
    
    // Get waiting info
    const waitingInfo = await waitingTaskRepository.findByTaskId(taskId);
    
    if (!waitingInfo) {
      return res.status(404).json({ error: 'Waiting info not found for this task', isSuccess: false });
    }
    
    res.json({
      data: waitingInfo,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching waiting info:', error);
    res.status(500).json({ error: 'Failed to fetch waiting info', isSuccess: false });
  }
});

// Update waiting info for a task
router.put('/task/:taskId', auth, async (
  req: Request<{ taskId: string }, {}, { waitingFor: string, waitingTime: string }>, 
  res: Response<BackendResponse<WaitingTask>>
) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { waitingFor, waitingTime } = req.body;
    
    if (!waitingFor || !waitingTime) {
      return res.status(400).json({ 
        error: 'Waiting for and waiting time are required', 
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
    
    // Update or create waiting info
    const updatedWaitingInfo = await waitingTaskRepository.updateWaitingInfo(
      taskId,
      waitingFor,
      waitingTime
    );
    
    // Also update task status to "Waiting" if it isn't already
    if (task.status !== 'Waiting') {
      await taskRepository.updateStatus(taskId, 'Waiting');
    }
    
    res.json({
      data: updatedWaitingInfo,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating waiting info:', error);
    res.status(500).json({ error: 'Failed to update waiting info', isSuccess: false });
  }
});


// Send a reminder for a task
router.post('/:taskId/send-reminder', auth, async (
  req: Request<{ taskId: string }>, 
  res: Response<BackendResponse<{ message: string }>>
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
      return res.status(403).json({ error: 'Not authorized to send reminder for this task', isSuccess: false });
    }

    // If we have a button for users to manually send reminder, then this is the route. But for now, it is in a scheduled job running everyday
    // Check waiting task scheduler
    // Check if contextual drafting is enabled for this user
  //   if (!user?.contextual_drafting_enabled) {
  //       console.log(`Skipping draft creation for task ${task.id} - contextual drafting disabled`);
  //       return false;
  // }
    
    // Get waiting info
    const waitingInfo = await waitingTaskRepository.findByTaskId(taskId);
    if (!waitingInfo) {
      return res.status(404).json({ error: 'Waiting info not found for this task', isSuccess: false });
    }
    
    // In a real application, here you would:
    // 1. Generate and send an email reminder
    // 2. Mark the reminder as sent in the database
    
    // For now, just mark the reminder as sent
    await waitingTaskRepository.markReminderSent(taskId);
    
    res.json({
      data: { message: 'Reminder sent successfully' },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder', isSuccess: false });
  }
});

// Get overdue tasks
router.get('/overdue/:days', auth, async (
  req: Request<{ days: string }>, 
  res: Response<BackendResponse<WaitingTask[]>>
) => {
  try {
    const days = parseInt(req.params.days);
    const userId = req.user.id;
    
    if (isNaN(days) || days <= 0) {
      return res.status(400).json({ error: 'Valid days parameter is required', isSuccess: false });
    }
    
    // Get overdue tasks
    const overdueTasks = await waitingTaskRepository.getTasksOverdue(days);
    
    // Filter tasks by user ID
    const userOverdueTasks = await Promise.all(
      overdueTasks.map(async (waitingTask) => {
        const task = await taskRepository.findById(waitingTask.task_id);
        return task && task.user_id === userId ? waitingTask : null;
      })
    );
    
    const filteredTasks = userOverdueTasks.filter(task => task !== null) as WaitingTask[];
    
    res.json({
      data: filteredTasks,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching overdue tasks:', error);
    res.status(500).json({ error: 'Failed to fetch overdue tasks', isSuccess: false });
  }
});

// In your routes file
router.post('/check', async (req, res) => {
  try {
      const results = await checkWaitingTasks();
      res.json(results);
  } catch (error) {
      console.error('Error checking waiting tasks:', error);
      res.status(500).json({ error: 'Failed to check waiting tasks' });
  }
});

// Find tasks that need reminders (admin or scheduled task endpoint)
router.get('/needs-reminder', auth, async (
  req: Request, 
  res: Response<BackendResponse<WaitingTask[]>>
) => {
  try {
    // Note: In a real application, this endpoint would typically
    // be restricted to admins or used by a scheduled job.
    // For now, we'll just return all tasks needing reminders,
    // but not filter by user for simplicity.
    
    const tasksNeedingReminders = await waitingTaskRepository.findTasksNeedingReminders();
    
    // Optionally, you could filter these by user ID if needed
    
    res.json({
      data: tasksNeedingReminders,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching tasks needing reminders:', error);
    res.status(500).json({ error: 'Failed to fetch tasks needing reminders', isSuccess: false });
  }
});

export default router;