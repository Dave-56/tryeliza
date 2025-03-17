import express, { Request, Response } from 'express';
import auth from '../middleware/auth.js';
import { taskNoteRepository, taskRepository } from '../../repositories';

const router = express.Router();

// Get notes for a task
router.get('/:taskId', auth, async (req: Request, res: Response) => {
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
    
    const notes = await taskNoteRepository.findByTaskId(taskId);
    
    res.json({
      data: notes,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching task notes:', error);
    res.status(500).json({ error: 'Failed to fetch task notes', isSuccess: false });
  }
});

// Add a note to a task
router.post('/:taskId', auth, async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Note text is required', isSuccess: false });
    }
    
    // Verify task exists and belongs to user
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found', isSuccess: false });
    }
    
    if (task.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this task', isSuccess: false });
    }
    
    const note = await taskNoteRepository.addNoteToTask(taskId, userId, text);
    
    res.json({
      data: note,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error adding task note:', error);
    res.status(500).json({ error: 'Failed to add task note', isSuccess: false });
  }
});

// Delete a note
router.delete('/:noteId', auth, async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId);
    const userId = req.user.id;
    
    const success = await taskNoteRepository.deleteNote(noteId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Note not found or not authorized', isSuccess: false });
    }
    
    res.json({
      data: { id: noteId },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error deleting task note:', error);
    res.status(500).json({ error: 'Failed to delete task note', isSuccess: false });
  }
});

export default router;