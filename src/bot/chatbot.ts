import { EventEmitter } from 'events';
import { WhatsAppService, DatabaseService, EmbeddingsService, VectorService, RAGService } from '../services';
import { LLMProvider, BotMessage, BotResponse, MessageMiddleware, LLMMessage } from '../types';
import { createClient } from '@supabase/supabase-js';
import NodeCache from 'node-cache';

export interface ChatbotConfig {
  llmProvider: LLMProvider;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  enableLogging?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  supabase?: {
    url: string;
    anonKey: string;
  };
  openaiApiKey?: string;
  enableRAG?: boolean;
  enableVision?: boolean;
  enablePDF?: boolean;
  cacheConfig?: {
    ttlSeconds?: number;
    maxKeys?: number;
  };
}

export class Chatbot extends EventEmitter {
  private whatsapp: WhatsAppService;
  private llmProvider: LLMProvider;
  private config: ChatbotConfig;
  private conversationHistory: Map<string, LLMMessage[]> = new Map();
  private rateLimitMap: Map<string, number[]> = new Map();
  
  // New services
  private databaseService?: DatabaseService;
  private embeddingsService?: EmbeddingsService;
  private vectorService?: VectorService;
  private ragService?: RAGService;
  private cache: NodeCache;

  constructor(whatsapp: WhatsAppService, config: ChatbotConfig) {
    super();
    this.whatsapp = whatsapp;
    this.llmProvider = config.llmProvider;
    this.config = config;

    // Initialize cache
    this.cache = new NodeCache({
      stdTTL: config.cacheConfig?.ttlSeconds || 3600, // 1 hour default
      maxKeys: config.cacheConfig?.maxKeys || 1000
    });

    this.initializeServices();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize database and vector services if Supabase config is provided
      if (this.config.supabase) {
        const supabase = createClient(
          this.config.supabase.url,
          this.config.supabase.anonKey
        );

        this.databaseService = new DatabaseService(
          this.config.supabase.url,
          this.config.supabase.anonKey
        );

        // Initialize embeddings service if OpenAI API key is provided
        if (this.config.openaiApiKey) {
          this.embeddingsService = new EmbeddingsService(this.config.openaiApiKey);
          this.vectorService = new VectorService(supabase, this.embeddingsService);
          
          // Initialize RAG service
          this.ragService = new RAGService(
            this.vectorService,
            this.embeddingsService,
            this.llmProvider
          );
        }
      }

      console.log('🔧 Services initialized:', {
        database: !!this.databaseService,
        embeddings: !!this.embeddingsService,
        vector: !!this.vectorService,
        rag: !!this.ragService,
        vision: this.config.enableVision !== false,
        pdf: this.config.enablePDF !== false
      });

    } catch (error) {
      console.error('❌ Service initialization error:', error);
      // Continue without advanced features if initialization fails
    }
  }

  private setupMiddleware(): void {
    const chatMiddleware: MessageMiddleware = async (message, next) => {
      try {
        if (!this.shouldProcessMessage(message)) {
          return await next();
        }

        // Rate limiting removed for unrestricted usage

        // Use RAG for enhanced responses if available
        const response = this.ragService && this.config.enableRAG !== false
          ? await this.generateRAGResponse(message)
          : await this.generateResponse(message);
        
        if (response) {
          this.updateConversationHistory(message.from, message.content, response.content);
          this.logInteraction(message, response);

          // Store interaction in database if available
          if (this.databaseService) {
            await this.storeInteraction(message, response).catch(err => 
              console.error('Database storage error:', err)
            );
          }
        }

        return response;
      } catch (error) {
        console.error('Error in chat middleware:', error);
        return {
          content: '🚨 Sorry, I encountered an error processing your message. Please try again.',
        };
      }
    };

    this.whatsapp.addMiddleware(chatMiddleware);
  }

  private setupEventHandlers(): void {
    this.whatsapp.on('ready', () => {
      console.log('🤖 Chatbot is ready to receive messages');
      this.emit('ready');
    });

    this.whatsapp.on('error', (error) => {
      console.error('WhatsApp error:', error);
      this.emit('error', error);
    });
  }

  private shouldProcessMessage(message: BotMessage): boolean {
    if (message.content.trim().length === 0) {
      return false;
    }

    if (message.content.startsWith('/')) {
      return false;
    }

    return true;
  }

  private isRateLimited(userId: string): boolean {
    if (!this.config.rateLimit) return false;

    const now = Date.now();
    const userRequests = this.rateLimitMap.get(userId) || [];
    
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.config.rateLimit!.windowMs
    );

    if (validRequests.length >= this.config.rateLimit.maxRequests) {
      return true;
    }

    validRequests.push(now);
    this.rateLimitMap.set(userId, validRequests);
    return false;
  }

  private async generateResponse(message: BotMessage): Promise<BotResponse | null> {
    try {
      const conversation = this.getConversationHistory(message.from);
      const messages: LLMMessage[] = [
        ...conversation,
        {
          role: 'user',
          content: this.prepareMessageContent(message)
        }
      ];

      const options: any = {
        maxTokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7
      };

      if (this.config.systemPrompt) {
        options.systemPrompt = this.config.systemPrompt;
      }

      const llmResponse = await this.llmProvider.generateResponse(messages, options);

      return {
        content: llmResponse.content,
        quotedMessage: message.id
      };

    } catch (error) {
      console.error('Error generating LLM response:', error);
      return {
        content: '🤔 I need a moment to think. Please try again.',
      };
    }
  }

  private async generateRAGResponse(message: BotMessage): Promise<BotResponse | null> {
    try {
      if (!this.ragService) {
        return await this.generateResponse(message);
      }

      const conversation = this.getConversationHistory(message.from);
      const result = await this.ragService.handleMultimodalMessage(
        message,
        message.from,
        conversation
      );

      let responseContent = result.response;

      // Add context information if available
      if (result.ragContext && result.ragContext.relevantContent.length > 0) {
        responseContent += `\n\n📚 *Sources used:* ${result.ragContext.totalSources} documents found in ${result.ragContext.searchTime}ms`;
      }

      return {
        content: responseContent,
        quotedMessage: message.id
      };

    } catch (error) {
      console.error('Error generating RAG response:', error);
      return {
        content: '🤔 I encountered an issue processing your request. Please try again.',
      };
    }
  }

  private prepareMessageContent(message: BotMessage): string | any[] {
    // Handle multimodal content (images + text)
    if (message.hasMedia && message.media && this.config.enableVision !== false) {
      const { VisionService } = require('../services/vision');
      
      if (message.media.type === 'image' && VisionService.isImageSupported(message.media.mimetype || '')) {
        return VisionService.createMultimodalContent(message.content, message.media);
      }
    }

    return message.content;
  }

  private async storeInteraction(message: BotMessage, response: BotResponse): Promise<void> {
    if (!this.databaseService) return;

    try {
      // Store user message
      const { user, conversation, message: storedMessage } = await this.databaseService.saveUserMessage(message);

      // Store bot response
      await this.databaseService.saveBotResponse(
        conversation.id,
        `${message.id}_response`,
        response.content,
        { content: response.content }, // LLMResponse placeholder
        this.llmProvider.name,
        'claude-sonnet-4-20250514',
        0 // response time placeholder
      );

    } catch (error) {
      console.error('Error storing interaction:', error);
    }
  }

  private getConversationHistory(userId: string): LLMMessage[] {
    const history = this.conversationHistory.get(userId) || [];
    
    const maxHistoryLength = 10;
    if (history.length > maxHistoryLength) {
      return history.slice(-maxHistoryLength);
    }
    
    return history;
  }

  private updateConversationHistory(userId: string, userMessage: string, botResponse: string): void {
    const history = this.conversationHistory.get(userId) || [];
    
    history.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: botResponse }
    );

    const maxHistoryLength = 20;
    if (history.length > maxHistoryLength) {
      history.splice(0, history.length - maxHistoryLength);
    }

    this.conversationHistory.set(userId, history);
  }

  private logInteraction(message: BotMessage, response: BotResponse): void {
    if (!this.config.enableLogging) return;

    console.log(`
📱 Message from ${message.senderName} (${message.from}):
   "${message.content}"
🤖 Bot response:
   "${response.content}"
---`);
  }

  async start(): Promise<void> {
    await this.whatsapp.start();
  }

  async stop(): Promise<void> {
    await this.whatsapp.stop();
  }

  clearConversationHistory(userId?: string): void {
    if (userId) {
      this.conversationHistory.delete(userId);
    } else {
      this.conversationHistory.clear();
    }
  }

  updateLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    console.log(`🔄 LLM provider switched to: ${provider.name}`);
  }

  getStats(): {
    activeConversations: number;
    totalMessages: number;
    provider: string;
    features: {
      rag: boolean;
      vision: boolean;
      pdf: boolean;
      database: boolean;
      cache: boolean;
    };
    cache: {
      keys: number;
      hits: number;
      misses: number;
    };
  } {
    const totalMessages = Array.from(this.conversationHistory.values())
      .reduce((sum, history) => sum + history.length, 0);

    return {
      activeConversations: this.conversationHistory.size,
      totalMessages,
      provider: this.llmProvider.name,
      features: {
        rag: !!this.ragService,
        vision: this.config.enableVision !== false,
        pdf: this.config.enablePDF !== false,
        database: !!this.databaseService,
        cache: true
      },
      cache: {
        keys: this.cache.keys().length,
        hits: this.cache.getStats().hits,
        misses: this.cache.getStats().misses
      }
    };
  }

  async getAdvancedStats() {
    if (!this.vectorService) {
      return null;
    }

    try {
      const storageStats = await this.vectorService.getStorageStats();
      return {
        ...storageStats,
        embeddingsHealth: this.embeddingsService ? await this.embeddingsService.isServiceHealthy() : false
      };
    } catch (error) {
      console.error('Error getting advanced stats:', error);
      return null;
    }
  }

  // Add knowledge to the RAG system
  async addKnowledge(title: string, content: string, source?: string, tags: string[] = []): Promise<boolean> {
    if (!this.ragService) {
      console.warn('RAG service not available');
      return false;
    }

    try {
      await this.ragService.addKnowledgeBaseEntry(title, content, source, tags);
      return true;
    } catch (error) {
      console.error('Error adding knowledge:', error);
      return false;
    }
  }

  // Clear cache
  clearCache(): void {
    this.cache.flushAll();
    console.log('🧹 Cache cleared');
  }

  // Get cache entry
  getCached(key: string): any {
    return this.cache.get(key);
  }

  // Set cache entry
  setCache(key: string, value: any, ttl?: number): void {
    if (ttl !== undefined) {
      this.cache.set(key, value, ttl);
    } else {
      this.cache.set(key, value);
    }
  }
}