import { FC, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEmailDate, formatEmailContent } from '../../lib/email-utils';
import { format, addDays } from 'date-fns';
import { Task, TaskAction } from "@/types/task";
import { useTaskMutations, useTaskWithActions } from "@/hooks/use-tasks";
import { useTaskActionMutations } from "@/hooks/use-task-actions";
import { useTaskNotes, useTaskNoteMutations, FormattedTaskNote } from "@/hooks/use-task-notes";
import { useUser } from "@/hooks/use-user";
import { useQueryClient } from '@tanstack/react-query';
import { useColumns, useColumnsWithTasks } from "@/hooks/use-column";


interface TaskDetailPanelProps {
  task: Task | null;
  onClose: () => void;
}

export const TaskDetailPanel: FC<TaskDetailPanelProps> = ({ task, onClose }) => {
  // For testing: If we have a real task with thread_id, use it, otherwise use mock data
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(task?.thread_id || "thread-1");
  const [showAllEmails, setShowAllEmails] = useState(false);
  
  const [newNote, setNewNote] = useState('');
  const [newActionText, setNewActionText] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<string>(task?.status?.toLowerCase() || "inbox");
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task?.title || '');
  const [editedDueDate, setEditedDueDate] = useState<Date | null>(null);
  const [editedPriority, setEditedPriority] = useState<'High' | 'Medium' | 'Low' | ''>(task?.priority || '');
  const [openPriorityDropdown, setOpenPriorityDropdown] = useState(false);
  const [openCalendar, setOpenCalendar] = useState(false);
  const [emailTab, setEmailTab] = useState<'original' | 'latest'>('original');
  const [isLoadingEmailContent, setIsLoadingEmailContent] = useState(false);
  
  const { updateTask } = useTaskMutations();
  const { addTaskActions, toggleTaskAction } = useTaskActionMutations();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: columns } = useColumns();
  const { fetchEmailContentForTask, columns: columnsWithTasks } = useColumnsWithTasks();
  const [emailContent, setEmailContent] = useState<any[] | null>(null);
  const [threadSummary, setThreadSummary] = useState<any | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [autoLoadedEmail, setAutoLoadedEmail] = useState(false);

  // Convert task.id to number if it's a string
  useEffect(() => {
    if (task) {
      setEditedTitle(task.title);
      setSelectedColumn(task.status || '');
      setEditedPriority(task.priority || '');

      // console.log("Task detail panel useEffect triggered with task:", task);
      // console.log("Task has thread_id:", !!task.thread_id);
      // console.log("Task has emailContent:", !!task.emailContent);
      
      // Parse the task ID to ensure it's a number
      if (typeof task.id === 'string') {
        // setTaskId(parseInt(task.id, 10));
      } else {
        // setTaskId(task.id as number);
      }
      
      // Set the current thread ID from the task
      if (task.thread_id) {
        setCurrentThreadId(task.thread_id);
      }
      
      // Update local state with email content from task if available
      if (task.emailContent && task.emailContent.length > 0) {
        console.log("Setting email content from task:", task.emailContent);
        setEmailContent(task.emailContent);
      }
      
      // Update local state with thread summary from task if available
      if (task.threadSummary) {
        console.log("Setting thread summary from task:", task.threadSummary);
        setThreadSummary(task.threadSummary);
      }
      
      // Parse due date if it exists
      if (task.dueDate) {
        if (task.dueDate === "Today") {
          setEditedDueDate(new Date());
        } else if (task.dueDate === "Tomorrow") {
          setEditedDueDate(addDays(new Date(), 1));
        } else {
          // More careful date parsing
          try {
            // First check if it's a valid date string
            const parsedDate = new Date(task.dueDate);
            if (!isNaN(parsedDate.getTime())) {
              setEditedDueDate(parsedDate);
            } else {
              console.error("Invalid date string:", task.dueDate);
              setEditedDueDate(null);
            }
          } catch (e) {
            console.error("Error parsing date:", e);
            setEditedDueDate(null);
          }
        }
      } else {
        setEditedDueDate(null);
      }
      
      // Auto-load email content when the task detail panel is opened
      if (task.thread_id && !task.emailContent) {
        console.log("Task detail panel opened, auto-loading email content for task:", task.id);
        // Use a small timeout to ensure the component is fully mounted
        setTimeout(() => {
          handleLoadEmailContent();
        }, 100);
      }
    }
  }, [task]);

  // Auto-load email content if task has thread_id but no content
  useEffect(() => {
    // Only attempt to load if:
    // 1. We have a task with a thread_id
    // 2. We haven't already auto-loaded the email
    // 3. We're not currently loading email
    if (
      task?.thread_id && 
      !autoLoadedEmail && 
      !isLoadingEmail && 
      (!task?.emailContent || task.emailContent.length === 0) &&
      (!task?.email_content || task.email_content.length === 0)
    ) {
      console.log("Auto-loading email content for task:", task.id);
      setIsLoadingEmail(true);
      
      fetchEmailContentForTask(task.id, task.thread_id, emailTab)
        .then(result => {
          console.log("Auto-loaded email content:", result);
          
          // Update local state with the fetched data
          if (result && result.messages) {
            setEmailContent(result.messages);
          }
          if (result && result.messageCount && result.participants) {
            setThreadSummary({
              messageCount: result.messageCount,
              participants: result.participants
            });
          }
          
          setAutoLoadedEmail(true); // Mark as loaded so we don't load again
        })
        .catch(error => {
          console.error("Error auto-loading email content:", error);
          setEmailError('Failed to auto-load email content');
        })
        .finally(() => {
          setIsLoadingEmail(false);
        });
    }
  }, [task?.id, task?.thread_id]);

  // Function to get email thread data based on thread ID
  const getEmailThreadData = () => {
    console.log("Task in getEmailThreadData:", task);
    
    
    // Check multiple possible locations for email content
    // This handles different property naming conventions that might be used
    const content = emailContent && emailContent.length > 0 
      ? emailContent 
      : (task?.emailContent || task?.email_content || []);
    
    // console.log("Email content from task:", task?.emailContent);
    // console.log("Email content from local state:", emailContent);
    // console.log("Thread summary:", task?.threadSummary || threadSummary);
    
    // If we have no email content but we do have a thread ID, show a message encouraging the user to load content
    if (content.length === 0 && !isLoadingEmail && task?.thread_id) {
      console.log("No email content found, but thread_id exists:", task.thread_id);
    }
    
    return content;
  };
  
  // Function to get thread summary
  const getThreadSummary = () => {
    // console.log("Thread summary from task:", task?.threadSummary);
    // console.log("Thread summary from local state:", threadSummary);
    
    // First try to use the task's threadSummary from the cache
    // If that's not available, fall back to the local state
    return task?.threadSummary || threadSummary || null;
  };
  
  // Helper function to deduplicate participants by email address
  const deduplicateParticipants = (participants: string[]): string[] => {
    // Create a map to deduplicate participants while preserving the original format
    const participantMap = new Map<string, string>();
    
    participants.forEach(participant => {
      // Extract email from format like "Name <email@example.com>"
      const emailMatch = participant.match(/<([^>]+)>/) || [null, participant];
      const normalizedEmail = emailMatch[1].toLowerCase().trim();
      
      // Keep the first occurrence of each email address
      if (!participantMap.has(normalizedEmail)) {
        participantMap.set(normalizedEmail, participant);
      }
    });
    
    return Array.from(participantMap.values());
  };
  
  

  // Function to handle loading more emails
  const handleLoadMoreEmails = async () => {
    // setShowAllEmails(true);
    if (!task?.thread_id) return;
  
    setIsLoadingEmail(true);
    try {
      const result = await fetchEmailContentForTask(task.id, task.thread_id, 'latest');
      console.log("Email content loaded for task:", task.id);
      
      // Update local state with the fetched data
      if (result && result.messages) {
        setEmailContent(result.messages);
      }
      if (result && result.messageCount && result.participants) {
        setThreadSummary({
          messageCount: result.messageCount,
          participants: result.participants
        });
      }
      
      setShowAllEmails(true);
    } catch (error) {
      setEmailError('Failed to load more emails');
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const handleLoadEmailContent = async () => {
    if (!task?.thread_id) return;
    
    setIsLoadingEmail(true);
    try {
      const result = await fetchEmailContentForTask(task.id, task.thread_id, emailTab);
      // console.log("Email content loaded:", result);
      
      // Update local state with the fetched data
      if (result && result.messages) {
        setEmailContent(result.messages);
        //console.log("Updated emailContent state:", result.messages);
      }
      if (result && result.messageCount && result.participants) {
        setThreadSummary({
          messageCount: result.messageCount,
          participants: result.participants
        });
      }
    } catch (error) {
      setEmailError('Failed to load email content');
    } finally {
      setIsLoadingEmail(false);
    }
  };

  // Convert task?.id to the correct type (number | null) for the hook
  const taskId = task?.id !== undefined ? (typeof task.id === 'string' ? parseInt(task.id, 10) : task.id as number) : null;
  const { data: taskWithActions } = useTaskWithActions(taskId);

  // Map backend task action format to frontend format
  const mapTaskAction = (action: any): TaskAction => {
    if ('isCompleted' in action) {
      // Already in frontend format
      return action as TaskAction;
    } else {
      // Convert from backend format to frontend format
      return {
        id: action.id,
        text: action.action_text,
        isCompleted: !!action.is_completed,
        position: action.position || undefined
      };
    }
  };

  // Helper function to check if actions are empty
  const hasNoActions = (): boolean => {
    const actions = taskWithActions?.actions || task?.actions;
    return !actions || actions.length === 0;
  };

  // Helper function to get actions safely
  const getActions = () => {
    return (taskWithActions?.actions || task?.actions || []);
  };

  const handleColumnChange = () => {
    // Check if task is null first
    if (!task) {
      console.error("Cannot update task: task is null");
      return;
    }

    // Convert string ID to number if needed
    const taskId = typeof task.id === 'string' ? parseInt(task.id, 10) : task.id;

    // Format the status correctly - capitalize first letter
    const formattedStatus = selectedColumn.charAt(0).toUpperCase() + selectedColumn.slice(1);
    
    // Find the corresponding column_id for the selected column
    let columnId: number | null = null;
    
    console.log("Available columns:", columns);
    console.log("Selected column:", selectedColumn);
    
    if (columns) {
      // Log all column titles for debugging
      console.log("Column titles:", columns.map(col => ({ id: col.id, title: col.title, lowercase: col.title.toLowerCase() })));
      
      // Find the column that matches the selected status (case insensitive)
      const matchingColumn = columns.find(col => 
        col.title.toLowerCase() === selectedColumn.toLowerCase()
      );
      
      console.log("Matching column:", matchingColumn);
      
      if (matchingColumn) {
        columnId = matchingColumn.id;
      } else {
        // Fallback: If no exact match, try to find a column with a title that contains the selected column
        const fallbackColumn = columns.find(col => 
          col.title.toLowerCase().includes(selectedColumn.toLowerCase()) ||
          selectedColumn.toLowerCase().includes(col.title.toLowerCase())
        );
        
        console.log("Fallback matching column:", fallbackColumn);
        
        if (fallbackColumn) {
          columnId = fallbackColumn.id;
        } else {
          // Hard-coded fallback based on common column names
          const statusToColumnMap: Record<string, number> = {};
          
          // Populate the map with column IDs
          columns.forEach(col => {
            const title = col.title.toLowerCase();
            if (title.includes('inbox')) statusToColumnMap['inbox'] = col.id;
            if (title.includes('progress')) statusToColumnMap['in-progress'] = col.id;
            if (title.includes('wait')) statusToColumnMap['waiting'] = col.id;
            if (title.includes('complete')) statusToColumnMap['completed'] = col.id;
          });
          
          console.log("Status to column map:", statusToColumnMap);
          
          // Try to get the column ID from the map
          if (statusToColumnMap[selectedColumn.toLowerCase()]) {
            columnId = statusToColumnMap[selectedColumn.toLowerCase()];
          }
        }
      }
    }
    
    console.log(`Attempting to move task ${taskId} to column ${formattedStatus} (column_id: ${columnId})`);
    
    // Update the task's status and column_id to match the selected column
    updateTask.mutate(
      { 
        id: taskId as number, 
        status: formattedStatus, // Capitalize first letter
        column_id: columnId // Add column_id to the update
      },
      {
        onSuccess: () => {
          console.log(`Successfully moved task ${task.id} to column ${selectedColumn}`);
          
          // Invalidate all relevant queries
          queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          
          // Force a refetch to ensure fresh data
          queryClient.refetchQueries({ queryKey: ['columns', 'with-tasks'] });
          
          // Close the panel - this will trigger a re-render in the parent component
          onClose();
        },
        onError: (error) => {
          console.error("Failed to update task:", error);
          // You could add error handling UI here
        }
      }
    );
  };
  
  // Fetch task notes
  const { data: taskNotes, isLoading: isLoadingNotes } = useTaskNotes(task?.id as number);
  const { addTaskNote } = useTaskNoteMutations();

  // Handle starting edit mode
  const handleStartEditing = () => {
    // Check if task is null
    if (!task) return;
    
    // Make sure edited values are initialized from the task
    setEditedTitle(task.title);
    setSelectedColumn(task.status?.toLowerCase() || "inbox");
    setEditedPriority(task.priority || '');
    
    // Set up the due date - with safer date handling
    if (task.dueDate) {
      if (task.dueDate === "Today") {
        setEditedDueDate(new Date());
      } else if (task.dueDate === "Tomorrow") {
        setEditedDueDate(addDays(new Date(), 1));
      } else {
        // More careful date parsing
        try {
          // First check if it's a valid date string
          const parsedDate = new Date(task.dueDate);
          if (!isNaN(parsedDate.getTime())) {
            setEditedDueDate(parsedDate);
          } else {
            console.error("Invalid date string:", task.dueDate);
            setEditedDueDate(null);
          }
        } catch (e) {
          console.error("Error parsing date:", e);
          setEditedDueDate(null);
        }
      }
    } else {
      setEditedDueDate(null);
    }
    
    // Now it's safe to enter edit mode
    setIsEditing(true);
  };

  if (!task) return null;

  const getDueDateColor = (dueDate?: string) => {
    if (!dueDate) return "text-muted-foreground";
    if (dueDate === "Today") return "text-red-600 font-medium";
    if (dueDate === "Tomorrow") return "text-amber-600";
    if (dueDate === "Completed") return "text-green-600";
    return "text-muted-foreground";
  };

  // Handle tab change with type checking
  const handleTabChange = (value: string) => {
    if (value === 'original' || value === 'latest') {
      setEmailTab(value);
      // When tab changes, refetch the task with email content
      if (task?.id) {
        // Invalidate and refetch the task data with the new email type
        queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
        // Also refetch columns with tasks to update the email content
        queryClient.invalidateQueries({ 
          queryKey: ['columns', 'with-tasks', { includeEmailContent: true, emailType: value }] 
        });
      }
    }
  };

  // Handle saving changes
  const handleSaveChanges = () => {
    if (!task) return;
    
    // Prepare the update data
    const updateData: any = {
      id: task.id as number
    };
    
    // Only include changed fields
    if (editedTitle !== task.title) {
      updateData.title = editedTitle;
    }
    
    if (editedPriority !== task.priority) {
      updateData.priority = editedPriority || null;
    }
    
    if (editedDueDate) {
      // Convert to ISO string for API
      updateData.due_date = editedDueDate.toISOString();
    } else if (task.dueDate && !editedDueDate) {
      // If due date was removed
      updateData.due_date = null;
    }
    
    // Status changes are now handled by handleColumnChange, so we don't include status here
    
    // Only update if there are changes
    if (Object.keys(updateData).length > 1) { // > 1 because id is always included
      updateTask.mutate(updateData, {
        onSuccess: () => {
          // If status has also changed, call handleColumnChange
          if (selectedColumn !== task.status?.toLowerCase()) {
            handleColumnChange();
          } else {
            setIsEditing(false);
            console.log(`Successfully updated task ${task.id}`);
            // Close the panel to refresh the task list view
            onClose();
          }
        },
        onError: (error) => {
          console.error("Failed to update task:", error);
          alert("Failed to update task. Please try again.");
        }
      });
    } else if (selectedColumn !== task.status?.toLowerCase()) {
      // If only status has changed, just call handleColumnChange
      handleColumnChange();
    } else {
      setIsEditing(false);
    }
  };

  const handleAddNote = () => {
    if (!newNote.trim() || !task) return;
    
    addTaskNote.mutate(
      { 
        taskId: task.id as number, 
        text: newNote 
      },
      {
        onSuccess: () => {
          setNewNote('');
        },
        onError: (error) => {
          console.error("Failed to add note:", error);
        }
      }
    );
  };

  const handleAddAction = () => {
    if (!task || !newActionText.trim()) return;
    
    // Get the current task data
    const currentTaskWithActions = queryClient.getQueryData<{ task: Task, actions: any[] }>(['tasks', task.id, 'with-actions']);
    
    // Create a temporary ID for the new action
    // In a real app, you might want to use a more robust ID generation method
    const tempId = -Date.now();
    
    // Create the new action object
    const newAction = {
      id: tempId,
      action_text: newActionText,
      is_completed: false,
      task_id: task.id,
      position: currentTaskWithActions?.actions?.length || 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Optimistically update the UI
    if (currentTaskWithActions) {
      queryClient.setQueryData(['tasks', task.id, 'with-actions'], {
        ...currentTaskWithActions,
        actions: [...(currentTaskWithActions.actions || []), newAction]
      });
    }
    
    addTaskActions.mutate(
      { taskId: task.id as number, actions: [newActionText] },
      {
        onSuccess: () => {
          setNewActionText('');

          // Invalidate relevant queries to refresh the task data
          queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
          queryClient.invalidateQueries({ queryKey: ['tasks', task.id, 'with-actions'] });
          queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
          
          // Force a refetch to ensure we get fresh data
          queryClient.refetchQueries({ queryKey: ['tasks', task.id] });
          queryClient.refetchQueries({ queryKey: ['tasks', task.id, 'with-actions'] });
        },
        onError: (error) => {
          // Revert optimistic update on error
          if (currentTaskWithActions) {
            queryClient.setQueryData(['tasks', task.id, 'with-actions'], currentTaskWithActions);
          }
          console.error("Failed to add action item:", error);
        }
      }
    );
  };

  const handleToggleAction = (actionId: number) => {

    // Get the current task data
    const currentTaskWithActions = queryClient.getQueryData<{ task: Task, actions: any[] }>(['tasks', task.id, 'with-actions']);

    // Optimistically update the UI
    if (currentTaskWithActions?.actions) {
      queryClient.setQueryData(['tasks', task.id, 'with-actions'], {
        ...currentTaskWithActions,
        actions: currentTaskWithActions.actions.map(action => 
          action.id === actionId 
            ? { ...action, is_completed: !action.is_completed } 
            : action
        )
      });
    }

    toggleTaskAction.mutate(actionId, {
      onSuccess: () => {
        // Invalidate relevant queries to refresh the task data
        queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
        queryClient.invalidateQueries({ queryKey: ['tasks', task.id, 'with-actions'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
        
        // Force a refetch to ensure we get fresh data
        queryClient.refetchQueries({ queryKey: ['tasks', task.id] });
        queryClient.refetchQueries({ queryKey: ['tasks', task.id, 'with-actions'] });
      },
      onError: (error) => {
        // Revert optimistic update on error
        if (currentTaskWithActions) {
          queryClient.setQueryData(['tasks', task.id, 'with-actions'], currentTaskWithActions);
        }
        console.error("Failed to toggle action item:", error);
      }
    });
  };
  
  const handleDeleteAction = (actionId: number) => {
    if (confirm("Are you sure you want to delete this action item?")) {
      // This is a placeholder - we'll need to implement the delete functionality
      console.log("Delete action:", actionId);
      // Once the deleteTaskAction mutation is implemented, uncomment this:
      // deleteTaskAction.mutate(actionId, {
      //   onError: (error) => {
      //     console.error("Failed to delete action item:", error);
      //   }
      // });
    }
  };

  return (
    <Sheet open={!!task} onOpenChange={() => onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <div className="h-full flex flex-col">
          <SheetHeader className="pb-4">
            {isEditing ? (
              <div className="pr-10 w-full">
                <Input 
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-xl font-semibold w-full"
                />
              </div>
            ) : (
              <SheetTitle className="text-xl font-semibold">{task.title}</SheetTitle>
            )}
            <div className="text-sm text-muted-foreground">
              From: {task.sender}
            </div>
          </SheetHeader>

          {/* Edit Controls */}
          <div className="mb-4 flex justify-end">
            {isEditing ? (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleSaveChanges}
                >
                  Save Changes
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleStartEditing}
              >
                Edit Task
              </Button>
            )}
          </div>

          {/* Status Information */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-2 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              {isEditing ? (
                <select 
                  className="rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                >
                  <option value="inbox">Inbox</option>
                  <option value="in-progress">In Progress</option>
                  <option value="waiting">Waiting</option>
                  <option value="completed">Completed</option>
                </select>
              ) : (
                <Badge variant="outline">{task.status}</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Due:</span>
              {isEditing ? (
                <Popover open={openCalendar} onOpenChange={setOpenCalendar}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editedDueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editedDueDate && !isNaN(editedDueDate.getTime()) 
                        ? format(editedDueDate, "PPP") 
                        : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={editedDueDate && !isNaN(editedDueDate.getTime()) ? editedDueDate : undefined}
                      onSelect={(date) => {
                        setEditedDueDate(date || null);
                        setOpenCalendar(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <span className={cn(
                  "text-sm",
                  getDueDateColor(task.dueDate)
                )}>{task.dueDate}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Priority:</span>
              {isEditing ? (
                <Popover open={openPriorityDropdown} onOpenChange={setOpenPriorityDropdown}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openPriorityDropdown}
                      className="w-[120px] justify-between"
                      size="sm"
                    >
                      {editedPriority || "Select..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[120px] p-0">
                    <Command>
                      <CommandEmpty>No priority found.</CommandEmpty>
                      <CommandGroup>
                        {['High', 'Medium', 'Low'].map((priority) => (
                          <CommandItem
                            key={priority}
                            value={priority}
                            onSelect={(currentValue) => {
                              setEditedPriority(currentValue as 'High' | 'Medium' | 'Low');
                              setOpenPriorityDropdown(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                editedPriority === priority ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {priority}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    task.priority === 'High' && "text-red-500 border-red-200",
                    task.priority === 'Medium' && "text-green-500 border-green-200",
                    task.priority === 'Low' && "text-slate-500 border-slate-200"
                  )}
                >
                  {task.priority}
                </Badge>
              )}
            </div>
          </div>

          {/* AI Task Summary */}
          <div className="bg-purple-50 p-4 rounded-lg mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-purple-900">Eliza's Brief</h3>
            </div>
            <p className="text-sm text-purple-800">{task.aiSummary}</p>
          </div>

          {/* Action Items */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">Action Items</h3>
            <div className="space-y-2 mb-4">
              {getActions().map((action) => {
                const mappedAction = mapTaskAction(action);
                return (
                <div key={mappedAction.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-md group">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                    checked={mappedAction.isCompleted}
                    onChange={() => handleToggleAction(mappedAction.id)}
                  />
                  <span className={`text-sm flex-1 ${mappedAction.isCompleted ? 'line-through text-gray-500' : ''}`}>{mappedAction.text}</span>
                  <button 
                    onClick={() => handleDeleteAction(mappedAction.id)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete action"
                  >
                  </button>
                </div>
              )})}
              {hasNoActions() && (
                <div className="text-center py-2">
                  <span className="text-sm text-muted-foreground">No action items yet</span>
                </div>
              )}
            </div>
            {/* Add new action item form */}
            <div className="flex items-center gap-2 mt-4 border border-slate-200 rounded-md p-1 pl-3 bg-slate-50">
              <div className="flex-shrink-0 text-slate-400">
              </div>
              <Input
                placeholder="Add an action item..."
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                value={newActionText}
                onChange={(e) => setNewActionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddAction();
                  }
                }}
              /> 
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                onClick={handleAddAction}
                disabled={!newActionText.trim() || addTaskActions.isPending}
              >
                Add
              </Button>
            </div>
          </div>


          {/* Content Section - Show Email Content or Description */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">{task.description ? "Email Thread" : "Description"}</h3>
              {(() => {
                const threadSummary = getThreadSummary();
                return threadSummary && threadSummary.participants && threadSummary.participants.length > 0 && (
                  <div className="flex items-center text-xs text-muted-foreground gap-1">
                    <span>{threadSummary.messageCount} messages</span>
                    <span>•</span>
                    <span>{deduplicateParticipants(threadSummary.participants).length} participants</span>
                  </div>
                );
              })()}
            </div>
            
            {task.description ? (
              <div className="border rounded-md overflow-hidden">
                {/* Email content tabs */}
                <div className="bg-slate-50 border-b">
                  <div className="flex">
                    <button
                      className={`px-4 py-2 text-sm font-medium ${
                        emailTab === 'original'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setEmailTab('original')}
                    >
                      Original Email
                    </button>
                    <button
                      className={`px-4 py-2 text-sm font-medium ${
                        emailTab === 'latest'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setEmailTab('latest')}
                    >
                      Latest Replies
                    </button>
                  </div>
                </div>
                
                {/* Thread participants */}
                {(() => {
                  const threadSummary = getThreadSummary();
                  return threadSummary && threadSummary.participants && threadSummary.participants.length > 0 && (
                    <div className="bg-slate-100 px-4 py-2 border-b">
                      <div className="flex flex-wrap gap-1 items-center text-xs">
                        <span className="text-muted-foreground">Participants:</span>
                        {deduplicateParticipants(threadSummary.participants).map((participant: string, index: number) => (
                          <span key={index} className="bg-white px-2 py-0.5 rounded-full text-xs border">
                            {participant}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Email thread content */}
                <div className="max-h-[400px] overflow-y-auto divide-y">
                  {/* Show different content based on selected tab */}
                  {emailTab === 'original' ? (
                    // Show first email in thread
                    getEmailThreadData().slice(0, 1).map((email) => (
                      <div key={String(email.id)} className="p-4 hover:bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex justify-between mb-3">
                          <div className="font-medium text-sm">{email.sender}</div>
                          <div className="text-xs text-muted-foreground px-3 ml-2 bg-slate-50 rounded-md py-1">{formatEmailDate(email.date)}</div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          To: {email.recipients?.join(", ") || ""}
                        </div>
                        <div className="text-sm font-medium mb-3 pb-2 border-b border-slate-200">{email.subject}</div>
                        
                        {/* Email content with proper rendering */}
                        {email.htmlBody ? (
                          // If HTML content is available, render it with proper styling
                          <div 
                            className="text-sm prose prose-sm max-w-none overflow-auto" 
                            dangerouslySetInnerHTML={{ 
                              __html: email.htmlBody 
                            }} 
                          />
                        ) : (
                          // If only plain text is available, format it with paragraphs and clickable links
                          <div 
                            className="text-sm whitespace-pre-line" 
                            dangerouslySetInnerHTML={{ 
                              __html: formatEmailContent(email.content) 
                            }}
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    // Show all emails in thread (or limited number if not showing all)
                    getEmailThreadData().map((email) => (
                      <div key={String(email.id)} className="p-4 hover:bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex justify-between mb-3">
                          <div className="font-medium text-sm">{email.sender}</div>
                          <div className="text-xs text-muted-foreground px-3 ml-2 bg-slate-50 rounded-md py-1">{formatEmailDate(email.date)}</div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          To: {email.recipients?.join(", ") || ""}
                        </div>
                        <div className="text-sm font-medium mb-3 pb-2 border-b border-slate-200">{email.subject}</div>
                        
                        {/* Email content with proper rendering */}
                        {email.htmlBody ? (
                          // If HTML content is available, render it with proper styling
                          <div 
                            className="text-sm prose prose-sm max-w-none overflow-auto" 
                            dangerouslySetInnerHTML={{ 
                              __html: email.htmlBody 
                            }} 
                          />
                        ) : (
                          // If only plain text is available, format it with paragraphs and clickable links
                          <div 
                            className="text-sm whitespace-pre-line" 
                            dangerouslySetInnerHTML={{ 
                              __html: formatEmailContent(email.content) 
                            }}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
                
                {/* Load more emails button - only show if there are more emails to load */}
                {(() => {
                  const threadSummary = getThreadSummary();
                  return emailTab === 'latest' && 
                    threadSummary && 
                    threadSummary.messageCount > 3 && 
                    !showAllEmails && (
                    <div className="bg-slate-50 p-3 text-center border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={handleLoadMoreEmails}
                      >
                        Show all {threadSummary.messageCount} emails
                      </Button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                {task.thread_id ? (
                  <div className="text-center py-8 border rounded-md">
                    <div className="mb-2 text-muted-foreground text-sm">Email content not loaded</div>
                    {/* <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // In a real implementation, this would fetch the email content
                        // For now, we'll simulate it by using our mock data
                        if (task.thread_id && mockEmailContents[task.thread_id]) {
                          const updatedTask = {
                            ...task,
                            emailContent: mockEmailContents[task.thread_id]
                          };
                          // In a real implementation, we would update the task in the store
                          // For now, we'll just log that we would load the content
                          console.log("Loading email content for thread:", task.thread_id);
                        }
                      }}
                    >
                      Load Email Content
                    </Button> */}
                    <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleLoadEmailContent}
                    disabled={isLoadingEmail}
                  >
                    {isLoadingEmail ? 'Loading...' : 'Load Email Content'}
                  </Button>
                  </div>
                ) : (
                  <div className="border rounded-md p-4 bg-slate-50 max-h-[300px] overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{task.description || task.message || "No description available."}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <br />

          {/* Notes Section */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">Notes</h3>
            <div className="space-y-4">
              {/* Display existing Notes */}
              <div className="space-y-3">
                {isLoadingNotes ? (
                  <div className="text-center py-2">
                    <span className="text-sm text-muted-foreground">Loading notes...</span>
                  </div>
                ) : taskNotes && taskNotes.length > 0 ? (
                  taskNotes.map((note) => (
                    <div key={note.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <span className="font-medium">{user?.name || 'You'}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(note.created_at || new Date()), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2">
                    <span className="text-sm text-muted-foreground">No notes yet</span>
                  </div>
                )}
              </div>
              
              {/* New Note input */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-start p-3 gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 font-medium mt-1">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 flex flex-col">
                    <Textarea
                      placeholder="Add a note or comment..."
                      className="flex-1 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm bg-transparent resize-none min-h-[60px]"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                        // No need for special handling of Ctrl+Enter as Textarea supports multiline by default
                      }}
                    />
                    <div className="text-xs text-slate-500 mt-1">Press Ctrl+Enter for a new line</div>
                  </div>
                </div>
                <div className="flex justify-end bg-slate-50 p-2 border-t border-slate-200">
                  <Button
                    variant="default"
                    size="sm"
                    className="px-4 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addTaskNote.isPending}
                  >
                    Add Note
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};