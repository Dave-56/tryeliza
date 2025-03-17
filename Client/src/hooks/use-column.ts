import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { EmailService } from '../lib/email-service';

// Define types that match our database schema
export interface DbColumn {
  id: number;
  title: string;
  position: number;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface DbTaskAction {
  id: number;
  task_id: number;
  action_text: string;
  is_completed: boolean;
  position?: number | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface DbTask {
  id: number;
  user_id: string;
  email_id?: string | null;
  thread_id?: string | null;
  emailContent?: {
    id: string | number;
    sender: string;
    recipients: string[];
    subject: string;
    content: string;
    date: string;
  }[] | null;
  threadSummary?: {
    messageCount: number;
    participants: string[];
  } | null;
  account_id?: number | null;
  title: string;
  sender_name: string;
  sender_email?: string | null;
  team_name?: string | null;
  column_id?: number | null;
  position?: number | null;
  description?: string | null;
  email_content?: string | null;
  brief_text?: string | null;
  ai_summary?: string | null;
  category?: string | null;
  status: string;
  priority: string;
  due_date?: Date | null;
  received_date: Date;
  created_at: Date | null;
  updated_at: Date | null;
  actions?: DbTaskAction[];
  waitingInfo?: {
    reminder_sent: boolean | null;
  };
}

export interface DbColumnWithTasks extends DbColumn {
  tasks: DbTask[];
}

// Column hooks
export function useColumns() {
    return useQuery({
      queryKey: ['columns'],
      queryFn: async () => {
        const response = await apiClient.fetchWithAuth<DbColumn[]>('/api/columns');
        return response.data || [];
      },
      enabled: Boolean(apiClient.isAuthenticated()),
  });
}
  
export function useColumnsWithTasks() {
  const queryClient = useQueryClient();
  
  const { isLoading, error, data, refetch } = useQuery({
      queryKey: ['columns', 'with-tasks'],
      queryFn: async () => {
        const response = await apiClient.fetchWithAuth<DbColumnWithTasks[]>('/api/columns/with-tasks');
        //console.log("Raw columns with tasks data:", JSON.stringify(response.data));
        return response.data || [];
      },
      enabled: Boolean(apiClient.isAuthenticated()),
  });

  const fetchEmailContentForTask = async (taskId: number, threadId: string, type: 'original' | 'latest' = 'latest') => {
    // Find the task in the columns
    let foundTask: DbTask | null = null;
    console.log("fetchEmailContentForTask called with:", { taskId, threadId, type });
    console.log("Current data state:", data);
    
    if (data) {
      for (const column of data) {
        console.log("Checking column:", column.id, "with tasks:", column.tasks.length);
        const task = column.tasks.find(t => {
          console.log("Comparing task id:", t.id, "(", typeof t.id, ") with taskId:", taskId, "(", typeof taskId, ")");
          return t.id === taskId;
        });
        if (task) {
          console.log("Found task in column:", column.id, "task:", task);
          foundTask = task;
          break;
        }
      }
    } else {
      console.log("No data available in useColumnsWithTasks hook");
    }
    
    if (!foundTask || !threadId) {
      console.log("Could not find task or threadId is missing:", { foundTask, threadId });
      return;
    }
    
    try {
    // Use the emailService to fetch data (which internally uses our new hooks)
    const emailService = new EmailService();
    
    // First fetch just the thread summary for quick display
    console.log(`Fetching thread summary for thread ${threadId}`);
    const summaryResponse = await emailService.fetchThreadSummary(threadId);
    
    // Update the task with thread summary immediately
    let updatedTask = {
      ...foundTask,
      threadSummary: {
        messageCount: summaryResponse.messageCount,
        participants: summaryResponse.participants,
      },
    };
    
    // Update columns with the summary data
    let newColumns = data?.map(column => ({
      ...column,
      tasks: column.tasks.map(task => 
        task.id === taskId ? updatedTask : task
      ),
    }));
    
    // Update the query cache with summary data
    if (newColumns) {
      console.log("Updating query cache with thread summary");
      queryClient.setQueryData(['columns', 'with-tasks'], newColumns);
    }
    
    // Then fetch the full email content if requested
    //console.log(`Fetching full email content for thread ${threadId}`);
    const threadResponse = await emailService.fetchEmailThread(threadId, type);
    console.log(threadResponse)
    
    // Update the task with full email content
    updatedTask = {
      ...updatedTask,
      emailContent: threadResponse.messages.map(message => ({
        id: message.id,
        sender: message.sender,
        recipients: message.recipients,
        subject: message.subject,
        content: message.content,
        htmlBody: message.htmlBody,
        date: message.date,
      })),
      threadSummary: {
        messageCount: threadResponse.messageCount,
        participants: threadResponse.participants
      }
    };
    
    // Create new columns array with the fully updated task
    newColumns = data?.map(column => ({
      ...column,
      tasks: column.tasks.map(task => 
        task.id === taskId ? updatedTask : task
      ),
    }));
    
    // Update the query cache with the new data
    if (newColumns) {
      console.log("Updating query cache with full email content");
      queryClient.setQueryData(['columns', 'with-tasks'], newColumns);
    }
    
    // Return the thread response so it can be used by the caller
    return threadResponse;
  } catch (error) {
    console.error("Error fetching email content:", error);
    // Optionally update task with error state
    const updatedTask = {
      ...foundTask,
      emailLoadError: error instanceof Error ? error.message : 'Unknown error',
    };
    const newColumns = data?.map(column => ({
      ...column,
      tasks: column.tasks.map(task => 
        task.id === taskId ? updatedTask : task
      ),
    }));
    
    if (newColumns) {
      console.log("Updating query cache with full email content");
      queryClient.setQueryData(['columns', 'with-tasks'], newColumns);
    }
    
    throw error;
  }
};

  // Log the hook values for debugging
  // console.log('[useColumnsWithTasks] Hook values:', {
  //   columns: data,
  //   isLoading,
  //   error,
  //   refetch,
  //   fetchEmailContentForTask,
  // });

  return {
    columns: data,
    isLoading,
    error,
    refetch,
    fetchEmailContentForTask,
  };
}

export function useColumnMutations() {
    const queryClient = useQueryClient();
  
    const createColumn = useMutation({
      mutationFn: async (column: { title: string; position?: number }) => {
        const response = await apiClient.fetchWithAuth<DbColumn>('/api/columns', {
          method: 'POST',
          body: JSON.stringify(column),
        });
        
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['columns'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
      },
    });
  
    const updateColumn = useMutation({
      mutationFn: async ({ id, ...column }: Partial<DbColumn> & { id: number }) => {
        const response = await apiClient.fetchWithAuth<DbColumn>(`/api/columns/${id}`, {
          method: 'PUT',
          body: JSON.stringify(column),
        });
        
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['columns'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
      },
    });
  
    const deleteColumn = useMutation({
      mutationFn: async (id: number) => {
        const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/columns/${id}`, {
          method: 'DELETE',
        });
        
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['columns'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
      },
    });
  
    const reorderColumns = useMutation({
      mutationFn: async (columnIds: number[]) => {
        const response = await apiClient.fetchWithAuth<{ success: boolean }>('/api/columns/reorder', {
          method: 'POST',
          body: JSON.stringify({ columnIds }),
        });
        
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['columns'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
      },
    });
  
    const initializeDefaultColumns = useMutation({
      mutationFn: async () => {
        const response = await apiClient.fetchWithAuth<DbColumn[]>('/api/columns/initialize-defaults', {
          method: 'POST',
        });
        
        return response.data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['columns'] });
        queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
      },
    });
  
    return { 
      createColumn, 
      updateColumn, 
      deleteColumn, 
      reorderColumns,
      initializeDefaultColumns
    };
  }