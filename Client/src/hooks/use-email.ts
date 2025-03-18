import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '../lib/api-client';
import type { Email, Task } from '../types/model';
import { EmailProvider, Integration } from '../types/model';
import { EmailMessage, ThreadSummary, EmailThreadResponse } from '../types/email';


export function useEmails() {
  return useQuery<Email[]>({
    queryKey: ['/api/emails'],
  });
}

// Check for email Accounts
export function useEmailAccounts() {
  return useQuery<Integration[]>({
    queryKey: ['/api/users/email-accounts'],
    queryFn: async () => {
      console.log('Fetching email accounts...')
      try {
        // Log the authentication status
        const isAuth = await apiClient.isAuthenticated();
        console.log('Is authenticated:', isAuth);
        
        const response = await apiClient.fetchWithAuth<Integration[]>('/api/users/email-accounts');
        console.log('Email accounts raw response:', response);
        
        if (!response.data) {
          console.warn('No data in response:', response);
        }
        
        return response.data || [];
      } catch (error) {
        console.error('Error fetching email accounts:', error);
        return [];
      }
    },
    enabled: Boolean(apiClient.isAuthenticated())
  });
}

// Gmail Integration Mutation 
export const useGmailIntegration = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (authCode: string) => {
      const response = await apiClient.fetchWithAuth<Integration>('/api/email-accounts', {
        method: 'POST',
        body: JSON.stringify({
          provider: EmailProvider.GOOGLE,
          authCode
        }),
      });

      // Verify the response has the expected structure
      if (!response.data) {
        throw new Error('Invalid response format from server');
      }
  
      return response.data; // Return just the data portion
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/email-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summaries'] });

      toast({
        description: "Successfully connected Gmail account",
      });
    },
    onError: (error) => {
      console.error('Error connecting Gmail:', error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to connect Gmail account. Please try again.",
      });
    },
  });
};

// Disconnect Google mutation hook
export const useDisconnectGmail = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (accountId: string) => {
      const response = await apiClient.fetchWithAuth<{ message: string }>(`/api/email-accounts/${accountId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          isConnected: false
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/users/email-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summaries'] });

      toast({
        description: "Successfully disconnected Gmail account",
      });
    },
    onError: (error) => {
      console.error('Error disconnecting Gmail:', error);
      toast({
        variant: "destructive",
        description: "Failed to disconnect Gmail account. Please try again.",
      });
    },
  });
};

/**
 * Hook to fetch email thread data by thread ID
 * @param threadId The ID of the email thread to fetch
 * @param type Whether to fetch 'original' (first email) or 'latest' (all emails)
 */
export function useEmailThread(threadId: string | null | undefined, type: 'original' | 'latest' = 'latest') {
  return useQuery<EmailThreadResponse>({
    queryKey: ['emailThread', threadId, type],
    queryFn: async () => {
      if (!threadId) {
        throw new Error('Thread ID is required');
      }
      
      const response = await apiClient.fetchWithAuth<EmailThreadResponse>(
        `/api/emails/thread/${threadId}?type=${type}`
      );
      
      if (!response.data) {
        throw new Error('Failed to fetch email thread data');
      }
      
      return response.data;
    },
    enabled: !!threadId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });
}

/**
 * Hook to fetch just the thread summary (participants and message count)
 * This is a lightweight alternative to useEmailThread when you don't need the full content
 * @param threadId The ID of the email thread to fetch summary for
 */
export function useThreadSummary(threadId: string | null | undefined) {
  return useQuery<ThreadSummary>({
    queryKey: ['threadSummary', threadId],
    queryFn: async () => {
      if (!threadId) {
        throw new Error('Thread ID is required');
      }
      
      const response = await apiClient.fetchWithAuth<ThreadSummary>(
        `/api/emails/thread/${threadId}/summary`
      );
      
      if (!response.data) {
        throw new Error('Failed to fetch thread summary');
      }
      
      return response.data;
    },
    enabled: !!threadId,
    staleTime: 10 * 60 * 1000, // Consider summary data fresh for 10 minutes
  });
}

/**
 * Hook to fetch a single email's content by email ID
 * @param emailId The ID of the specific email to fetch
 */
export function useEmailContent(emailId: string | null | undefined) {
  return useQuery<EmailMessage>({
    queryKey: ['emailContent', emailId],
    queryFn: async () => {
      if (!emailId) {
        throw new Error('Email ID is required');
      }
      
      const response = await apiClient.fetchWithAuth<EmailMessage>(
        `/api/emails/${emailId}`
      );
      
      if (!response.data) {
        throw new Error('Failed to fetch email content');
      }
      
      return response.data;
    },
    enabled: !!emailId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });
}

export function useEmailMutations() {
  const queryClient = useQueryClient();

  const convertToTask = useMutation({
    mutationFn: async ({ emailId, title, description, dueDate }: {
      emailId: number;
      title?: string;
      description?: string;
      dueDate?: Date;
    }) => {
      const response = await apiClient.fetchWithAuth<Task>(`/api/emails/${emailId}/convert-to-task`, {
        method: 'POST',
        body: JSON.stringify({ title, description, dueDate }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summaries']  });
    },
  });

  return { convertToTask };
}

export function useManualSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.fetchWithAuth<{
        synced: number;
        processed: number;
        failed: number;
        summary?: {
          categories: Array<{
            title: string;
            summaries: Array<{
              title: string;
              description: string;
              messageId: string;
              received_at?: string;
              sender?: string;
            }>;
            priorityScore: number;
          }>;
          isPending: boolean;
          generatedAt?: Date;
        };
      }>('/api/email-accounts/manual-sync', {
        method: 'POST',
      });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch email digest data after successful sync
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summaries'] });
      
      toast({
        title: "Success",
        description: "Email sync completed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync emails",
        variant: "destructive",
      });
    }
  });
}
