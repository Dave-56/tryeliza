// src/api/routes/taskActionsRoutes.ts
import express, { Request, Response } from 'express';
import { taskActionRepository, taskRepository } from '../../repositories';
import auth from '../middleware/auth';
import { BackendResponse } from '../../Types/model';
import { TaskAction, InsertTaskAction } from '../../db/schema';

const router = express.Router();

// Get actions for a task
router.get('/task/:taskId', auth, async (
  req: Request<{ taskId: string }>, 
  res: Response<BackendResponse<TaskAction[]>>
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
    
    // Get actions for the task
    const actions = await taskActionRepository.findByTaskId(taskId);
    
    res.json({
      data: actions,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task actions:', error);
    res.status(500).json({ error: 'Failed to fetch task actions', isSuccess: false });
  }
});

// Add actions to a task
router.post('/task/:taskId', auth, async (
  req: Request<{ taskId: string }, {}, { actions: string[] }>, 
  res: Response<BackendResponse<TaskAction[]>>
) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { actions } = req.body;
    
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'Actions array is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this task', isSuccess: false });
    }
    
    // Add actions to the task
    const newActions = await taskActionRepository.addActionsToTask(taskId, actions);
    
    res.status(201).json({
      data: newActions,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error adding task actions:', error);
    res.status(500).json({ error: 'Failed to add task actions', isSuccess: false });
  }
});

// Toggle action completion status
router.put('/:id/toggle', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<TaskAction>>
) => {
  try {
    const actionId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // Get the action
    const action = await taskActionRepository.findById(actionId);
    if (!action) {
      return res.status(404).json({ error: 'Action not found', isSuccess: false });
    }
    
    // Verify the task belongs to the user
    const task = await taskRepository.findById(action.task_id);
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this action', isSuccess: false });
    }
    
    // Toggle the action
    const updatedAction = await taskActionRepository.toggleCompletion(actionId);
    
    res.json({
      data: updatedAction,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error toggling action:', error);
    res.status(500).json({ error: 'Failed to toggle action', isSuccess: false });
  }
});

// Delete an action
router.delete('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ message: string }>>
) => {
  try {
    const actionId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // Get the action
    const action = await taskActionRepository.findById(actionId);
    if (!action) {
      return res.status(404).json({ error: 'Action not found', isSuccess: false });
    }
    
    // Verify the task belongs to the user
    const task = await taskRepository.findById(action.task_id);
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this action', isSuccess: false });
    }
    
    // Delete the action
    await taskActionRepository.delete(actionId);
    
    res.json({
      data: { message: 'Action deleted successfully' },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ error: 'Failed to delete action', isSuccess: false });
  }
});

// Reorder actions for a task
router.put('/task/:taskId/reorder', auth, async (
  req: Request<{ taskId: string }, {}, { actionIds: number[] }>, 
  res: Response<BackendResponse<{ success: boolean }>>
) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { actionIds } = req.body;
    
    if (!actionIds || !Array.isArray(actionIds) || actionIds.length === 0) {
      return res.status(400).json({ error: 'Action IDs array is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this task', isSuccess: false });
    }
    
    // Reorder the actions
    const success = await taskActionRepository.reorderActions(taskId, actionIds);
    
    res.json({
      data: { success },
      isSuccess: success
    });
  } catch (error) {
    console.error('Error reordering actions:', error);
    res.status(500).json({ error: 'Failed to reorder actions', isSuccess: false });
  }
});

// Get completion stats for a task
router.get('/task/:taskId/stats', auth, async (
  req: Request<{ taskId: string }>, 
  res: Response<BackendResponse<{ completed: number, total: number }>>
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
    
    // Get completion stats
    const stats = await taskActionRepository.getCompletionStats(taskId);
    
    res.json({
      data: stats,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task action stats:', error);
    res.status(500).json({ error: 'Failed to fetch task action stats', isSuccess: false });
  }
});

// Endpoint for AI-powered action generation
router.post('/task/:taskId/generate', auth, async (
  req: Request<{ taskId: string }, {}, {}>, 
  res: Response<BackendResponse<TaskAction[]>>
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
      return res.status(403).json({ error: 'Not authorized to modify this task', isSuccess: false });
    }
    
    // In a real application, here you would call your AI service
    // For now, we'll just add some placeholder actions
    const suggestedActions = [
      `Review ${task.title} details`,
      `Prepare response to ${task.sender_name}`,
      `Set follow-up reminder`,
      `Update task status when complete`
    ];
    
    // Add the AI-generated actions to the task
    const newActions = await taskActionRepository.addActionsToTask(taskId, suggestedActions);
    
    res.status(201).json({
      data: newActions,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error generating task actions:', error);
    res.status(500).json({ error: 'Failed to generate task actions', isSuccess: false });
  }
});

export default router;