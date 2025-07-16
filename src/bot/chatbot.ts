import { EventEmitter } from 'events';
import { WhatsAppService, DatabaseService, EmbeddingsService, VectorService, RAGService, MCPService, createDefaultMCPConfig } from '../services';
import { LLMProvider, BotMessage, BotResponse, MessageMiddleware, LLMMessage, ToolCall, ToolContext } from '../types';
import { createClient } from '@supabase/supabase-js';
import NodeCache from 'node-cache';
import { ToolManager } from '../tools';

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
  enableMCP?: boolean;
  mcpServers?: Array<{
    name: string;
    command: string;
    args: string[];
    enabled: boolean;
  }>;
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
  private mcpService?: MCPService;
  private cache: NodeCache;
  private toolManager: ToolManager;

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

    // Initialize ToolManager
    this.toolManager = new ToolManager();

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

      // Initialize ToolManager
      await this.toolManager.initialize();

      // Initialize MCP service if enabled
      if (this.config.enableMCP !== false) {
        try {
          const mcpConfig = createDefaultMCPConfig();
          if (this.config.mcpServers) {
            mcpConfig.servers = this.config.mcpServers;
          }
          this.mcpService = new MCPService(mcpConfig);
          await this.mcpService.initialize();
        } catch (error) {
          console.error('❌ MCP service initialization error:', error);
        }
      }

      console.log('🔧 Services initialized:', {
        database: !!this.databaseService,
        embeddings: !!this.embeddingsService,
        vector: !!this.vectorService,
        rag: !!this.ragService,
        mcp: !!this.mcpService,
        tools: this.toolManager.getAvailableTools().length,
        mcpTools: this.mcpService ? this.mcpService.getAvailableTools().length : 0,
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

        // Check for tool-related queries
        if (this.isToolQuery(message.content)) {
          return await this.handleToolQuery(message);
        }
        
        // Smart routing: Use tools for tool-relevant queries, RAG for knowledge queries
        const response = await this.generateSmartResponse(message);
        
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

      const localTools = this.toolManager.getAvailableTools();
      const mcpTools = this.mcpService ? this.mcpService.getAvailableTools() : [];
      const availableTools = [...localTools, ...mcpTools];
      
      console.log(`🔧 Debug: Available tools count: ${availableTools.length}`);
      console.log(`🔧 Debug: Tool names: ${availableTools.map(t => t.name).join(', ')}`);
      
      const options: any = {
        maxTokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
        tools: availableTools
      };

      // Always use dynamic system prompt generation
      const dynamicPrompt = this.generateDynamicSystemPrompt(availableTools);
      options.systemPrompt = dynamicPrompt;
      console.log(`🔧 Debug: Using dynamic system prompt with ${availableTools.length} tools`);
      console.log(`🔧 Debug: System prompt preview: ${dynamicPrompt.substring(0, 200)}...`);

      let llmResponse = await this.llmProvider.generateResponse(messages, options);

      console.log(`🔧 Debug: LLM Response received. Tool calls: ${llmResponse.toolCalls ? llmResponse.toolCalls.length : 0}`);
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        console.log(`🔧 Debug: Tool calls detected:`, llmResponse.toolCalls.map(tc => tc.name));
      }

      // Handle tool calls if present
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(llmResponse.toolCalls, message);
        
        // Add tool results to conversation and get final response
        const updatedMessages = [
          ...messages,
          {
            role: 'assistant' as const,
            content: llmResponse.content || 'I\'ll help you with that.'
          },
          ...toolResults.map(result => ({
            role: 'user' as const,
            content: `Tool result: ${JSON.stringify((result as any)?.result || 'Error')}`
          }))
        ];

        // Get final response from LLM with tool results
        llmResponse = await this.llmProvider.generateResponse(updatedMessages, {
          ...options,
          tools: [] // Don't use tools in the follow-up call
        });
        
        console.log(`🔧 Debug: Final response after tool execution:`, llmResponse.content.substring(0, 100));
      }

      // Add tool usage indicator if tools were used
      let finalContent = llmResponse.content;
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolNames = llmResponse.toolCalls.map(tc => tc.name);
        const uniqueTools = [...new Set(toolNames)];
        const toolCounts = toolNames.reduce((acc, name) => {
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const toolSummary = uniqueTools.map(name => 
          (toolCounts[name] || 0) > 1 ? `${name} (${toolCounts[name]}x)` : name
        ).join(', ');
        
        const executionMode = llmResponse.toolCalls.length > 1 ? 'parallel' : 'single';
        finalContent = `🔧 *Used tools (${executionMode}): ${toolSummary}*\n\n${finalContent}`;
      }
      
      return {
        content: finalContent,
        quotedMessage: message.id
      };

    } catch (error) {
      console.error('Error generating LLM response:', error);
      return {
        content: '🤔 I need a moment to think. Please try again.',
      };
    }
  }

  private async executeToolCalls(toolCalls: Array<{ id: string; name: string; parameters: any }>, message: BotMessage) {
    const toolContext: ToolContext = {
      message,
      services: {
        ...(this.databaseService && { database: this.databaseService }),
        ...(this.ragService && { rag: this.ragService }),
        cache: this.cache
      }
    };

    // Get user and conversation data if database is available
    if (this.databaseService) {
      try {
        const { user, conversation } = await this.databaseService.saveUserMessage(message);
        toolContext.user = user;
        toolContext.conversation = conversation;
      } catch (error) {
        console.warn('Could not get user/conversation for tool context:', error);
      }
    }

    // Execute all tools in parallel
    console.log(`🔧 Executing ${toolCalls.length} tools in parallel:`, toolCalls.map(tc => tc.name));
    const startTime = Date.now();

    const toolPromises = toolCalls.map(async (toolCall) => {
      const toolStartTime = Date.now();
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool ${toolCall.name} timed out after 30 seconds`));
        }, 30000); // 30 second timeout
      });
      
      const executionPromise = (async () => {
        try {
          let result;
          
          // Check if it's a local tool or MCP tool
          const localTool = this.toolManager.getTool(toolCall.name);
          if (localTool) {
            // Execute local tool
            result = await this.toolManager.executeTool(toolCall, toolContext);
          } else if (this.mcpService) {
            // Execute MCP tool
            const mcpResult = await this.mcpService.executeTool(toolCall.name, toolCall.parameters, toolContext);
            result = {
              toolCallId: toolCall.id,
              result: mcpResult
            };
          } else {
            throw new Error(`Tool '${toolCall.name}' not found`);
          }
          
          const toolEndTime = Date.now();
          const toolExecutionTime = toolEndTime - toolStartTime;
          
          console.log(`🔧 Tool ${toolCall.name} executed in ${toolExecutionTime}ms:`, result.result.success ? '✅ Success' : '❌ Failed');
          return result;
          
        } catch (error) {
          const toolEndTime = Date.now();
          const toolExecutionTime = toolEndTime - toolStartTime;
          
          console.error(`❌ Error executing tool ${toolCall.name} in ${toolExecutionTime}ms:`, error);
          return {
            toolCallId: toolCall.id,
            result: {
              success: false,
              error: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          };
        }
      })();
      
      // Race between execution and timeout
      return Promise.race([executionPromise, timeoutPromise]);
    });

    // Wait for all tools to complete
    const results = await Promise.all(toolPromises);
    const totalExecutionTime = Date.now() - startTime;
    
    console.log(`🔧 All ${toolCalls.length} tools completed in ${totalExecutionTime}ms (parallel execution)`);
    
    return results;
  }

  private async generateRAGResponse(message: BotMessage): Promise<BotResponse | null> {
    try {
      if (!this.ragService) {
        return await this.generateResponse(message);
      }

      // Check if the query might need tools even within RAG context
      if (this.needsToolSupport(message.content)) {
        console.log(`🔧 RAG query with tool support needed: ${message.content.substring(0, 50)}...`);
        return await this.generateHybridResponse(message);
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

  private async generateHybridResponse(message: BotMessage): Promise<BotResponse | null> {
    try {
      console.log(`🔧 Generating hybrid response (RAG + Tools) for: ${message.content.substring(0, 50)}...`);
      
      const conversation = this.getConversationHistory(message.from);
      const messages: LLMMessage[] = [
        ...conversation,
        {
          role: 'user',
          content: this.prepareMessageContent(message)
        }
      ];

      const localTools = this.toolManager.getAvailableTools();
      const mcpTools = this.mcpService ? this.mcpService.getAvailableTools() : [];
      const availableTools = [...localTools, ...mcpTools];
      
      console.log(`🔧 Hybrid mode - Available tools: ${availableTools.length}`);
      
      const options: any = {
        maxTokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
        tools: availableTools
      };

      // Use dynamic system prompt with both RAG and tool instructions
      const dynamicPrompt = this.generateDynamicSystemPrompt(availableTools);
      options.systemPrompt = dynamicPrompt;

      let llmResponse = await this.llmProvider.generateResponse(messages, options);

      // Handle tool calls if present
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(llmResponse.toolCalls, message);
        
        // Add tool results to conversation and get final response
        const updatedMessages = [
          ...messages,
          {
            role: 'assistant' as const,
            content: llmResponse.content || 'I\'ll help you with that.'
          },
          ...toolResults.map(result => ({
            role: 'user' as const,
            content: `Tool result: ${JSON.stringify((result as any)?.result || 'Error')}`
          }))
        ];

        // Get final response from LLM with tool results
        llmResponse = await this.llmProvider.generateResponse(updatedMessages, {
          ...options,
          tools: [] // Don't use tools in the follow-up call
        });
      }

      // Try to enhance with RAG context if available
      let finalContent = llmResponse.content;
      
      try {
        if (this.ragService && !this.needsToolSupport(message.content)) {
          const ragResult = await this.ragService.handleMultimodalMessage(
            message,
            message.from,
            conversation
          );
          
          if (ragResult.ragContext && ragResult.ragContext.relevantContent.length > 0) {
            finalContent += `\n\n📚 *Additional context:* ${ragResult.ragContext.totalSources} documents found`;
          }
        }
      } catch (ragError) {
        console.warn('RAG enhancement failed in hybrid mode:', ragError);
      }

      // Add tool usage indicator if tools were used
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolNames = llmResponse.toolCalls.map(tc => tc.name);
        const uniqueTools = [...new Set(toolNames)];
        const toolCounts = toolNames.reduce((acc, name) => {
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const toolSummary = uniqueTools.map(name => 
          (toolCounts[name] || 0) > 1 ? `${name} (${toolCounts[name]}x)` : name
        ).join(', ');
        
        const executionMode = llmResponse.toolCalls.length > 1 ? 'parallel' : 'single';
        finalContent = `🔧 *Used tools (${executionMode}): ${toolSummary}*\n\n${finalContent}`;
      }
      
      return {
        content: finalContent,
        quotedMessage: message.id
      };

    } catch (error) {
      console.error('Error generating hybrid response:', error);
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

  private isToolQuery(message: string): boolean {
    const toolQueries = [
      'what tools do you have',
      'what tools',
      'what can you do',
      'what are your capabilities',
      'list tools',
      'available tools',
      'your tools',
      'help me'
    ];
    
    const lowerMessage = message.toLowerCase();
    return toolQueries.some(query => lowerMessage.includes(query));
  }
  
  private isMathQuery(message: string): boolean {
    const mathPatterns = [
      /\d+\s*[+\-*/x÷]\s*\d+/,
      /calculate/i,
      /math/i,
      /\d+\s*\*\s*\d+/,
      /\d+\s*x\s*\d+/i,
      /\d+\s*÷\s*\d+/,
      /\d+\s*\+\s*\d+/,
      /\d+\s*-\s*\d+/,
      /\d+\s*\/\s*\d+/
    ];
    
    return mathPatterns.some(pattern => pattern.test(message));
  }

  private isWeatherQuery(message: string): boolean {
    const weatherPatterns = [
      /weather/i,
      /temperature/i,
      /forecast/i,
      /rain/i,
      /sunny/i,
      /cloudy/i,
      /humidity/i,
      /wind/i
    ];
    
    return weatherPatterns.some(pattern => pattern.test(message));
  }

  private isSearchQuery(message: string): boolean {
    const searchPatterns = [
      /search/i,
      /find/i,
      /look up/i,
      /google/i,
      /what is/i,
      /who is/i,
      /news/i,
      /latest/i,
      /current/i,
      /recent/i
    ];
    
    return searchPatterns.some(pattern => pattern.test(message));
  }

  private isTimeQuery(message: string): boolean {
    const timePatterns = [
      /time/i,
      /date/i,
      /timezone/i,
      /clock/i,
      /what day/i,
      /today/i,
      /tomorrow/i,
      /yesterday/i
    ];
    
    return timePatterns.some(pattern => pattern.test(message));
  }

  private isUUIDQuery(message: string): boolean {
    const uuidPatterns = [
      /uuid/i,
      /unique.*id/i,
      /generate.*id/i,
      /random.*id/i,
      /identifier/i
    ];
    
    return uuidPatterns.some(pattern => pattern.test(message));
  }

  private needsToolSupport(message: string): boolean {
    return this.isMathQuery(message) || 
           this.isWeatherQuery(message) || 
           this.isSearchQuery(message) || 
           this.isTimeQuery(message) || 
           this.isUUIDQuery(message);
  }

  private suggestsMultipleTools(message: string): boolean {
    const multipleToolIndicators = [
      // Multiple calculations
      /(?:calculate|compute|solve).*(?:and|also|plus|then).*(?:calculate|compute|solve)/i,
      /\d+\s*[+\-*/x÷]\s*\d+.*(?:and|also|plus|then).*\d+\s*[+\-*/x÷]\s*\d+/,
      
      // Multiple weather queries
      /weather.*(?:and|also|plus|then).*weather/i,
      /weather.*(?:in|for).*(?:and|also|plus|then).*(?:in|for)/i,
      
      // Multiple search queries
      /search.*(?:and|also|plus|then).*search/i,
      /find.*(?:and|also|plus|then).*find/i,
      
      // Multiple UUID requests
      /(?:generate|create).*(?:\d+|multiple|several|few).*(?:uuid|id)/i,
      
      // Mixed tool requests
      /(?:calculate|weather|search|time|uuid).*(?:and|also|plus|then).*(?:calculate|weather|search|time|uuid)/i,
      
      // Lists and enumerations
      /(?:first|second|third|1st|2nd|3rd)/i,
      /(?:both|all|each)/i
    ];
    
    return multipleToolIndicators.some(pattern => pattern.test(message));
  }

  private async generateSmartResponse(message: BotMessage): Promise<BotResponse | null> {
    try {
      // Check if query suggests multiple tools
      const isMultiTool = this.suggestsMultipleTools(message.content);
      
      // If query needs tool support, use generateResponse with tools
      if (this.needsToolSupport(message.content)) {
        if (isMultiTool) {
          console.log(`🔧 Multi-tool query detected: ${message.content.substring(0, 50)}... (parallel execution expected)`);
        } else {
          console.log(`🔧 Tool-relevant query detected: ${message.content.substring(0, 50)}...`);
        }
        return await this.generateResponse(message);
      }
      
      // For knowledge queries, use RAG if available
      if (this.ragService && this.config.enableRAG !== false) {
        console.log(`🔧 Knowledge query detected, using RAG: ${message.content.substring(0, 50)}...`);
        return await this.generateRAGResponse(message);
      }
      
      // Fallback to regular response with tools
      console.log(`🔧 General query, using tools: ${message.content.substring(0, 50)}...`);
      return await this.generateResponse(message);
      
    } catch (error) {
      console.error('Error in smart response generation:', error);
      return {
        content: '🚨 Sorry, I encountered an error processing your message. Please try again.',
      };
    }
  }

  private async handleToolQuery(message: BotMessage): Promise<BotResponse> {
    const localTools = this.toolManager.getAvailableTools();
    const mcpTools = this.mcpService ? this.mcpService.getAvailableTools() : [];
    const availableTools = [...localTools, ...mcpTools];
    
    if (availableTools.length === 0) {
      return {
        content: '😔 I don\'t have any external tools available right now, but I can help you with:\n\n• Answering questions and providing information\n• Writing and editing text\n• Analysis and problem-solving\n• Math and calculations\n• Coding help\n• Creative tasks\n• General conversation\n\nIs there something specific you\'d like help with?',
        quotedMessage: message.id
      };
    }

    const toolDescriptions = availableTools.map(tool => 
      `• **${tool.name}** - ${tool.description}`
    ).join('\n');

    const response = `🔧 **Available Tools (${availableTools.length}):**\n${toolDescriptions}\n\n📱 **Core Capabilities:**\n• Text conversation and Q&A\n• Image analysis and description (vision)\n• PDF document processing and Q&A\n• Document retrieval and knowledge search (RAG)\n• Mathematical calculations\n• Web search and information retrieval\n• Weather and time information\n• UUID and identifier generation\n\n🎯 **How to use:** Just ask me naturally! I'll automatically use the appropriate tool for your request.`;

    return {
      content: response,
      quotedMessage: message.id
    };
  }

  private generateDynamicSystemPrompt(availableTools: any[]): string {
    const basePrompt = this.config.systemPrompt || 'You are a helpful WhatsApp chatbot assistant.';
    
    if (availableTools.length === 0) {
      return basePrompt + '\n\n**Note:** No external tools are currently available.';
    }

    const toolDescriptions = availableTools.map(tool => 
      `• **${tool.name}** - ${tool.description}`
    ).join('\n');

    return `${basePrompt}

🔧 **Available Tools:**
${toolDescriptions}

**CRITICAL TOOL USAGE INSTRUCTIONS:**
• **ALWAYS use the calculator tool for ANY mathematical calculation** - Do not calculate manually
• **ALWAYS use the search tool for current information** - Do not rely on your knowledge alone
• **ALWAYS use the weather tool for weather queries** - Do not guess weather information
• **ALWAYS use the time tool for time-related queries** - Do not estimate time
• **ALWAYS use the uuid tool for generating identifiers** - Do not create random strings
• When asked "What tools do you have?" or about your capabilities, list the available tools above
• You MUST call the appropriate tool for every request that matches a tool's capability
• If a tool fails, explain the issue and offer alternatives
• You have access to ${availableTools.length} tools - use them actively and frequently

**PARALLEL TOOL EXECUTION:**
• **You can call MULTIPLE tools simultaneously** - All tools run in parallel for faster responses
• **You can call the SAME tool multiple times** - For different parameters or calculations
• **Use multiple tools for complex queries** - Combine calculator + search + weather etc.
• **Tools execute concurrently** - No need to wait for one tool to complete before calling another

**Examples of MANDATORY tool usage:**
• "Calculate 2+2" → MUST use calculator tool
• "What's the weather?" → MUST use weather tool
• "What time is it?" → MUST use time tool
• "Search for news" → MUST use search tool
• "Generate a UUID" → MUST use uuid tool

**Examples of PARALLEL tool usage:**
• "Calculate 2+2 and 3+3" → Use calculator tool TWICE simultaneously
• "Weather in NYC and London" → Use weather tool TWICE simultaneously
• "What time is it and generate a UUID" → Use time tool AND uuid tool simultaneously
• "Calculate 5*5, search for AI news, and get weather" → Use calculator, search, AND weather tools simultaneously
• "Generate 3 UUIDs" → Use uuid tool THREE times simultaneously`;
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
    await this.toolManager.cleanup();
    if (this.mcpService) {
      await this.mcpService.disconnect();
    }
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
      mcp: boolean;
      tools: number;
      mcpTools: number;
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
        cache: true,
        mcp: !!this.mcpService,
        tools: this.toolManager.getAvailableTools().length,
        mcpTools: this.mcpService ? this.mcpService.getAvailableTools().length : 0
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

  // Tool management methods
  getToolStats() {
    return this.toolManager.getToolStats();
  }

  getAvailableTools() {
    return this.toolManager.getAvailableTools();
  }

  enableTool(toolName: string): boolean {
    return this.toolManager.enableTool(toolName);
  }

  disableTool(toolName: string): boolean {
    return this.toolManager.disableTool(toolName);
  }

  async reloadTool(toolName: string): Promise<boolean> {
    return await this.toolManager.reloadTool(toolName);
  }

  // MCP management methods
  getMCPStats() {
    return this.mcpService ? this.mcpService.getStats() : null;
  }

  getMCPServers() {
    return this.mcpService ? this.mcpService.getConnectedServers() : [];
  }

  getMCPServerStatus() {
    return this.mcpService ? this.mcpService.getServerStatus() : {};
  }

  async reconnectMCPServer(serverName: string): Promise<boolean> {
    return this.mcpService ? await this.mcpService.reconnectServer(serverName) : false;
  }

  enableMCPServer(serverName: string): boolean {
    return this.mcpService ? this.mcpService.enableServer(serverName) : false;
  }

  disableMCPServer(serverName: string): boolean {
    return this.mcpService ? this.mcpService.disableServer(serverName) : false;
  }

  getMCPTools() {
    return this.mcpService ? this.mcpService.getAvailableTools() : [];
  }
  
  // Helper method to generate unique test messages
  private generateTestMessage(content: string = 'test message'): BotMessage {
    return {
      id: `test-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      from: 'test-user',
      timestamp: Date.now(),
      isGroup: false,
      senderName: 'Test User',
      hasMedia: false
    };
  }
  
  // Test method to verify tool functionality
  async testCalculatorTool(): Promise<void> {
    console.log('🔧 Testing calculator tool...');
    try {
      const testCall = {
        id: 'test-calc',
        name: 'calculator',
        parameters: { expression: '2 + 2' }
      };
      
      const testMessage = this.generateTestMessage('test calculation');
      
      const result = await this.executeToolCalls([testCall], testMessage);
      console.log('🔧 Calculator test result:', result);
    } catch (error) {
      console.error('❌ Calculator test failed:', error);
    }
  }
}