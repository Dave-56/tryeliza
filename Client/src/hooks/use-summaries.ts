import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { BackendResponse } from '../types/model';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enUS, enGB, enAU, enCA, enNZ } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { 
  EmailSummary,
  InboxSummaryResponse // Import InboxSummaryResponse type
} from '../types/email-digest';
import { useEmailAccounts } from '@/hooks/use-email'; // Import useEmailAccounts hook
import { useState } from 'react'; // Import useState hook
import { useToast } from '@/hooks/use-toast'; // Import useToast hook

// Helper function to determine the appropriate locale
function getAppropriateLocale() {
  // Get browser language setting
  const userLanguage = navigator.language || navigator.language;
  
  if (userLanguage.startsWith('en-GB')) {
    return enGB; // United Kingdom
  } else if (userLanguage.startsWith('en-AU')) {
    return enAU; // Australia
  } else if (userLanguage.startsWith('en-CA')) {
    return enCA; // Canada
  } else if (userLanguage.startsWith('en-NZ')) {
    return enNZ; // New Zealand
  } else {
    return enUS; // Default to US
  }
}

export function formatUTCToLocal(utcDateString: string): string {
  if (!utcDateString) return '';
  
  try {
    if (utcDateString.match(/[a-zA-Z]{3}\s\d{1,2},\s\d{4}\s\d{1,2}:\d{2}\s[AP]M/)) {
      return utcDateString;
    }
    let utcString = utcDateString;
    if (!utcDateString.endsWith('Z') && !utcDateString.includes('+') && !utcDateString.includes('T')) {
      utcString = `${utcDateString}Z`;
    }
    
    const date = parseISO(utcString);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', utcDateString);
      return 'Invalid date';
    }
    
    const locale = getAppropriateLocale(); 

    return format(date, 'MMM d, yyyy h:mm a', { locale });
  } catch (error) {
    console.error('Error formatting date:', error);
    return utcDateString; 
  }
}



// Main email digest hook
export function useEmailDigest(period: 'morning' | 'evening' = 'evening', date?: Date | null) {
  const { data: emailAccounts, isLoading: isLoadingEmailAccounts } = useEmailAccounts();
  const isGmailConnected = emailAccounts?.some(account => account.provider === 'google' && account.isActive) ?? false;
  const [isSyncing, setIsSyncing] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery<InboxSummaryResponse>({
    queryKey: ['email-digest', period, date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')],
    queryFn: async () => {
      const queryDate = date || new Date();
      const formattedDate = format(queryDate, 'yyyy-MM-dd');
      console.log('Query date:', formattedDate);
            
      setIsSyncing(true);
      try {
        //const url = `/api/daily-summaries?period=${period}&date=${formattedDate}`;
        const url = `/api/daily-summaries/fetch?period=${period}${date ? `&date=${formattedDate}` : ''}`;
        const response = await apiClient.fetchWithAuth<BackendResponse>(url);
        console.log('API response:', response);

        if (!response.data) {
          throw new Error('Invalid response from server');
        }
        return {
          data: {
            message: response.data.message,
            summary: {
              ...response.data.summary,
              period,
              status: 'completed',
              last_run_at: response.data.summary.last_run_at || null
            }
          },
          lastUpdated: response.data.summary.updated_at || new Date().toISOString(),
          isSuccess: response.isSuccess
        };
      } finally {     
        setIsSyncing(false);
      }
    },
    //select: (response) => transformDailySummaryToDigest(response),    enabled: !isLoadingEmailAccounts
  });

  return {
    data,
    isLoading: isLoading || isSyncing,
    error,
    refetch,
    isGmailConnected,
    isFetching
  };
}

// Hook to generate a new summary
export function useGenerateSummary() {
  const { data: emailAccounts } = useEmailAccounts();
  const isGmailConnected = emailAccounts?.some(account => account.provider === 'google' && account.isActive);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ period, date }: { period: 'morning' | 'evening', date?: Date | null }) => {
      if (!isGmailConnected) {
        throw new Error('Please connect your Gmail account to generate summaries');
      }

      const queryDate = date || new Date();
      const formattedDate = format(queryDate, 'yyyy-MM-dd');
      const url = `/api/daily-summaries/generate?period=${period}${date ? `&date=${formattedDate}` : ''}`;
      
      const response = await apiClient.fetchWithAuth<BackendResponse<{ message: string }>>(url, {
        method: 'POST'
      });
      
      if (!response.data) {
        throw new Error('Failed to generate summary');
      }
      
      return { ...response.data, period, date };
    },
    onSuccess: (response) => {
      // Show success toast
      toast({
        title: "Success",
        description: response.data?.message || "Summary generated successfully",
      });

      // Invalidate and refetch the email digest query
      const queryKey = ['email-digest', response.period, response.date ? format(response.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')];
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate summary",
        variant: "destructive",
      });
    }
  });
}
