import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskAction, WaitingTask } from '../types/model';
import { apiClient } from '../lib/api-client';

// Task hooks
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await apiClient.fetchWithAuth<Task[]>('/api/tasks');
      return response.data || [];
    },
    // Only run query if user is authenticated
    enabled: Boolean(apiClient.isAuthenticated()),
  });
}

export function useTaskById(taskId: number | null) {
  return useQuery({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const response = await apiClient.fetchWithAuth<Task>(`/api/tasks/${taskId}`);
      return response.data || null;
    },
    enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
  });
}

export function useTaskWithActions(taskId: number | null) {
  return useQuery({
    queryKey: ['tasks', taskId, 'with-actions'],
    queryFn: async () => {
      if (!taskId) return null;
      const response = await apiClient.fetchWithAuth<{ task: Task, actions: TaskAction[] }>(`/api/tasks/${taskId}/with-actions`);
      return response.data || null;
    },
    enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
  });
}

export function useWaitingTasks() {
  return useQuery({
    queryKey: ['tasks', 'waiting'],
    queryFn: async () => {
      const response = await apiClient.fetchWithAuth<{ task: Task, waitingInfo: WaitingTask }[]>('/api/tasks/waiting');
      return response.data || [];
    },
    enabled: Boolean(apiClient.isAuthenticated()),
  });
}

export function useTaskActionMutations(taskId: number | null) {
  const queryClient = useQueryClient();

  const addAction = useMutation({
    mutationFn: async (actionText: string) => {
      if (!taskId) throw new Error('Task ID is required');
      
      const response = await apiClient.fetchWithAuth<TaskAction[]>(`/api/task-actions/${taskId}`, {
        method: 'POST',
        body: JSON.stringify({ actions: [actionText] }),
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'with-actions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const toggleActionCompletion = useMutation({
    mutationFn: async (actionId: number) => {
      const response = await apiClient.fetchWithAuth<TaskAction>(`/api/task-actions/${taskId}/action/${actionId}/toggle`, {
        method: 'PUT',
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'with-actions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const deleteAction = useMutation({
    mutationFn: async (actionId: number) => {
      const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/task-actions/${taskId}/action/${actionId}`, {
        method: 'DELETE',
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'with-actions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  return { addAction, toggleActionCompletion, deleteAction };
}

export function useTaskMutations() {
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: async (task: Partial<Task>) => {
      const response = await apiClient.fetchWithAuth<Task>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...task }: Partial<Task> & { id: number }) => {
      console.log('updateTask mutation called with:', { id, ...task });
      const response = await apiClient.fetchWithAuth<Task>(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(task),
      });
      
      console.log('updateTask response:', response.data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      console.log('updateTask onSuccess with variables:', variables);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const moveTask = useMutation({
    mutationFn: async ({ 
      taskId, 
      columnId, 
      position 
    }: { 
      taskId: number; 
      columnId: number; 
      position: number 
    }) => {
      const response = await apiClient.fetchWithAuth<Task>(`/api/tasks/${taskId}/column`, {
        method: 'PUT',
        body: JSON.stringify({ columnId, position }),
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const response = await apiClient.fetchWithAuth<Task>(`/api/tasks/${taskId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['columns', 'with-tasks'] });
    },
  });

  const updateTaskPriority = useMutation({
    mutationFn: async ({ taskId, priority }: { taskId: number; priority: string }) => {
      const response = await apiClient.fetchWithAuth<Task>(`/api/tasks/${taskId}/priority`, {
        method: 'PUT',
        body: JSON.stringify({ priority }),
      });
      
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
  });

  return { 
    createTask, 
    updateTask, 
    deleteTask, 
    moveTask,
    updateTaskStatus,
    updateTaskPriority
  };
}
