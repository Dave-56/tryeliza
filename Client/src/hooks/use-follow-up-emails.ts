import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client'; // Your Supabase client
import { useUser } from '@/hooks/use-user';
import { apiClient } from '@/lib/api-client';
import type { FollowUpEmail } from '../../../Backend/src/db/schema';

// Type for creating a new follow-up email
interface CreateFollowUpEmailParams {
  taskId: number;
  email_subject: string;
  email_content: string;
  recipient: string;
  status: 'drafted' | 'sent' | 'scheduled';
  scheduled_time?: string;
}

// Type for updating a follow-up email
interface UpdateFollowUpEmailParams {
  id: number;
  email_subject?: string;
  email_content?: string;
  recipient?: string;
  status?: 'drafted' | 'sent' | 'scheduled';
  scheduled_time?: string;
}

// Hook to fetch follow-up emails for a specific task
export function useFollowUpEmails(taskId: number | null) {
  return useQuery({
    queryKey: ['follow-up-emails', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const response = await apiClient.fetchWithAuth<FollowUpEmail[]>(`/api/follow-up-emails/task/${taskId}`);
      return response.data || [];
    },
    enabled: Boolean(apiClient.isAuthenticated()) && !!taskId,
  });
}

// Hook for follow-up email mutations (create, update, delete)
export function useFollowUpEmailMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create a new follow-up email
  const createFollowUpEmail = useMutation({
    mutationFn: async ({ taskId, email_subject, email_content, recipient, status, scheduled_time }: CreateFollowUpEmailParams) => {
      const response = await apiClient.fetchWithAuth<FollowUpEmail>(`/api/follow-up-emails/task/${taskId}`, {
        method: 'POST',
        body: JSON.stringify({
          email_subject,
          email_content,
          recipient,
          status,
          scheduled_time
        }),
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.task_id) {
        queryClient.invalidateQueries({ queryKey: ['follow-up-emails', data.task_id] });
        toast({
          title: "Success",
          description: "Follow-up email created successfully",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create follow-up email",
        variant: "destructive",
      });
    }
  });

  // Update an existing follow-up email
  const updateFollowUpEmail = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateFollowUpEmailParams) => {
      const response = await apiClient.fetchWithAuth<FollowUpEmail>(`/api/follow-up-emails/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.task_id) {
        queryClient.invalidateQueries({ queryKey: ['follow-up-emails', data.task_id] });
        toast({
          title: "Success",
          description: "Follow-up email updated successfully",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update follow-up email",
        variant: "destructive",
      });
    }
  });

  // Delete a follow-up email
  const deleteFollowUpEmail = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/follow-up-emails/${id}`, {
        method: 'DELETE',
      });
      
      return response.data;
    },
    onSuccess: (_, variables, context) => {
      // Since we don't know which task this email belongs to in this context,
      // we'll invalidate all follow-up emails queries
      queryClient.invalidateQueries({ queryKey: ['follow-up-emails'] });
      toast({
        title: "Success",
        description: "Follow-up email deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete follow-up email",
        variant: "destructive",
      });
    }
  });

  // Send a follow-up email through Gmail
  const sendFollowUpEmail = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.fetchWithAuth<FollowUpEmail>(`/api/follow-up-emails/send/${id}`, {
        method: 'POST',
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.task_id) {
        queryClient.invalidateQueries({ queryKey: ['follow-up-emails', data.task_id] });
        toast({
          title: "Success",
          description: "Eliza has sent your follow-up email in Gmail",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Eliza couldn't send your follow-up email in Gmail",
        variant: "destructive",
      });
    }
  });

  return {
    createFollowUpEmail,
    updateFollowUpEmail,
    deleteFollowUpEmail,
    sendFollowUpEmail
  };
}

// Helper function to format follow-up emails for UI display
export interface FormattedFollowUpEmail {
  id: number;
  taskId: number;
  subject: string;
  content: string;
  recipient: string;
  status: string;
  scheduledTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export function formatFollowUpEmail(email: FollowUpEmail): FormattedFollowUpEmail {
  return {
    id: email.id,
    taskId: email.task_id,
    subject: email.email_subject,
    content: email.email_content,
    recipient: email.recipient,
    status: email.status,
    scheduledTime: email.scheduled_time ? new Date(email.scheduled_time).toISOString() : null,
    createdAt: email.created_at ? new Date(email.created_at).toISOString() : new Date().toISOString(),
    updatedAt: email.updated_at ? new Date(email.updated_at).toISOString() : new Date().toISOString()
  };
}