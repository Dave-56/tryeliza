// src/api/routes/columnRoutes.ts
import express from 'express';
import { Request, Response } from 'express';
import { columnRepository } from '../../repositories';
import auth from '../middleware/auth';
import { BackendResponse } from '../../Types/model';
import { Column, InsertColumn, Task } from '../../db/schema';

const router = express.Router();

// Get all columns ordered by position
router.get('/', auth, async (
  req: Request, 
  res: Response<BackendResponse<Column[]>>
) => {
  try {
    const columns = await columnRepository.getAllOrdered();
    
    res.json({
      data: columns,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching columns:', error);
    res.status(500).json({ error: 'Failed to fetch columns', isSuccess: false });
  }
});

// Initialize default columns if none exist
router.post('/initialize-defaults', auth, async (
  req: Request, 
  res: Response<BackendResponse<Column[]>>
) => {
  try {
    const columns = await columnRepository.initializeDefaultColumns();
    
    res.json({
      data: columns,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error initializing default columns:', error);
    res.status(500).json({ error: 'Failed to initialize default columns', isSuccess: false });
  }
});

// Create a new column
router.post('/', auth, async (
  req: Request<{}, {}, { title: string, position?: number }>, 
  res: Response<BackendResponse<Column>>
) => {
  try {
    const { title, position } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Column title is required', isSuccess: false });
    }
    

    // If position not provided, append to end
    let columnPosition = position;
    if (columnPosition === undefined) {
      const columns = await columnRepository.getAllOrdered();
      columnPosition = columns.length;
    } else {
      // If a specific position is provided, shift columns to make space
      await columnRepository.shiftColumnPositions(columnPosition);
    }
    
    // Create new column
    const newColumn = await columnRepository.create({
      title,
      position: columnPosition
    });
    
    res.status(201).json({
      data: newColumn,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column', isSuccess: false });
  }
});

// Update a column
router.put('/:id', auth, async (
  req: Request<{ id: string }, {}, Partial<InsertColumn>>, 
  res: Response<BackendResponse<Column>>
) => {
  try {
    const columnId = parseInt(req.params.id);
    const columnData = req.body;
    
    // Verify column exists
    const existingColumn = await columnRepository.findById(columnId);
    if (!existingColumn) {
      return res.status(404).json({ error: 'Column not found', isSuccess: false });
    }
    
    // Update the column
    const updatedColumn = await columnRepository.update(columnId, {
      ...columnData,
      updated_at: new Date()
    });
    
    res.json({
      data: updatedColumn,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column', isSuccess: false });
  }
});

// Delete a column
router.delete('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ message: string }>>
) => {
  try {
    const columnId = parseInt(req.params.id);
    
    // Verify column exists
    const existingColumn = await columnRepository.findById(columnId);
    if (!existingColumn) {
      return res.status(404).json({ error: 'Column not found', isSuccess: false });
    }
    
    // Store the position before deleting
    const deletedPosition = existingColumn.position;
    
    // Delete the column
    await columnRepository.delete(columnId);
    
    // Compact column positions to fill the gap
    await columnRepository.compactColumnPositions(deletedPosition);
    
    res.json({
      data: { message: 'Column deleted successfully' },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column', isSuccess: false });
  }
});

// Reorder columns
router.post('/reorder', auth, async (
  req: Request<{}, {}, { columnIds: number[] }>, 
  res: Response<BackendResponse<{ success: boolean }>>
) => {
  try {
    const { columnIds } = req.body;
    
    if (!columnIds || !Array.isArray(columnIds) || columnIds.length === 0) {
      return res.status(400).json({ 
        error: 'Column IDs array is required', 
        isSuccess: false 
      });
    }
    
    // Reorder the columns
    const success = await columnRepository.reorderColumns(columnIds);
    
    res.json({
      data: { success },
      isSuccess: success
    });
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: 'Failed to reorder columns', isSuccess: false });
  }
});

// Get columns with tasks
router.get('/with-tasks', auth, async (
  req: Request, 
  res: Response<BackendResponse<(Column & { tasks: (Task & { actions: any[] })[] })[]>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }
    // // Use the new function that filters by user ID at the database level
    const columnsWithTasks = await columnRepository.getColumnsWithTasksByUserId(req.user.id);

    //console.log(JSON.stringify(columnsWithTasks))
    
    res.json({
      data: columnsWithTasks,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching columns with tasks:', error);
    res.status(500).json({ error: 'Failed to fetch columns with tasks', isSuccess: false });
  }
});

// Get column by ID
router.get('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<Column>>
) => {
  try {
    const columnId = parseInt(req.params.id);
    const column = await columnRepository.findById(columnId);
    
    if (!column) {
      return res.status(404).json({ error: 'Column not found', isSuccess: false });
    }
    
    res.json({
      data: column,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching column with column id:', error);
    res.status(500).json({ error: 'Failed to fetch column with column id', isSuccess: false });
  }
});


export default router;