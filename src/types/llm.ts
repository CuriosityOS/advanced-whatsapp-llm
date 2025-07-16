export interface LLMImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface LLMTextContent {
  type: 'text';
  text: string;
}

export type LLMContent = string | (LLMTextContent | LLMImageContent)[];

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: LLMContent;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: any;
  }>;
}

export interface LLMProvider {
  name: string;
  generateResponse(messages: LLMMessage[], options?: LLMGenerationOptions): Promise<LLMResponse>;
}

export interface LLMGenerationOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  systemPrompt?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  toolChoice?: 'auto' | 'none' | string;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openrouter';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  baseURL?: string;
}