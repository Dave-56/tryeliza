import { LLMService } from '../LLMService.js';
import { getTaskExtractionPrompt, getDraftGenerationPrompt, newTaskExtractionPrompt} from '../../utils/prompts.js';
import { SummarizationResponse, EmailThread } from '../../Types/model';
import { validateThreadSummary } from '../../utils/utils.js';

export class AgentService {
    private llmService: LLMService;

    constructor() {
        this.llmService = LLMService.getInstance();
    }

    async extractTaskFromEmail(emailThread: EmailThread, recipient: string, userId?: string) {
        try {
            // Validate input parameters
            if (!emailThread || !emailThread.messages || emailThread.messages.length === 0) {
                console.warn('Invalid email thread provided to extractTaskFromEmail');
                return {
                    requires_action: false,
                    confidence_score: 0,
                    reason: "Could not process email due to missing thread data",
                    category: "Notifications" // Default category for invalid emails
                };
            }

            // Ensure all messages have headers
            const validMessages = emailThread.messages.filter(msg => 
                msg && msg.headers && msg.headers.date && msg.headers.from && msg.headers.to
            );

            if (validMessages.length === 0) {
                console.warn('No valid messages with complete headers found in thread');
                return {
                    requires_action: false,
                    confidence_score: 0,
                    reason: "Could not process email due to missing message headers",
                    category: "Notifications" // Default category for invalid emails
                };
            }

            const prompt = newTaskExtractionPrompt({
                thread: validMessages
                .sort((a, b) => new Date(a.headers.date).getTime() - new Date(b.headers.date).getTime())
                .map(msg => ({
                    messageId: msg.id,
                    subject: msg.headers.subject || 'No Subject',
                    content: msg.body || '',
                    date: msg.headers.date,
                    from: msg.headers.from,
                    to: msg.headers.to
                })),
                currentTimestamp: new Date().toISOString(),
                recipient: recipient || 'user'
            });

            const response = await this.llmService.generateResponse(
                prompt, 
                'taskExtraction', 
                'task_extraction',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );
            
            // Map business_category to category if it exists
            if (response.requires_action && response.task && response.task.business_category) {
                // Map business categories to our email categories
                const categoryMap = {
                    "Revenue-Generating": "Important Info",
                    "Operational": "Important Info",
                    "Relationship-Building": "Important Info",
                    "Compliance": "Important Info",
                    "Other": "Notifications"
                };
                
                // Set the category based on the business_category mapping or default to "Notifications"
                response.category = categoryMap[response.task.business_category] || "Notifications";
            } else {
                // Default category for non-action emails
                response.category = "Notifications";
            }
            
            return response;
        } catch (error) {
            console.error('Error in extractTaskFromEmail:', error);
            return {
                requires_action: false,
                confidence_score: 0,
                reason: "Error processing email: " + (error.message || "Unknown error"),
                category: "Notifications" // Default category for error cases
            };
        }
    }

    async generateDraft(emailThread: EmailThread, recipient: string, senderName?: string, userId?: string) {
        const prompt = getDraftGenerationPrompt({
            thread: emailThread.messages,
            recipient: recipient,
            senderName: senderName
        });

        try {
            const response = await this.llmService.generateResponse(
                prompt, 
                'draftGeneration', 
                'draft_generation',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );
            
            // Validate response format
            if (!response || !response.subject || !response.body || !response.to) {
                console.warn('Invalid draft response format:', response);
                return null;
            }

            return {
                subject: response.subject,
                body: response.body,
                to: response.to,
                cc: response.cc || [] // Ensure cc is always an array
            };
        } catch (error) {
            console.error('Error generating draft:', error);
            return null;
        }
    }

    async summarizeThreads(prompt: string, userId?: string): Promise<SummarizationResponse> {
        try {
            const response = await this.llmService.generateResponse(
                prompt, 
                'summary', 
                'summary',
                undefined, // use default maxRetries
                userId,    // pass userId for database logging
                undefined  // don't pass email ID until we have a valid one
            );
            // Validate and sanitize the response to ensure it matches our expected format
            return validateThreadSummary(response);
        } catch (error) {
            console.error('Error in thread summarization:', error);
            console.error('Error in thread summarization:', error);
            throw new Error('Failed to summarize threads');
        }
    }
}