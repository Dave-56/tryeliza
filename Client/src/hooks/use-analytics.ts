// src/hooks/use-analytics.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface UserAnalytics {
  emailsProcessed: number;
  taskConversion: {
    percentage: number;
    emailsToTasks: number;
  };
  draftsCreated: number;
  pendingDrafts: number;
}

export interface TotalAnalytics {
    totalEmailsProcessed: number;
    totalTasksCreated: number;
    totalDraftsCreated: number;
    totalPendingDrafts: number;
  }
  
  export interface DateRangeAnalytics {
    emailsProcessed: number;
    tasksCreated: number;
    draftsCreated: number;
  }

export interface DraftActivity {
  id: number;
  title: string;
  status: string;
  created_at: string | null;
  email_id: string | null;
  gmail_draft_id: string | null;
}

export function useAnalytics() {
  
  const { data, isLoading, error, refetch } = useQuery<UserAnalytics>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await apiClient.fetchWithAuth<UserAnalytics>('/api/analytics');
      // Provide a default value if data is undefined
      return response.data || {
        emailsProcessed: 0,
        taskConversion: {
          percentage: 0,
          emailsToTasks: 0
        },
        draftsCreated: 0,
        pendingDrafts: 0
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: Boolean(apiClient.isAuthenticated()), // Only run the query if the user is authenticated
  });

  return {
    data,
    isLoading,
    error,
    refetch
  };
}

export function useTotalAnalytics() {
    const { data, isLoading, error, refetch } = useQuery<TotalAnalytics>({
      queryKey: ['analytics', 'total'],
      queryFn: async () => {
        const response = await apiClient.fetchWithAuth<TotalAnalytics>('/api/analytics/total');
        // Provide a default value if data is undefined
        return response.data || {
          totalEmailsProcessed: 0,
          totalTasksCreated: 0,
          totalDraftsCreated: 0,
          totalPendingDrafts: 0
        };
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
      enabled: Boolean(apiClient.isAuthenticated()), // Only run the query if the user is authenticated
    });
  
    return {
      data,
      isLoading,
      error,
      refetch
    };
}

export function useDateRangeAnalytics(startDate?: string, endDate?: string) {
    const { data, isLoading, error, refetch } = useQuery<DateRangeAnalytics>({
      queryKey: ['analytics', 'date-range', startDate, endDate],
      queryFn: async () => {
        if (!startDate || !endDate) {
          throw new Error('Start date and end date are required');
        }
        
        const response = await apiClient.fetchWithAuth<DateRangeAnalytics>(
          `/api/analytics/date-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        );
        
        // Provide a default value if data is undefined
        return response.data || {
          emailsProcessed: 0,
          tasksCreated: 0,
          draftsCreated: 0
        };
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
      enabled: Boolean(apiClient.isAuthenticated()) && !!startDate && !!endDate, // Only run the query if authenticated and dates are provided
    });
  
    return {
      data,
      isLoading,
      error,
      refetch
    };
}

export function useDraftActivities(limit: number = 10) {
  const { data, isLoading, error, refetch } = useQuery<DraftActivity[]>({
    queryKey: ['analytics', 'draft-activities', limit],
    queryFn: async () => {
      const response = await apiClient.fetchWithAuth<DraftActivity[]>(
        `/api/analytics/draft-activities?limit=${limit}`
      );
      
      // Provide a default value if data is undefined
      return response.data || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: Boolean(apiClient.isAuthenticated()), // Only run the query if the user is authenticated
  });

  return {
    data,
    isLoading,
    error,
    refetch
  };
}