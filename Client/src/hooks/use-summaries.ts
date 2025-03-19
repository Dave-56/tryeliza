import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { BackendResponse } from '../types/model';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { enUS, enGB, enAU, enCA, enNZ } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { 
  DailySummaryResponse, 
  EmailDigestResponse, 
  CategorySummary
} from '../types/email-digest';

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

// Utility function to format UTC dates to local timezone
export function formatUTCToLocal(utcDateString: string): string {
  if (!utcDateString) return '';
  
  try {
     // Check if the string is already in a formatted date pattern (e.g., "Mar 11, 2025 12:42 PM")
     if (utcDateString.match(/[a-zA-Z]{3}\s\d{1,2},\s\d{4}\s\d{1,2}:\d{2}\s[AP]M/)) {
      return utcDateString; // Already formatted, return as is
    }
    // Ensure the date string is in UTC format by appending 'Z' if it's not already there
    // and doesn't contain timezone info
    let utcString = utcDateString;
    if (!utcDateString.endsWith('Z') && !utcDateString.includes('+') && !utcDateString.includes('T')) {
      utcString = `${utcDateString}Z`;
    }
    
    // Parse the ISO string to a Date object (now properly treated as UTC)
    const date = parseISO(utcString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', utcDateString);
      return 'Invalid date';
    }
    
    // Get the user's locale
    const locale = getAppropriateLocale();
    
    // Format the date using date-fns with the appropriate locale
    return format(date, 'MMM d, yyyy h:mm a', { locale });
  } catch (error) {
    console.error('Error formatting date:', error);
    return utcDateString; // Return the original string if there's an error
  }
}



// Main email digest hook
export function useEmailDigest(period: 'morning' | 'evening' = 'evening', date?: Date | null) {
  const queryClient = useQueryClient();

  return useQuery<BackendResponse<DailySummaryResponse>, Error, EmailDigestResponse>({
    queryKey: ['email-digest', period, date ? format(date, 'yyyy-MM-dd') : undefined],
    queryFn: async () => {
      if (!apiClient.isAuthenticated()) {
        throw new Error('User not authenticated');
      }
      
      let url = `/api/daily-summaries?period=${period}`;
      
      // Add date parameter if provided
      if (date) {
        url += `&date=${format(date, 'yyyy-MM-dd')}`;
      }
      
      const response = await apiClient.fetchWithAuth<DailySummaryResponse>(url);
      
      return response;
    },
    select: transformDailySummaryToDigest,
    staleTime: 1000 * 60 * 5, // Data stays fresh for 5 minutes
    refetchInterval: false,
    retry: 3, // More retries for better reliability
    enabled: Boolean(apiClient.isAuthenticated()),
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true // Refetch on network reconnection
  });
}

// Interface for trigger endpoint response
interface TriggerSummaryResponse {
  message: string;
}

export function useTriggerSummary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<
    { data: TriggerSummaryResponse; period: 'morning' | 'evening' },
    Error,
    'morning' | 'evening'
  >({
    mutationFn: async (period: 'morning' | 'evening' = 'evening') => {
      if (!apiClient.isAuthenticated()) {
        throw new Error('User not authenticated');
      }
      console.log("Period from frontend mutation: ", period);
      const response = await apiClient.fetchWithAuth<TriggerSummaryResponse>('/api/daily-summaries/trigger', {
        method: 'POST',
        body: JSON.stringify({ period }),
      });
      
      // Ensure data is not undefined, throw an error if it is
      if (!response.data) {
        throw new Error('No data returned from the server');
      }
      
      return { data: response.data, period };
    },
    onSuccess: (result) => {
      // Invalidate and force refetch email digest data after successful trigger
      const period = result.period;
      queryClient.invalidateQueries({ queryKey: ['email-digest', period] });
       // Force an immediate refetch to get the latest data
       queryClient.refetchQueries({ queryKey: ['email-digest', period], exact: true });
       // Also invalidate any other related queries
       queryClient.invalidateQueries({ queryKey: ['email-digest'] });
      
      toast({
        title: "Success",
        description: "Summary generation completed successfully",
      });
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

// Transform backend response to match frontend expectations
function transformDailySummaryToDigest(response: BackendResponse<DailySummaryResponse>): EmailDigestResponse {
  // Log the raw response from the backend for debugging
  // console.log('Raw backend response:', response);
  
  if (!response.data?.categoriesSummary || !response.isSuccess) {
      console.log('No categories summary found or request not successful');
      console.log('Response data:', response.data);
      // console.log('Response success:', response.isSuccess);
      // console.log('Response error:', response.error);
      return {
        connected: false,
        message: response.error || 'Failed to fetch email digest',
        categories: [],
        lastUpdated: response.data?.lastUpdated || new Date().toISOString()
      };
    }
  
    console.log('Raw lastUpdated from response:', response.data?.lastUpdated);
    console.log('Current server time from response:', response.data?.currentServerTime);
    console.log('Full response data:', JSON.stringify(response.data));
    
    // Only format lastUpdated for UI display
    const lastUpdatedTime = response.data?.lastUpdated;
    const formattedLastUpdated = formatUTCToLocal(lastUpdatedTime);
    console.log('After formatting lastUpdated:', formattedLastUpdated);
    
    // Log the full response structure to debug
    console.log('Full response structure:', JSON.stringify(response.data, null, 2));
    
    // Map the backend structure to the frontend expected structure
    const categories: CategorySummary[] = response.data?.categoriesSummary 
      ? response.data.categoriesSummary.map(cat => {
          // Map to the updated EmailSummary interface
          const emails = cat.items.map(item => ({
            title: item.title || item.subject || 'No Subject',
            subject: item.subject || 'No Subject',
            headline: item.headline || '',
            gmail_id: item.gmail_id || '',
            receivedAt: formatUTCToLocal(item.receivedAt || new Date().toISOString()),
            sender: item.sender || '',
            is_processed: item.is_processed || false,
            priority_score: item.priority_score,
            insights: item.insights
          }));
          
          return {
            category: cat.category,
            emails: emails,
            summary: `${emails.length} ${cat.category.toLowerCase()} ${emails.length === 1 ? 'email' : 'emails'}`
          };
        })
      : [];
    
    // Create the result object with only lastUpdated for UI
    const result = {
      connected: true,
      categories: categories.sort((a, b) => b.emails.length - a.emails.length),
      // If there are no categories, set lastUpdated to indicate data is not available
      lastUpdated: categories.length === 0 
        ? "Not available" 
        : `FIXED_DATE_VALUE||${lastUpdatedTime}||${formattedLastUpdated}`,
      currentServerTime: response.data?.currentServerTime
    };
    
    console.log('Final transformed result:', JSON.stringify(result));
    return result;
  }