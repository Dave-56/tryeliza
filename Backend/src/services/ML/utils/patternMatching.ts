import { EmailThread } from '../../../Types/model';
import { EmailCategory } from '../data/emailDatasets';

export interface CategoryResult {
    category: EmailCategory | string | null;
    confidence: number;
    requiresAction: boolean;
}

export class EmailPatternMatcher {
    private calendarPatterns = /\b(meeting|appointment|schedule|calendar|event|reservation|rsvp|invite|webinar|conference|call|zoom|teams|google meet|join|attend|reminder|reschedule)\b/i;
    private dateTimePatterns = /\b(tomorrow|next week|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d{1,2}(:\d{2})?\s*(am|pm)|from \d{1,2}(:\d{2})?\s*(am|pm) to \d{1,2}(:\d{2})?\s*(am|pm))\b/i;
    private paymentPatterns = /\b(payment|invoice|receipt|billing|order|transaction|purchase|subscription|renewal|credit card|statement|charge|paid|refund|balance|due|amount|pay now|checkout)\b/i;
    private travelPatterns = /\b(flight|booking|reservation|hotel|itinerary|travel|trip|journey|vacation|departure|arrival|check-in|check-out|confirmation|ticket|boarding pass)\b/i;
    private newsletterPatterns = /\b(newsletter|subscribe|unsubscribe|weekly update|monthly digest|promotion|offer|discount|sale|deal|limited time|exclusive|off|save|special)\b/i;
    private promotionalPatterns = /\b(promotion|offer|discount|sale|deal|limited time|exclusive|off|save|special|marketing|product announcement|survey|feedback|new product|introducing)\b/i;
    private promotionalSenders = /(marketing|newsletter|noreply|no-reply|info|news|updates|promotions|offers)/i;
    private importantInfoPatterns = /\b(status report|policy change|product launch|project update|company announcement|business update|quarterly report|annual report|earnings|financial results|press release|announcement)\b/i;
    private actionVerbs = /\b(submit|respond|confirm|complete|review|approve|verify|update|reply|action required|urgent|important|deadline|due|asap|needed|request|provide|send|fill out|sign|upload|download|forward|attach|delete|mark|discuss|propose|schedule)\b/i;
    private alertPatterns = /\b(alert|notification|warning|security|password|login|access|account|verify|authentication|suspicious|unusual|activity|reset|update required|job posting|job application|interview|career|recruitment|hiring|position|opportunity|system|status change|service announcement)\b/i;
    private strongPromotionalPattern = /\b(unsubscribe|view in browser|email preferences|privacy policy|terms of service)\b/i;

    public async ruleBasedCategorization(emailThread: EmailThread): Promise<CategoryResult> {
        // Extract content from the latest message in the thread
        const latestMessage = emailThread.messages[emailThread.messages.length - 1];
        
        // Ensure content is a string (not a Promise)
        const content = typeof latestMessage.body === 'string' ? latestMessage.body : 
                       typeof latestMessage.snippet === 'string' ? latestMessage.snippet : '';
        const subject = latestMessage.headers?.subject || '';
        
        // Combine subject and content for pattern matching
        const textToAnalyze = `${subject} ${content}`.toLowerCase();
        
        // Calendar-related patterns check
        if (typeof content === 'string' && content.match(this.calendarPatterns) && 
            ((typeof content === 'string' && content.match(this.dateTimePatterns)) || 
             (typeof subject === 'string' && subject.match(this.calendarPatterns)))) {
            return {
                category: "Calendar",
                confidence: 0.9,
                requiresAction: false // Calendar events don't require task creation
            };
        }
        
        // Payment-related patterns check
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.paymentPatterns)) {
            return {
                category: "Payments",
                confidence: 0.85,
                requiresAction: true // Payments usually require action
            };
        }
        
        // Travel-related patterns check
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.travelPatterns)) {
            return {
                category: "Travel",
                confidence: 0.85,
                requiresAction: true
            };
        }
        
        // First check for promotional emails
        if (typeof textToAnalyze === 'string' && (textToAnalyze.match(this.promotionalPatterns) || textToAnalyze.match(this.strongPromotionalPattern))) {
            return {
                category: "Promotions",
                confidence: 0.85,
                requiresAction: false // Promotional emails don't require task creation
            };
        }
        
        // Then check for newsletter subscriptions
        if ((typeof textToAnalyze === 'string' && textToAnalyze.match(this.newsletterPatterns)) || 
            (latestMessage.headers?.from && typeof latestMessage.headers.from === 'string' && 
             latestMessage.headers.from.match(this.promotionalSenders) && 
             !(typeof textToAnalyze === 'string' && textToAnalyze.match(this.promotionalPatterns)))) {
            return {
                category: "Newsletters",
                confidence: 0.8,
                requiresAction: false // Newsletters don't require task creation
            };
        }
        
        // Important business information patterns check
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.importantInfoPatterns)) {
            return {
                category: "Important",
                confidence: 0.85,
                requiresAction: false // Important info typically doesn't require immediate action
            };
        }
        
        // Action-required patterns check
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.actionVerbs)) {
            return {
                category: "Actions",
                confidence: 0.8,
                requiresAction: true
            };
        }
        
        // Alert patterns check
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.alertPatterns)) {
            return {
                category: "Alerts",
                confidence: 0.85,
                requiresAction: true
            };
        }

        // Only return high confidence matches from rule-based system
        // Lower the confidence threshold for ambiguous cases to trigger ML/LLM
        if (typeof textToAnalyze === 'string' && textToAnalyze.match(this.strongPromotionalPattern)) {
            return { category: "Newsletters", confidence: 0.9, requiresAction: false };
        }
        
        // If no clear pattern match, return null category with low confidence
        return {
            category: null,
            confidence: 0.3,
            requiresAction: false
        };
    }
}