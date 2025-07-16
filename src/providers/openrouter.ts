import axios, { AxiosInstance } from 'axios';
import { BaseLLMProvider } from './base';
import { LLMMessage, LLMResponse, LLMGenerationOptions } from '../types';

export class OpenRouterProvider extends BaseLLMProvider {
  readonly name = 'openrouter';
  private client: AxiosInstance;
  private readonly defaultModel = 'anthropic/claude-3.5-sonnet';
  private readonly defaultMaxTokens = 1000;
  private readonly defaultTemperature = 0.7;

  constructor(apiKey: string, baseURL = 'https://openrouter.ai/api/v1') {
    super(apiKey, baseURL);
    this.client = axios.create({
      baseURL: baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/neshauto/whatsapp-bot',
        'X-Title': 'WhatsApp Chatbot',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
  }

  async generateResponse(
    messages: LLMMessage[], 
    options: LLMGenerationOptions = {}
  ): Promise<LLMResponse> {
    this.validateMessages(messages);

    const {
      maxTokens = this.defaultMaxTokens,
      temperature = this.defaultTemperature,
      model = this.defaultModel,
      systemPrompt
    } = options;

    try {
      const openRouterMessages = this.convertMessages(messages, systemPrompt);
      
      const response = await this.client.post('/chat/completions', {
        model,
        messages: openRouterMessages,
        max_tokens: maxTokens,
        temperature,
        stream: false
      });

      return this.parseResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || error.message;
        throw new Error(`OpenRouter API error: ${message}`);
      }
      throw new Error(`OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertMessages(messages: LLMMessage[], systemPrompt?: string): Array<{ role: string; content: string }> {
    const systemMessage = this.buildSystemMessage(systemPrompt);
    const convertedMessages: Array<{ role: string; content: string }> = [];

    if (systemMessage) {
      convertedMessages.push({
        role: systemMessage.role,
        content: typeof systemMessage.content === 'string' ? systemMessage.content : JSON.stringify(systemMessage.content)
      });
    }

    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length > 0 && !systemMessage) {
      systemMessages.forEach(msg => {
        convertedMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      });
    }

    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    nonSystemMessages.forEach(msg => {
      convertedMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    });

    return convertedMessages;
  }

  private parseResponse(response: any): LLMResponse {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choices returned from OpenRouter');
    }

    const content = choice.message?.content || '';
    const usage = response.usage;

    const result: LLMResponse = {
      content
    };

    if (usage) {
      result.usage = {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      };
    }

    return result;
  }
}