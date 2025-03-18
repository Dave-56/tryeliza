import { FC, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Plus } from "lucide-react";
import { useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { TaskList, AddTaskDialog, TaskDetailPanel, AddColumnDialog } from '@/components/task-board';
import { useColumnsWithTasks, DbColumnWithTasks, DbTask } from '@/hooks/use-column';
import { useTaskMutations } from '@/hooks/use-tasks';
import { useTaskActionMutations } from '@/hooks/use-task-actions';
import { useQueryClient } from '@tanstack/react-query';
import { Task, DbTaskExtended } from '@/types/task';


interface DbColumnExtended {
  id: number;
  title: string;
  position: number;
  created_at: Date | null;
  updated_at: Date | null;
  tasks: DbTaskExtended[];
}

// UI Column interface
export interface Column {
  id: string | number;
  title: string;
  count: number;
  tasks: Task[];
}

// Helper function to format date in a relative way
export const formatRelativeDate = (date: Date | null | undefined): string | undefined => {
  if (!date) return undefined;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const dateToCheck = new Date(date);
  dateToCheck.setHours(0, 0, 0, 0);
  
  // Check if it's today
  if (dateToCheck.getTime() === today.getTime()) {
    return "Today";
  }
  
  // Check if it's tomorrow
  if (dateToCheck.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  }
  
  // Check if it's within the next 7 days
  if (dateToCheck > today && dateToCheck < nextWeek) {
    return format(dateToCheck, 'EEEE'); // Day of week (e.g., "Tuesday")
  }
  
  // Check if it's next week
  const twoWeeksFromNow = new Date(today);
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
  
  if (dateToCheck >= nextWeek && dateToCheck < twoWeeksFromNow) {
    return `Next Week ${format(dateToCheck, 'EEEE')}`;
  }
  
  // For dates further in the future, return the formatted date
  return format(dateToCheck, 'PP');
};

// Helper function to convert DbTask to UI Task
export const convertDbTaskToUiTask = (dbTask: DbTask): Task => {
  return {
    id: dbTask.id,
    title: dbTask.title,
    sender: dbTask.sender_name || 'Unknown Sender',
    dueDate: dbTask.due_date ? formatRelativeDate(new Date(dbTask.due_date)) : undefined,
    receivedDate: format(new Date(dbTask.received_date), 'PP'),
    message: dbTask.description || '',
    priority: dbTask.priority as 'High' | 'Medium' | 'Low' | undefined,
    status: dbTask.status || undefined,
    description: dbTask.description || undefined,
    aiSummary: dbTask.ai_summary || undefined,
    email_content: (dbTask as any).parsed_email_content || dbTask.emailContent || undefined,
    emailContent: (dbTask as any).parsed_email_content || dbTask.emailContent || undefined,
    thread_id: dbTask.thread_id || undefined,
    // Convert task actions if they exist
    actions: dbTask.actions ? dbTask.actions.map(action => ({
      id: action.id,
      text: action.action_text,
      isCompleted: action.is_completed,
      position: action.position || undefined
    })) : undefined,
    // Add reminderSent from waitingInfo if it exists, convert null to undefined
    reminderSent: dbTask.waitingInfo?.reminder_sent === null ? undefined : dbTask.waitingInfo?.reminder_sent
  };
};

// Helper function to convert DbColumnWithTasks to UI Column
export function convertDbColumnToUiColumn (dbColumn: DbColumnWithTasks): Column {
  const tasks = dbColumn.tasks.map(convertDbTaskToUiTask);
  return {
    id: dbColumn.id,
    title: dbColumn.title,
    count: tasks.length,
    tasks
  };
};


interface DailyPlannerProps {
    onTabChange?: (tab: string) => void;
}

export const TaskPanel: FC<DailyPlannerProps> = ({ onTabChange }) => {
  const [viewType, setViewType] = useState<'kanban' | 'list'>(() => {
    // Get saved preference from localStorage or default to 'list'
    return localStorage.getItem('taskViewType') as 'kanban' | 'list' || 'list';
  });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isLoading: isLoadingUser } = useUser();
  const { deleteTask, updateTask } = useTaskMutations();
  const { toggleTaskAction } = useTaskActionMutations();
  const queryClient = useQueryClient();

  // Fetch columns with tasks from the database
  const { columns: dbColumns, isLoading: isLoadingColumns, error } = useColumnsWithTasks();
  
  // Debug: Log the columns data from the database
  
  // Handle task click
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  // Handle closing the task detail panel
  const handleCloseTaskDetail = () => {
    setSelectedTask(null);
    // Refetch the columns data to ensure UI is up-to-date
    queryClient.refetchQueries({ queryKey: ['columns', 'with-tasks'] });
  };

  // Handle task deletion
  const handleDeleteTask = (taskId: string | number) => {
    // Convert string ID to number if needed (as per memory about task.id being a number)
    const numericId = typeof taskId === 'string' ? parseInt(taskId, 10) : taskId;
    
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteTask.mutate(numericId, {
        onSuccess: () => {
          // If the deleted task is currently selected, clear the selection
          if (selectedTask && selectedTask.id === taskId) {
            setSelectedTask(null);
          }
        },
        onError: (error) => {
          console.error('Failed to delete task:', error);
          alert('Failed to delete task. Please try again.');
        }
      });
    }
  };

  // Handle task editing
  const handleEditTask = (taskId: string | number) => {
    // Convert string ID to number if needed
    const numericId = typeof taskId === 'string' ? parseInt(taskId, 10) : taskId;
    
    // Find the task in the columns
    let taskToEdit: Task | null = null;
    
    for (const column of columns) {
      const foundTask = column.tasks.find(task => {
        const taskIdNum = typeof task.id === 'string' ? parseInt(task.id, 10) : task.id;
        return taskIdNum === numericId;
      });
      
      if (foundTask) {
        taskToEdit = foundTask;
        break;
      }
    }
    
    if (taskToEdit) {
      setSelectedTask(taskToEdit);
      // Note: The actual update will happen in the TaskDetailPanel component
      // using the updateTask mutation that's already implemented there.
      // This approach allows for a more comprehensive edit experience.
      
      // For direct edits without opening the panel, we could use:
      // updateTask.mutate({ 
      //   id: numericId, 
      //   // other properties to update
      // });
    }
  };

  // Handle toggling task action completion status
  const handleToggleAction = (actionId: number, isCompleted: boolean) => {
    // Get the current data from the query cache
    const currentDbColumns = queryClient.getQueryData<DbColumnExtended[]>(['columns', 'with-tasks']);
    
    if (!currentDbColumns) {
      // If we don't have any data in the cache, just call the mutation without optimistic updates
      toggleTaskAction.mutate(actionId);
      return;
    }
    
    // Find the task and action to update optimistically
    let actionTaskId: number | null = null;
    
    // Create a deep copy of the DB columns for optimistic update
    const updatedDbColumns = currentDbColumns.map(dbColumn => {
      // Create a deep copy of the DB column
      const updatedDbColumn = { ...dbColumn };
      
      // Create a deep copy of tasks
      updatedDbColumn.tasks = dbColumn.tasks.map(dbTask => {
        // Create a deep copy of the task
        const updatedDbTask = { ...dbTask };
        
        // If the task has actions, check if it contains the action we're toggling
        if (dbTask.actions) {
          const actionIndex = dbTask.actions.findIndex(action => 
            action.id === actionId
          );
          
          // If we found the action in this task
          if (actionIndex !== -1) {
            actionTaskId = dbTask.id;
            
            // Create a deep copy of actions array while preserving original order
            updatedDbTask.actions = [...dbTask.actions];
            
            // Update the specific action (toggle is_completed) without changing its position
            updatedDbTask.actions[actionIndex] = {
              ...updatedDbTask.actions[actionIndex],
              is_completed: isCompleted
            };
            
            // Ensure actions maintain their original order by sorting by position if available
            if (updatedDbTask.actions[0]?.position !== undefined) {
              updatedDbTask.actions.sort((a, b) => {
                // If position is available, sort by position
                if (a.position !== undefined && b.position !== undefined) {
                  return a.position - b.position;
                }
                return 0; // Keep original order if position is not available
              });
            }
          }
        }
        
        return updatedDbTask;
      });
      
      return updatedDbColumn;
    });
    
    // Store the original data for rollback
    const originalDbColumns = currentDbColumns;
    
    // Optimistically update the UI by setting the query data
    queryClient.setQueryData(['columns', 'with-tasks'], updatedDbColumns);
    
    // Call the toggleTaskAction mutation
    toggleTaskAction.mutate(actionId, {
      onSuccess: () => {
        // Invalidate queries to ensure data consistency
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
        if (actionTaskId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', actionTaskId] });
          queryClient.invalidateQueries({ queryKey: ['tasks', actionTaskId, 'with-actions'] });
        }
      },
      onError: (error) => {
        console.error('Failed to toggle task action:', error);
        
        // Revert to original state on error
        queryClient.setQueryData(['columns', 'with-tasks'], originalDbColumns);
        
        // Show error message to user
        alert('Failed to update task action. Please try again.');
      }
    });
  };

  // Tab change effect
  useEffect(() => {
    if (onTabChange) {
      onTabChange("workflow");
    }
  }, [onTabChange]);

  // Handle navigation if user is not authenticated
  useEffect(() => {
    if (!isLoadingUser && !user) {
      setLocation('/login');
    }
  }, [user, isLoadingUser, setLocation]);

  // Update localStorage when viewType changes
  useEffect(() => {
    localStorage.setItem('taskViewType', viewType);
  }, [viewType]);

  // Convert database columns to UI columns or use mock data as fallback
  const columns = dbColumns?.map(convertDbColumnToUiColumn) || [];

  // Show loading state
  if (isLoadingUser || isLoadingColumns) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Show error message if columns couldn't be loaded
  if (error) {
    console.error("Failed to load columns from the database. Using mock data instead.");
    // Continue with mock data
  }

  // If user is not authenticated, don't render anything (navigation is handled by effect)
  if (!user) {
    return null;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Action Items</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewType(viewType === 'kanban' ? 'list' : 'kanban')}
            className="gap-2"
          >
            {viewType === 'kanban' ? (
              <>
                <List className="h-4 w-4" />
                List View
              </>
            ) : (
              <>
                <LayoutGrid className="h-4 w-4" />
                Kanban View
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2" variant="default" onClick={() => setIsAddTaskOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
          <Button variant="outline" onClick={() => setIsAddColumnOpen(true)}>+ Add Column</Button>
        </div>
      </div>

      {viewType === 'kanban' ? (
        <div className="grid grid-cols-4 gap-6">
          {columns.map(column => (
            <div key={column.id}>
              <TaskList 
                column={column} 
                onTaskClick={handleTaskClick} 
                onDeleteTask={handleDeleteTask}
                onEditTask={handleEditTask}
                onToggleAction={handleToggleAction}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {columns.map(column => (
            <TaskList 
              key={column.id} 
              column={column} 
              onTaskClick={handleTaskClick} 
              onDeleteTask={handleDeleteTask}
              onEditTask={handleEditTask}
              onToggleAction={handleToggleAction}
            />
          ))}
        </div>
      )}

      <TaskDetailPanel
        task={selectedTask}
        onClose={() => {
          // Clear the selected task
          handleCloseTaskDetail();
          setSelectedTask(null);
        }}
      />

      <AddTaskDialog
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
      />

      <AddColumnDialog
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
      />
   </div>
  );
};