import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TaskNote } from '../types/model';
import { apiClient } from '../lib/api-client';

// Task Notes hooks
export function useTaskNotes(taskId: number | null) {
  return useQuery({
    queryKey: ['task-notes', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const response = await apiClient.fetchWithAuth<TaskNote[]>(`/api/task-notes/${taskId}`);
      return response.data || [];
    },
    enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
  });
}

export function useTaskNoteMutations() {
  const queryClient = useQueryClient();

  const addTaskNote = useMutation({
    mutationFn: async ({ taskId, text }: { taskId: number; text: string }) => {
      const response = await apiClient.fetchWithAuth<TaskNote>(`/api/task-notes/${taskId}`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.task_id) {
        queryClient.invalidateQueries({ queryKey: ['task-notes', data.task_id] });
      }
    },
  });

  const deleteTaskNote = useMutation({
    mutationFn: async (noteId: number) => {
      const response = await apiClient.fetchWithAuth<{ id: number }>(`/api/task-notes/${noteId}`, {
        method: 'DELETE',
      });
      
      return response.data;
    },
    onSuccess: () => {
      // Since we don't know which task this note belongs to without additional context,
      // we'll invalidate all task notes queries
      queryClient.invalidateQueries({ queryKey: ['task-notes'] });
    },
  });

  return { 
    addTaskNote, 
    deleteTaskNote
  };
}

// Helper function to format task notes for UI
export interface FormattedTaskNote {
  id: number;
  text: string;
  author: string;
  timestamp: string;
}

export function formatTaskNote(note: TaskNote, userName: string = 'You'): FormattedTaskNote {
  return {
    id: note.id,
    text: note.text,
    author: userName, // In a real implementation, we'd fetch the user name from the user_id
    timestamp: note.created_at ? new Date(note.created_at).toISOString() : new Date().toISOString()
  };
}