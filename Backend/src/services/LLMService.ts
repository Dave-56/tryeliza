import { db } from '../db'; // Import your database connection
import { llmInteractions } from '../db/schema'; // Import your table schema
import { LLMConfig, LLMMessage, LLMProvider } from '../Types/model';

// Define provider types - this could also be moved to Types/model.ts
type LLMProviderType = 'openai' | 'ollama'; // Match the LLMConfig provider type
import { OpenAIProvider } from './LLM/OpenAIProvider';

import { isProduction } from '../config/environment';
import { cleanAndParseJSON } from '../utils/utils';
import * as fs from 'fs';

// Factory for creating LLM providers
class LLMProviderFactory {
  static createProvider(providerType: LLMProviderType, model: string): LLMProvider {
    switch (providerType) {
      case 'openai':
        return new OpenAIProvider();
      case 'ollama':
        // TODO: Implement OllamaProvider
        console.warn('OllamaProvider not yet implemented, falling back to OpenAI');
        return new OpenAIProvider();
      // Add new provider cases here when needed
      // case 'anthropic':
      //   return new AnthropicProvider();
      default:
        throw new Error(`Unsupported LLM provider: ${providerType}`);
    }
  }
}

export class LLMService {
  private provider: LLMProvider;
  private config: LLMConfig;
  private static instance: LLMService;

  private constructor() {
    this.config = {
      provider: 'openai',
      model: 'gpt-4o',
      maxRetries: 3,
      timeout: 30000,
    };
    this.provider = LLMProviderFactory.createProvider(this.config.provider, this.config.model);
  }

