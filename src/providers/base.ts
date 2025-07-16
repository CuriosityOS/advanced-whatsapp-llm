import { LLMProvider, LLMMessage, LLMResponse, LLMGenerationOptions, LLMContent } from '../types';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  protected readonly apiKey: string;
  protected readonly baseURL?: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  abstract generateResponse(
    messages: LLMMessage[], 
    options?: LLMGenerationOptions
  ): Promise<LLMResponse>;

  protected validateMessages(messages: LLMMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    for (const message of messages) {
      if (!message.role || message.content === undefined) {
        throw new Error('Each message must have role and content');
      }
      
      if (!['user', 'assistant', 'system'].includes(message.role)) {
        throw new Error('Invalid message role');
      }

      // Validate content structure
      if (typeof message.content !== 'string' && !Array.isArray(message.content)) {
        throw new Error('Message content must be string or array');
      }

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (!block.type || !['text', 'image'].includes(block.type)) {
            throw new Error('Invalid content block type');
          }
        }
      }
    }
  }

  protected buildSystemMessage(systemPrompt?: string): LLMMessage | null {
    if (!systemPrompt) return null;
    
    return {
      role: 'system',
      content: systemPrompt
    };
  }
}