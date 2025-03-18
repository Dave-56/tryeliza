import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskAction, WaitingTask } from '../types/model';
import { apiClient } from '../lib/api-client';

// Task Action hooks
export function useTaskActions(taskId: number | null) {
    return useQuery({
      queryKey: ['task-actions', taskId],
      queryFn: async () => {
        if (!taskId) return [];
        const response = await apiClient.fetchWithAuth<TaskAction[]>(`/api/task-actions/task/${taskId}`);
        return response.data || [];
      },
      enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
    });
  }
  
  export function useTaskActionStats(taskId: number | null) {
    return useQuery({
      queryKey: ['task-actions', taskId, 'stats'],
      queryFn: async () => {
        if (!taskId) return { completed: 0, total: 0 };
        const response = await apiClient.fetchWithAuth<{ completed: number, total: number }>(`/api/task-actions/task/${taskId}/stats`);
        return response.data || { completed: 0, total: 0 };
      },
      enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
    });
  }
  
  export function useTaskActionMutations() {
    const queryClient = useQueryClient();
  
    const addTaskActions = useMutation({
      mutationFn: async ({ taskId, actions }: { taskId: number; actions: string[] }) => {
        const response = await apiClient.fetchWithAuth<TaskAction[]>(`/api/task-actions/task/${taskId}`, {
          method: 'POST',
          body: JSON.stringify({ actions }),
        });
        
        return response.data;
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['task-actions', variables.taskId] });
        queryClient.invalidateQueries({ queryKey: ['task-actions', variables.taskId, 'stats'] });
        queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId, 'with-actions'] });
      },
    });
  
    const toggleTaskAction = useMutation({
      mutationFn: async (actionId: number) => {
        const response = await apiClient.fetchWithAuth<TaskAction>(`/api/task-actions/${actionId}/toggle`, {
          method: 'PUT',
        });
        
        return response.data;
      },
      onSuccess: (data) => {
        const taskId = data?.task_id;
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ['task-actions', taskId] });
          queryClient.invalidateQueries({ queryKey: ['task-actions', taskId, 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'with-actions'] });
        }
      },
    });
  
    const deleteTaskAction = useMutation({
      mutationFn: async (actionId: number) => {
        const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/task-actions/${actionId}`, {
          method: 'DELETE',
        });
        
        return response.data;
      },
      onSuccess: (_, variables, context) => {
        // Context would need to be set in the onMutate callback to get the taskId
        queryClient.invalidateQueries({ queryKey: ['task-actions'] });
      },
    });
  
    const reorderTaskActions = useMutation({
      mutationFn: async ({ taskId, actionIds }: { taskId: number; actionIds: number[] }) => {
        const response = await apiClient.fetchWithAuth<{ success: boolean }>(`/api/task-actions/task/${taskId}/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ actionIds }),
        });
        
        return response.data;
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['task-actions', variables.taskId] });
        queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId, 'with-actions'] });
      },
    });
  
    const generateTaskActions = useMutation({
      mutationFn: async (taskId: number) => {
        const response = await apiClient.fetchWithAuth<TaskAction[]>(`/api/task-actions/task/${taskId}/generate`, {
          method: 'POST',
        });
        
        return response.data;
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['task-actions', variables] });
        queryClient.invalidateQueries({ queryKey: ['task-actions', variables, 'stats'] });
        queryClient.invalidateQueries({ queryKey: ['tasks', variables, 'with-actions'] });
      },
    });
  
    return { 
      addTaskActions, 
      toggleTaskAction, 
      deleteTaskAction, 
      reorderTaskActions,
      generateTaskActions
    };
  }
  
  // Waiting task hooks
  export function useWaitingTaskInfo(taskId: number | null) {
    return useQuery({
      queryKey: ['waiting-tasks', taskId],
      queryFn: async () => {
        if (!taskId) return null;
        const response = await apiClient.fetchWithAuth<WaitingTask>(`/api/waiting-tasks/${taskId}`);
        return response.data || null;
      },
      enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
    });
  }
  
  export function useWaitingTaskMutations() {
    const queryClient = useQueryClient();
  
    const updateWaitingInfo = useMutation({
      mutationFn: async ({ 
        taskId, 
        waitingFor, 
        waitingTime 
      }: { 
        taskId: number; 
        waitingFor: string; 
        waitingTime: string 
      }) => {
        const response = await apiClient.fetchWithAuth<WaitingTask>(`/api/waiting-tasks/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify({ waitingFor, waitingTime }),
        });
        
        return response.data;
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['waiting-tasks', variables.taskId] });
        queryClient.invalidateQueries({ queryKey: ['tasks', 'waiting'] });
      },
    });
  
    return { updateWaitingInfo };
  }