import { BotMessage } from './whatsapp';
import { DatabaseService, RAGService } from '../services';
import { User, Conversation } from '../services/database';
import NodeCache from 'node-cache';

export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
}

export interface ToolContext {
  message: BotMessage;
  user?: User;
  conversation?: Conversation;
  services: {
    database?: DatabaseService;
    rag?: RAGService;
    cache: NodeCache;
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  shouldContinue?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  enabled: boolean;
  category?: string;
  version?: string;
  requiresAuth?: boolean;
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
  execute(params: any, context: ToolContext): Promise<ToolResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
}

export interface ToolCallResult {
  toolCallId: string;
  result: ToolResult;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface LoadedTool {
  tool: Tool;
  filePath: string;
  loadTime: Date;
  lastUsed?: Date;
  usageCount: number;
  errorCount: number;
}

export interface ToolStats {
  totalTools: number;
  enabledTools: number;
  toolCategories: Record<string, number>;
  usage: Record<string, number>;
  errors: Record<string, number>;
}