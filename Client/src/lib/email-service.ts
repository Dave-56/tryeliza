import { apiClient } from '../lib/api-client';
import { EmailMessage, ThreadSummary, EmailThreadResponse } from '../types/email';

export class EmailService {
  /**
   * Fetches email thread data by thread ID
   * @param threadId The ID of the email thread to fetch
   * @param type Whether to fetch 'original' (first email) or 'latest' (all emails)
   */
  async fetchEmailThread(threadId: string, type: 'original' | 'latest' = 'latest'): Promise<EmailThreadResponse> {
    if (!threadId) {
      throw new Error('Thread ID is required');
    }
    
    try {
      const response = await apiClient.fetchWithAuth<EmailThreadResponse>(
        `/api/emails/thread/${threadId}?type=${type}`
      );
      
      //console.log('Email thread raw response:', response.data);
      
      // Type guard to check if an object has EmailThreadResponse properties
      const hasThreadResponseProps = (obj: any): obj is EmailThreadResponse => {
        return obj && typeof obj === 'object' && 
               'messages' in obj && 
               'messageCount' in obj && 
               'participants' in obj;
      };
      
      // Handle case where data is directly in the response object or in response.data
      let messages: EmailMessage[] = [];
      let messageCount = 0;
      let participants: string[] = [];
      
      if (response.data && hasThreadResponseProps(response.data)) {
        // It's an EmailThreadResponse inside response.data
        messages = response.data.messages;
        messageCount = response.data.messageCount;
        participants = response.data.participants;
      } else if (hasThreadResponseProps(response)) {
        // The response itself contains the EmailThreadResponse properties
        messages = response.messages;
        messageCount = response.messageCount;
        participants = response.participants;
      } else {
        throw new Error('Invalid email thread response format');
      }
      
      // Ensure the response matches the EmailThreadResponse interface
      const threadResponse: EmailThreadResponse = {
        messages: messages || [],
        messageCount: messageCount || 0,
        participants: participants || []
      };
      
      console.log('Constructed email thread response:', threadResponse);
      return threadResponse;
    } catch (error: any) {
      console.error('Error fetching email thread:', error);
      
      // Provide more specific error messages based on error type
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const status = error.response.status;
        if (status === 404) {
          throw new Error(`Thread not found: ${threadId}`);
        } else if (status === 401 || status === 403) {
          throw new Error('Authentication error: Please reconnect your email account');
        } else {
          throw new Error(`Server error (${status}): ${error.response.data?.error || 'Failed to fetch email thread'}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error('Network error: No response received from server');
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Failed to fetch email thread: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Fetches just the thread summary (participants and message count)
   * @param threadId The ID of the email thread to fetch summary for
   */
  async fetchThreadSummary(threadId: string): Promise<ThreadSummary> {
    if (!threadId) {
      throw new Error('Thread ID is required');
    }
    
    try {
      const response = await apiClient.fetchWithAuth<ThreadSummary>(
        `/api/emails/thread/${threadId}/summary`
      );

      // More detailed logging to debug the response structure
      console.log('Thread summary raw response:', response);
      
      // Handle case where data is directly in the response object or in response.data
      // First check if it's a BackendResponse with a data property
      let messageCount = 0;
      let participants: string[] = [];
      
      // Type guard to check if an object has ThreadSummary properties
      const hasThreadSummaryProps = (obj: any): obj is ThreadSummary => {
        return obj && typeof obj === 'object' && 
               'messageCount' in obj && 
               'participants' in obj;
      };
      
      if (response.data && hasThreadSummaryProps(response.data)) {
        // It's a ThreadSummary inside response.data
        messageCount = response.data.messageCount;
        participants = response.data.participants;
      } else if (hasThreadSummaryProps(response)) {
        // The response itself contains the ThreadSummary properties
        messageCount = response.messageCount;
        participants = response.participants;
      }
      
      // Ensure the response matches the ThreadSummary interface
      const threadSummary: ThreadSummary = {
        messageCount: messageCount || 0,
        participants: participants || []
      };
      
      console.log('Constructed thread summary:', threadSummary);
      return threadSummary;
    } catch (error: any) {
      console.error('Error fetching thread summary:', error);
      
      // Provide more specific error messages based on error type
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const status = error.response.status;
        if (status === 404) {
          throw new Error(`Thread not found: ${threadId}`);
        } else if (status === 401 || status === 403) {
          throw new Error('Authentication error: Please reconnect your email account');
        } else {
          throw new Error(`Server error (${status}): ${error.response.data?.error || 'Failed to fetch thread summary'}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error('Network error: No response received from server');
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Failed to fetch thread summary: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Fetches a single email's content by email ID
   * @param emailId The ID of the specific email to fetch
   */
  async fetchEmailContent(emailId: string): Promise<EmailMessage> {
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
  }
}