  static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  async generateResponse(prompt: string, responseType: string = 'generic', processingType: string, maxRetries = this.config.maxRetries, userId?: string, emailId?: string | null, emailIdForProcessed?: string | null): Promise<any> {

    // Choose the appropriate system message based on responseType
    let systemContent = '';

    switch(responseType) {
      case 'summary':
        systemContent = `You are a helpful assistant that always responds with valid JSON.
          Your response must be a properly formatted JSON object with key_highlights and category_name fields.`;
        break;
      case 'categorization':
        systemContent = `You are an AI assistant specialized in email intelligence.
          Your response must be a valid JSON object with a 'categories' array.
          Each category must have 'name' and 'threads' fields.
          Category names must be one of: Important Info, Calendar, Payments, Travel, Newsletters, or Notifications.
          Each thread must have id, subject, and messages array.`;
        break;
      case 'taskExtraction':
        systemContent = `You are a helpful assistant that always responds with valid JSON.
          Your response must be a properly formatted JSON object with 'requires_action', 'confidence_score', and 'reason' fields.
          If requires_action is true, also include 'task' with title, description, priority, and due_date fields.`;
        break;
      case 'draftGeneration':
        systemContent = `You are a helpful assistant that always responds with valid JSON.
          Your response must be a properly formatted JSON object with 'subject', 'body', 'to', and optional 'cc' fields.`;
        break;
      default:
        systemContent = `You are a helpful assistant that always responds with valid JSON.
          Ensure your response is properly formatted and can be parsed with JSON.parse().`;
    }

    // Add the common JSON formatting rules
    systemContent += `\n\nCRITICAL JSON FORMATTING RULES:
    1. Your response MUST be valid JSON that can be parsed with JSON.parse()
    2. DO NOT include any text, explanations, or markdown formatting outside the JSON structure
    3. Ensure all string values are properly escaped with double quotes
    4. DO NOT use single quotes for JSON properties or values
    5. DO NOT use trailing commas in arrays or objects
    6. ALWAYS COMPLETE ALL STRINGS - every string that starts with a quote MUST end with a quote
    7. NEVER leave any string unterminated - this is the most common error
    8. Keep all string values concise to avoid parsing issues
    9. If a string contains quotes, properly escape them with backslash: \\"
    10. DO NOT include any special characters or line breaks within JSON strings without proper escaping
    11. Test your JSON mentally before returning it - every { must have a matching }, every [ must have a matching ], and every " must have a matching "
    12. CRITICAL: Keep all descriptions under 100 characters to avoid unterminated strings
    13. CRITICAL: Avoid using quotes within your text descriptions unless absolutely necessary
    14. CRITICAL: Do not use newlines or special characters in any string values`;

    // Create the system message
    const systemMessage: LLMMessage = {
      role: 'system',
      content: systemContent
    };

    let attempt = 0;
    
    while (attempt <= maxRetries) {
      try {
        // Create a user message with the prompt
        const userMessage: LLMMessage = {
          role: 'user',
          content: prompt
        };
        
        // Combine messages
        const messages: LLMMessage[] = [systemMessage, userMessage];
        
        // Generate response
        const response = await this.provider.generateResponse(messages, {
          temperature: 0.2,
          max_tokens: 800,
          timeout: this.config.timeout
        });
        
        // Extract JSON content
        let content = response.content;
        
        // Remove any markdown formatting
        content = content.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        
        // Log the raw content for debugging (truncated for readability)
        // console.log("Raw LLM response:", content.length > 200 ? 
        //   `${content.substring(0, 200)}... (${content.length} chars total)` : content);
        
        if(userId) {
          try {
            const startTime = Date.now();

            // Parse response
            const parsedResponse = await cleanAndParseJSON(content);
            const latencyMs = Date.now() - startTime;
            
            // Save to database
            await db.insert(llmInteractions).values({
              user_id: userId,
              email_id: emailId ? emailId : null,
              email_id_for_processed: emailIdForProcessed ? emailIdForProcessed : null,
              user_id_for_processed: userId || null,
              interaction_type: processingType,
              prompt: prompt,
              response: parsedResponse,
              model: this.config.model,
              temperature: 0.2 as any, // Cast to any to handle numeric type
              tokens_used: response.usage?.total_tokens ? Number(response.usage.total_tokens) : null,
              latency_ms: Number(latencyMs) || 0,
              success: true,
              error_message: null,
              created_at: new Date(),
              updated_at: new Date()
            });
            console.log(`Logged LLM interaction to database for user ${userId}`);
          } catch (error) {
            console.error("Error saving LLM response to database:", error);
            // If database save fails, still return the parsed response
            return cleanAndParseJSON(content);
          }
        }
        
        // Use the cleanAndParseJSON utility for consistent handling
        try {
          return cleanAndParseJSON(content);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          
          // If cleanAndParseJSON fails, try a more aggressive recovery approach
          if (parseError instanceof SyntaxError && parseError.message.includes("Unterminated string") && responseType === 'summary') {
            console.log("Detected unterminated string in summary, attempting additional recovery...");
            
            // Try to extract just complete summaries using a more forgiving regex
            const summaryRegex = /"category"\s*:\s*"([^"]*)"\s*,\s*"title"\s*:\s*"([^"]*)"\s*,\s*"description"\s*:\s*"([^"]*)"\s*,\s*"messageId"\s*:\s*"([^"]*)"\s*,\s*"priority"\s*:\s*"([^"]*)"\s*,\s*"timeframe"\s*:\s*"([^"]*)"\s*,\s*"confidence"\s*:\s*([\d\.]+)/g;
            
            const matches = [...content.matchAll(summaryRegex)];
            
            if (matches.length > 0) {
              // Reconstruct a valid JSON with complete summaries only
              const validSummaries = matches.map(match => {
                return {
                  category: match[1],
                  title: match[2],
                  description: match[3],
                  messageId: match[4],
                  priority: match[5],
                  timeframe: match[6],
                  confidence: parseFloat(match[7])
                };
              });
              
              console.log(`Extracted ${validSummaries.length} complete summaries using fallback method`);
              return { summaries: validSummaries };
            }
          }
          
          // If all recovery methods fail, rethrow the error to trigger a retry
          throw parseError;
        }
      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt > maxRetries) {
          // Instead of throwing, return a default empty structure based on responseType
          console.warn(`Failed to generate response after ${maxRetries} attempts, returning default structure`);
          
          switch(responseType) {
            case 'summary':
              return { summaries: [] };
            case 'taskExtraction':
              return { 
                requires_action: false, 
                confidence_score: 0, 
                reason: "Failed to process due to technical error" 
              };
            case 'draftGeneration':
              return { 
                subject: "", 
                body: "", 
                to: "" 
              };
            case 'categorization':
              return { categories: [] };
            default:
              return {};
          }
        }
        
        // Exponential backoff before retry
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
    
    // This should never be reached due to the return in the if (attempt > maxRetries) block,
    // but TypeScript may complain about missing return, so we add this as a safety net
    return {};
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  // Methods to change provider configuration
  async setProvider(providerType: LLMProviderType, model: string): Promise<void> {
    if (isProduction && this.config.provider !== providerType) {
      console.warn('Changing provider in production environment');
    }

    this.config.provider = providerType;
    this.config.model = model;
    this.provider = LLMProviderFactory.createProvider(providerType, model);
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  // Only for development/testing
  async switchProvider(providerType: 'openai' | 'ollama'): Promise<void> {
    if (!isProduction) {
      this.config.provider = providerType;
      this.provider = LLMProviderFactory.createProvider(providerType, this.config.model);
    }
  }
}