import OpenAI from 'openai';
import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '../../Types/model';

export class OpenAIProvider implements LLMProvider {
    private client: OpenAI;
    private model: string;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            console.error('WARNING: OpenAI API key not configured in environment variables');
            console.error('Available environment variables:', Object.keys(process.env));
            throw new Error('OpenAI API key not configured');
        }

        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // You can change this to any OpenAI model like 'gpt-4-turbo-preview' or 'gpt-3.5-turbo'
        this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    }

    async generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages,
                temperature: options?.temperature ?? 0.2,
                max_tokens: options?.max_tokens ?? 800,
            });

            return {
                content: response.choices[0].message?.content || '',
                usage: {
                    prompt_tokens: response.usage?.prompt_tokens,
                    completion_tokens: response.usage?.completion_tokens,
                    total_tokens: response.usage?.total_tokens,
                }
            };
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.generateResponse([{ role: 'user', content: 'test' }]);
            return true;
        } catch (error) {
            console.error('OpenAI availability check failed:', error);
            return false;
        }
    }
}