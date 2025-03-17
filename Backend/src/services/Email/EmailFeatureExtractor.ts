// Responsible for extracting features from emails for classification
// src/services/Email/EmailFeatureExtractor.ts
import { EmailThread, EmailMessage } from '../../Types/model';
import { IEmailFeatureExtractor, EmailFeatures } from './interfaces';

export class EmailFeatureExtractor implements IEmailFeatureExtractor {
  public extractFeatures(emailThread: EmailThread): EmailFeatures {
    const latestMessage = emailThread.messages[emailThread.messages.length - 1];
    const subject = latestMessage.headers?.subject || '';
    // Ensure body is a string
    const body = typeof latestMessage.body === 'string' ? latestMessage.body : '';

    return {
      // Text features
      subjectTokens: this.tokenize(subject),
      bodyTokens: this.tokenize(body),
      
      // Metadata features
      domainType: this.extractDomainType(latestMessage.headers?.from || ''),
      hasLinks: typeof body === 'string' && (body.includes('http') || body.includes('www.')),
      hasDateTime: this.containsDateTime(subject + ' ' + body),
      hasActionWords: this.containsActionWords(subject + ' ' + body),
      
      // Structural features
      messageLength: body.length,
      hasCheckboxes: body.includes('☐') || body.includes('□'),
      
      // Semantic features
      urgencyScore: this.calculateUrgencyScore(latestMessage),
      promotionalScore: this.calculatePromotionalScore(latestMessage),
      importantInfoScore: this.calculateImportantInfoScore(latestMessage),
    };
  }

  public tokenize(text: any): string[] {
    // Ensure text is a string
    const textStr = typeof text === 'string' ? text : '';
    
    return textStr.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)            // Split by whitespace
      .filter(word => word.length > 2); // Filter out very short words
  }

  public extractDomainType(fromHeader: string): string {
    // Implementation from original code
    try {
      // Extract domain from email address
      const match = fromHeader.match(/<([^@]+@([^>]+))>/) || fromHeader.match(/([^@]+@([^>]+))/);
      if (!match) return 'unknown';
      
      const domain = match[2].toLowerCase();
      
      // Categorize domain
      if (domain.includes('gmail.com') || domain.includes('yahoo.com') || 
          domain.includes('hotmail.com') || domain.includes('outlook.com')) {
        return 'personal';
      }
      
      if (domain.includes('newsletter') || domain.includes('marketing') || 
          domain.includes('info') || domain.includes('noreply')) {
        return 'marketing';
      }
      
      return 'business';
    } catch (error) {
      console.error('Error extracting domain:', error);
      return 'unknown';
    }
  }

  public containsDateTime(text: any): boolean {
    // Implementation from original code
    // Ensure text is a string
    const textStr = typeof text === 'string' ? text : '';
    const dateTimePatterns = /\b(tomorrow|next week|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d{1,2}(:\d{2})?\s*(am|pm|AM|PM)|from \d{1,2}(:\d{2})?\s*(am|pm|AM|PM) to \d{1,2}(:\d{2})?\s*(am|pm|AM|PM))\b/i;
    return dateTimePatterns.test(textStr);
  }

  public containsActionWords(text: any): boolean {
    // Implementation from original code
    // Ensure text is a string
    const textStr = typeof text === 'string' ? text : '';
    const actionVerbs = /\b(submit|respond|confirm|complete|review|approve|verify|update|reply|action required|urgent|important|deadline|due|asap|needed|request|provide|send|fill out|sign|upload|download|forward|attach|delete|mark)\b/i;
    return actionVerbs.test(textStr);
  }

  public calculateUrgencyScore(message: EmailMessage): number {
    // Implementation from original code
    // Ensure body is a string
    const body = typeof message.body === 'string' ? message.body : '';
    const subject = message.headers?.subject || '';
    const text = `${subject} ${body}`.toLowerCase();
    
    // Words indicating urgency
    const urgentWords = [
      'urgent', 'immediately', 'asap', 'deadline', 'today', 'tomorrow', 
      'quickly', 'priority', 'important', 'critical', 'emergency', 'now',
      'due', 'overdue', 'required', 'action needed'
    ];
    
    // Count occurrences of urgent words
    let count = 0;
    for (const word of urgentWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) count += matches.length;
    }
    
    // Normalize to a 0-1 scale
    return Math.min(count / 5, 1);
  }

  public calculatePromotionalScore(message: EmailMessage): number {
    // Implementation from original code
    // Ensure body is a string
    const body = typeof message.body === 'string' ? message.body : '';
    const subject = message.headers?.subject || '';
    const text = `${subject} ${body}`.toLowerCase();
    
    // Promotional indicators
    const promotionalWords = [
      'sale', 'discount', 'offer', 'promotion', 'deal', 'limited time', 
      'exclusive', 'off', 'save', 'special', 'subscribe', 'unsubscribe', 
      'newsletter', 'weekly', 'monthly', 'free', 'trial', 'new product', 
      'introducing', 'announcement', 'launch', 'release', 'book', 'author',
      'survey', 'feedback', 'pre-order', 'buy', 'shop', 'purchase',
      'order', 'pre-order', 'publication', 'deadline'
    ];
    
    // Count occurrences of promotional words
    let promoCount = 0;
    for (const word of promotionalWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) promoCount += matches.length;
    }
    
    // Normalize to a 0-1 scale
    return Math.min(promoCount / 8, 1);
  }

  public calculateImportantInfoScore(message: EmailMessage): number {
    // Implementation from original code
    // Ensure body is a string
    const body = typeof message.body === 'string' ? message.body : '';
    const subject = message.headers?.subject || '';
    const text = `${subject} ${body}`.toLowerCase();
    
    // Important business information indicators
    const importantInfoWords = [
      'status report', 'policy change', 'product launch', 'project update',
      'company announcement', 'business update', 'quarterly report',
      'annual report', 'earnings', 'financial results', 'press release',
      'announcement', 'business', 'company', 'update', 'report', 'policy',
      'strategy', 'initiative', 'development'
    ];
    
    // Count occurrences of important info words
    let count = 0;
    for (const word of importantInfoWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) count += matches.length;
    }
    
    // Check for business sender domains
    if (this.extractDomainType(message.headers?.from || '') === 'business') {
      count += 1;
    }
    
    // Normalize to a 0-1 scale
    return Math.min(count / 6, 1);
  }
}