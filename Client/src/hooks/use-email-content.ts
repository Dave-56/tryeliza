// src/hooks/use-email-content.ts
import { useState } from 'react';

interface EmailMessage {
  id: string;
  sender: string;
  recipients: string[];
  subject: string;
  content: string;
  date: string;
}

interface ThreadSummary {
  messageCount: number;
  participants: string[];
}

export function useEmailContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailContent, setEmailContent] = useState<EmailMessage[] | null>(null);
  const [threadSummary, setThreadSummary] = useState<ThreadSummary | null>(null);

  const fetchEmailContent = async (threadId: string, type: 'original' | 'latest' = 'latest') => {
    if (!threadId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Call your backend API to fetch email content from Gmail
      const response = await fetch(`/api/emails/thread/${threadId}?type=${type}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch email content');
      }
      
      const data = await response.json();
      
      setEmailContent(data.messages);
      setThreadSummary({
        messageCount: data.messageCount,
        participants: data.participants,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error fetching email content:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    emailContent,
    threadSummary,
    isLoading,
    error,
    fetchEmailContent,
  };
}