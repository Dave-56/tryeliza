// src/api/routes/taskRoutes.ts
import express, { Request, Response } from 'express';
import { taskRepository, taskActionRepository, waitingTaskRepository } from '../../repositories';
import auth from '../middleware/auth';
import { BackendResponse } from '../../Types/model';
import { Task, InsertTask } from '../../db/schema';
import { WaitingTaskService } from '../../services/Task/WaitingTaskService';
import { AgentService } from '../../services/Agent/AgentService';
import { TaskActionRepository } from '../../repositories/TaskActionRepository';

const router = express.Router();
const waitingTaskService = new WaitingTaskService();
const agentService = new AgentService();
const taskActionRepository = new TaskActionRepository();

// Get all tasks for the authenticated user
router.get('/', auth, async (req: Request, res: Response<BackendResponse<Task[]>>) => {
  try {
    const userId = req.user.id;
    const tasks = await taskRepository.findByUserId(userId);
    
    res.json({
      data: tasks,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks', isSuccess: false });
  }
});

// Get task by ID
router.get('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = await taskRepository.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    // Verify user owns this task
    if (task.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to access this task', isSuccess: false });
    }
    
    res.json({
      data: task,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task', isSuccess: false });
  }
});

// Create a new task
router.post('/', auth, async (
  req: Request<{}, {}, InsertTask>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const userId = req.user.id;
    let taskData = { ...req.body };
    
    if (!taskData.title) {
      return res.status(400).json({ error: 'Task title is required', isSuccess: false });
    }
    
    // Handle date conversions
    if (taskData.received_date) {
      taskData.received_date = new Date(taskData.received_date);
    } else {
      taskData.received_date = new Date();
    }
    
    if (taskData.due_date) {
      taskData.due_date = new Date(taskData.due_date);
    }
    
    console.log('Task data before creation:', taskData);
    
    // Create task object with explicit date handling and automatic account assignment
    const newTask = await taskRepository.createTaskWithUserAccount({
      ...taskData,
      user_id: userId,
      created_at: new Date(),
      updated_at: new Date()
    });

    // If the task has a description, use LLM to extract action items
    if (newTask.description) {
      try {
        // Create a mock email thread from the task description
        const mockEmailThread = {
          id: `task-${newTask.id}`,
          messages: [
            {
              id: newTask.id.toString(),
              headers: {
                date: newTask.created_at ? newTask.created_at.toISOString() : new Date().toISOString(),
                from: newTask.sender_name || 'Task Creator',
                to: 'User',
                subject: newTask.title
              },
              body: newTask.description
            }
          ]
        };
        
        // Extract task data using the LLM
        const extractionResult = await agentService.extractTaskFromEmail(mockEmailThread, 'user');
        
        // If the LLM identified action items and the task is complex
        if (extractionResult.requires_action && 
            extractionResult.task && 
            extractionResult.task.is_complex && 
            extractionResult.task.action_items && 
            extractionResult.task.action_items.length > 0) {
          
          // Extract action texts from the action items
          const actionTexts = extractionResult.task.action_items
            .sort((a, b) => a.position - b.position)
            .map(item => item.action_text);
          
          // Add the action items to the task
          await taskActionRepository.addActionsToTask(newTask.id, actionTexts);
          
          console.log(`Added ${actionTexts.length} action items to task ${newTask.id}`);
        }
      } catch (error) {
        // Log the error but don't fail the task creation
        console.error('Error extracting action items from task description:', error);
      }
    }
    
    res.status(201).json({
      data: newTask,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task', isSuccess: false });
  }
});

// Update a task
router.put('/:id', auth, async (
  req: Request<{ id: string }, {}, Partial<InsertTask>>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    const taskData = req.body;
    
    // Verify task exists and belongs to user
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (existingTask.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this task', isSuccess: false });
    }
    
    // Convert date strings to Date objects
    if (taskData.received_date && typeof taskData.received_date === 'string') {
      taskData.received_date = new Date(taskData.received_date);
    }
    
    if (taskData.due_date && typeof taskData.due_date === 'string') {
      taskData.due_date = new Date(taskData.due_date);
    }
    
    // Update the task
    const updatedTask = await taskRepository.update(taskId, {
      ...taskData,
      updated_at: new Date()
    });
    
    // Check if the task is being moved to the waiting column (column_id = 3)
    if (updatedTask && taskData.column_id === 3) {
      console.log(`Task ${taskId} moved to waiting column. Creating/updating waiting task entry.`);
      
      try {
        // Analyze task notes to extract waiting information
        const waitingInfo = await waitingTaskService.analyzeTaskNotesForWaiting(taskId);
        
        // Create or update the waiting task entry
        const waitingTaskEntry = await waitingTaskRepository.updateWaitingInfo(
          taskId,
          waitingInfo.waiting_for,
          waitingInfo.waiting_time
        );
        
        console.log(`Waiting task entry created/updated for task ${taskId}:`, waitingTaskEntry);
      } catch (waitingError) {
        console.error(`Error creating waiting task entry for task ${taskId}:`, waitingError);
        // Continue with the response even if creating the waiting task entry fails
      }
    }
    
    console.log('Task updated successfully:', {
      id: updatedTask?.id,
      status: updatedTask?.status,
      column_id: updatedTask?.column_id,
      taskData: req.body // Log the original request data
    });
    
    res.json({
      data: updatedTask,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task', isSuccess: false });
  }
});

// Delete a task
router.delete('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ message: string }>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // Verify task exists and belongs to user
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (existingTask.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this task', isSuccess: false });
    }
    
    // Delete the task
    await taskRepository.delete(taskId);
    
    res.json({
      data: { message: 'Task deleted successfully' },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task', isSuccess: false });
  }
});

// Move task to a different column
router.put('/:id/column', auth, async (
  req: Request<{ id: string }, {}, { columnId: number, position: number }>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    const { columnId, position } = req.body;
    
    if (!columnId && columnId !== 0) {
      return res.status(400).json({ error: 'Column ID is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (existingTask.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to move this task', isSuccess: false });
    }
    
    // Move the task
    const updatedTask = await taskRepository.moveToColumn(taskId, columnId, position || 0);
    
    res.json({
      data: updatedTask,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error moving task:', error);
    res.status(500).json({ error: 'Failed to move task', isSuccess: false });
  }
});

// Update task status
router.put('/:id/status', auth, async (
  req: Request<{ id: string }, {}, { status: string }>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (existingTask.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this task', isSuccess: false });
    }
    
    // Update the task status
    const updatedTask = await taskRepository.updateStatus(taskId, status);
    
    res.json({
      data: updatedTask,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ error: 'Failed to update task status', isSuccess: false });
  }
});

// Update task priority
router.put('/:id/priority', auth, async (
  req: Request<{ id: string }, {}, { priority: string }>, 
  res: Response<BackendResponse<Task>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    const { priority } = req.body;
    
    if (!priority) {
      return res.status(400).json({ error: 'Priority is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (existingTask.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this task', isSuccess: false });
    }
    
    // Update the task priority
    const updatedTask = await taskRepository.updatePriority(taskId, priority);
    
    res.json({
      data: updatedTask,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating task priority:', error);
    res.status(500).json({ error: 'Failed to update task priority', isSuccess: false });
  }
});

// Get task with actions
router.get('/:id/with-actions', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ task: Task, actions: any[] }>>
) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // First check if task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to access this task', isSuccess: false });
    }
    
    // Get task with actions
    const taskWithActions = await taskRepository.findWithActions(taskId);
    
    res.json({
      data: taskWithActions,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task with actions:', error);
    res.status(500).json({ error: 'Failed to fetch task with actions', isSuccess: false });
  }
});

// Get waiting tasks
router.get('/waiting', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const waitingTasks = await taskRepository.getWaitingTasks(userId);
    
    res.json({
      data: waitingTasks,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching waiting tasks:', error);
    res.status(500).json({ error: 'Failed to fetch waiting tasks', isSuccess: false });
  }
});

// Get task count by status
router.get('/count/by-status', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const counts = await taskRepository.getTaskCountByStatus(userId);
    
    res.json({
      data: counts,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task counts:', error);
    res.status(500).json({ error: 'Failed to fetch task counts', isSuccess: false });
  }
});

export default router;