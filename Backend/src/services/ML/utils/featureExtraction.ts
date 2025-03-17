import { EmailThread } from '../../../Types/model';

export interface EmailFeatures {
    promotionalScore: number;
    urgencyScore: number;
    hasLinks: boolean;
    hasCheckboxes: boolean;
    hasDateMentions: boolean;
    messageLength: number;
}

export class EmailFeatureExtractor {
    private promotionalPatterns = /\b(unsubscribe|view in browser|email preferences|privacy policy|terms of service|promotion|offer|discount|sale|deal|limited time|exclusive|off|save|special)\b/i;
    private urgencyPatterns = /\b(urgent|asap|immediate|deadline|due|required|important|critical|priority|action needed)\b/i;
    private datePatterns = /\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}\s*(am|pm))\b/i;
    private checkboxPatterns = /\[[\s]?\]|\[\x20?\]|\u2610|\u2B1C|\u25A1/; // Using Unicode escapes for checkbox characters

    public extractFeatures(emailThread: EmailThread): EmailFeatures {
        const latestMessage = emailThread.messages[emailThread.messages.length - 1];
        const content = typeof latestMessage.body === 'string' ? latestMessage.body : 
                       typeof latestMessage.snippet === 'string' ? latestMessage.snippet : '';
        const subject = latestMessage.headers?.subject || '';
        const text = `${subject} ${content}`.toLowerCase();

        return {
            promotionalScore: this.calculatePromotionalScore(text),
            urgencyScore: this.calculateUrgencyScore(text),
            hasLinks: this.containsLinks(text),
            hasCheckboxes: this.containsCheckboxes(text),
            hasDateMentions: this.containsDateMentions(text),
            messageLength: text.length
        };
    }

    private calculatePromotionalScore(text: string): number {
        const promotionalMatches = (text.match(this.promotionalPatterns) || []).length;
        return Math.min(promotionalMatches / 3, 1); // Normalize to 0-1
    }

    private calculateUrgencyScore(text: string): number {
        const urgencyMatches = (text.match(this.urgencyPatterns) || []).length;
        return Math.min(urgencyMatches / 2, 1); // Normalize to 0-1
    }

    private containsLinks(text: string): boolean {
        return /http[s]?:\/\/|www\./i.test(text);
    }

    private containsCheckboxes(text: string): boolean {
        return this.checkboxPatterns.test(text);
    }

    private containsDateMentions(text: string): boolean {
        return this.datePatterns.test(text);
    }
}