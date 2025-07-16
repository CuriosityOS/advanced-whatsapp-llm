import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';
import { LLMMessage, LLMResponse, LLMGenerationOptions, LLMContent } from '../types';

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private readonly defaultModel = 'claude-sonnet-4-20250514';
  private readonly defaultMaxTokens = 1000;
  private readonly defaultTemperature = 0.7;

  constructor(apiKey: string) {
    super(apiKey);
    this.client = new Anthropic({
      apiKey: this.apiKey,
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
      const anthropicMessages = this.convertMessages(messages, systemPrompt);
      
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: anthropicMessages.messages,
        ...(anthropicMessages.system && { system: anthropicMessages.system })
      });

      return this.parseResponse(response);
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertMessages(messages: LLMMessage[], systemPrompt?: string): {
    messages: Array<{ role: 'user' | 'assistant'; content: any }>;
    system?: string;
  } {
    const systemMessage = this.buildSystemMessage(systemPrompt);
    let systemContent = systemMessage?.content;

    const convertedMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: this.convertContent(msg.content)
      }));

    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length > 0 && !systemContent && systemMessages[0]) {
      systemContent = typeof systemMessages[0].content === 'string' 
        ? systemMessages[0].content 
        : JSON.stringify(systemMessages[0].content);
    }

    const result: any = {
      messages: convertedMessages
    };

    if (systemContent) {
      result.system = systemContent;
    }

    return result;
  }

  private convertContent(content: LLMContent): any {
    if (typeof content === 'string') {
      return content;
    }
    
    // Handle multimodal content (array of text and image blocks)
    return content.map(block => {
      if (block.type === 'text') {
        return {
          type: 'text',
          text: block.text
        };
      } else if (block.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.source.media_type,
            data: block.source.data
          }
        };
      }
      return block;
    });
  }

  private parseResponse(response: Anthropic.Messages.Message): LLMResponse {
    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }
}