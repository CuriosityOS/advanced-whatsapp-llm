import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Tool, LoadedTool, ToolContext, ToolResult, ToolCall, ToolCallResult, ToolFunction, ToolStats } from '../types/tools';

export class ToolManager extends EventEmitter {
  private tools: Map<string, LoadedTool> = new Map();
  private toolsDirectory: string;
  private rateLimitTracking: Map<string, Map<string, number[]>> = new Map();

  constructor(toolsDirectory?: string) {
    super();
    this.toolsDirectory = toolsDirectory || path.join(__dirname);
  }

  async initialize(): Promise<void> {
    try {
      console.log(`🔧 Initializing ToolManager, scanning: ${this.toolsDirectory}`);
      await this.loadAllTools();
      console.log(`✅ ToolManager initialized with ${this.tools.size} tools`);
      this.emit('initialized', { toolCount: this.tools.size });
    } catch (error) {
      console.error('❌ ToolManager initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  private async loadAllTools(): Promise<void> {
    try {
      const files = fs.readdirSync(this.toolsDirectory);
      const toolFiles = files.filter(file => 
        (file.endsWith('.js') || file.endsWith('.ts')) && 
        file !== 'index.js' && 
        file !== 'index.ts'
      );

      for (const file of toolFiles) {
        try {
          await this.loadTool(file);
        } catch (error) {
          console.error(`❌ Failed to load tool ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error scanning tools directory:', error);
    }
  }

  private async loadTool(filename: string): Promise<void> {
    const filePath = path.join(this.toolsDirectory, filename);
    
    try {
      // Clear require cache to allow hot reloading
      delete require.cache[require.resolve(filePath)];
      
      const toolModule = require(filePath);
      const tool: Tool = toolModule.default || toolModule;

      // Validate tool structure
      this.validateTool(tool, filename);

      // Initialize tool if it has an initialize method
      if (tool.initialize) {
        await tool.initialize();
      }

      const loadedTool: LoadedTool = {
        tool,
        filePath,
        loadTime: new Date(),
        usageCount: 0,
        errorCount: 0
      };

      this.tools.set(tool.name, loadedTool);
      console.log(`✅ Loaded tool: ${tool.name} (${tool.description})`);
      this.emit('toolLoaded', { name: tool.name, tool });

    } catch (error) {
      console.error(`❌ Error loading tool ${filename}:`, error);
      this.emit('toolLoadError', { filename, error });
      throw error;
    }
  }

  private validateTool(tool: any, filename: string): void {
    const requiredProperties = ['name', 'description', 'parameters', 'execute'];
    
    for (const prop of requiredProperties) {
      if (!tool.hasOwnProperty(prop)) {
        throw new Error(`Tool ${filename} missing required property: ${prop}`);
      }
    }

    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool ${filename} execute must be a function`);
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new Error(`Tool ${filename} parameters must be a valid JSON schema object`);
    }

    if (typeof tool.enabled !== 'boolean') {
      tool.enabled = true; // Default to enabled
    }
  }

  async executeTool(toolCall: ToolCall, context: ToolContext): Promise<ToolCallResult> {
    const loadedTool = this.tools.get(toolCall.name);
    
    if (!loadedTool) {
      return {
        toolCallId: toolCall.id,
        result: {
          success: false,
          error: `Tool '${toolCall.name}' not found`
        }
      };
    }

    if (!loadedTool.tool.enabled) {
      return {
        toolCallId: toolCall.id,
        result: {
          success: false,
          error: `Tool '${toolCall.name}' is disabled`
        }
      };
    }

    // Check rate limiting
    if (loadedTool.tool.rateLimit && !this.checkRateLimit(toolCall.name, context.message.from, loadedTool.tool.rateLimit)) {
      return {
        toolCallId: toolCall.id,
        result: {
          success: false,
          error: `Rate limit exceeded for tool '${toolCall.name}'`
        }
      };
    }

    try {
      console.log(`🔧 Executing tool: ${toolCall.name} with params:`, toolCall.parameters);
      
      const startTime = Date.now();
      const result = await loadedTool.tool.execute(toolCall.parameters, context);
      const executionTime = Date.now() - startTime;

      // Update usage statistics
      loadedTool.usageCount++;
      loadedTool.lastUsed = new Date();

      console.log(`✅ Tool ${toolCall.name} executed successfully in ${executionTime}ms`);
      this.emit('toolExecuted', { 
        name: toolCall.name, 
        success: result.success, 
        executionTime,
        result 
      });

      return {
        toolCallId: toolCall.id,
        result
      };

    } catch (error) {
      loadedTool.errorCount++;
      console.error(`❌ Tool ${toolCall.name} execution failed:`, error);
      
      this.emit('toolError', { name: toolCall.name, error });

      return {
        toolCallId: toolCall.id,
        result: {
          success: false,
          error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  private checkRateLimit(toolName: string, userId: string, rateLimit: { maxCalls: number; windowMs: number }): boolean {
    if (!this.rateLimitTracking.has(toolName)) {
      this.rateLimitTracking.set(toolName, new Map());
    }

    const toolLimits = this.rateLimitTracking.get(toolName)!;
    if (!toolLimits.has(userId)) {
      toolLimits.set(userId, []);
    }

    const userCalls = toolLimits.get(userId)!;
    const now = Date.now();
    
    // Clean old calls outside the window
    const validCalls = userCalls.filter(timestamp => now - timestamp < rateLimit.windowMs);
    
    if (validCalls.length >= rateLimit.maxCalls) {
      return false;
    }

    validCalls.push(now);
    toolLimits.set(userId, validCalls);
    return true;
  }

  getAvailableTools(): ToolFunction[] {
    return Array.from(this.tools.values())
      .filter(loadedTool => loadedTool.tool.enabled)
      .map(loadedTool => ({
        name: loadedTool.tool.name,
        description: loadedTool.tool.description,
        parameters: loadedTool.tool.parameters
      }));
  }

  getTool(name: string): Tool | null {
    const loadedTool = this.tools.get(name);
    return loadedTool ? loadedTool.tool : null;
  }

  getToolStats(): ToolStats {
    const tools = Array.from(this.tools.values());
    const categories: Record<string, number> = {};
    const usage: Record<string, number> = {};
    const errors: Record<string, number> = {};

    for (const loadedTool of tools) {
      const category = loadedTool.tool.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
      usage[loadedTool.tool.name] = loadedTool.usageCount;
      errors[loadedTool.tool.name] = loadedTool.errorCount;
    }

    return {
      totalTools: tools.length,
      enabledTools: tools.filter(t => t.tool.enabled).length,
      toolCategories: categories,
      usage,
      errors
    };
  }

  async reloadTool(toolName: string): Promise<boolean> {
    const loadedTool = this.tools.get(toolName);
    if (!loadedTool) {
      return false;
    }

    try {
      // Cleanup old tool
      if (loadedTool.tool.cleanup) {
        await loadedTool.tool.cleanup();
      }

      // Reload from file
      const filename = path.basename(loadedTool.filePath);
      await this.loadTool(filename);
      console.log(`🔄 Reloaded tool: ${toolName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to reload tool ${toolName}:`, error);
      return false;
    }
  }

  enableTool(toolName: string): boolean {
    const loadedTool = this.tools.get(toolName);
    if (loadedTool) {
      loadedTool.tool.enabled = true;
      console.log(`✅ Enabled tool: ${toolName}`);
      return true;
    }
    return false;
  }

  disableTool(toolName: string): boolean {
    const loadedTool = this.tools.get(toolName);
    if (loadedTool) {
      loadedTool.tool.enabled = false;
      console.log(`⏸️ Disabled tool: ${toolName}`);
      return true;
    }
    return false;
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up ToolManager...');
    
    for (const [name, loadedTool] of this.tools) {
      try {
        if (loadedTool.tool.cleanup) {
          await loadedTool.tool.cleanup();
        }
      } catch (error) {
        console.error(`❌ Error cleaning up tool ${name}:`, error);
      }
    }

    this.tools.clear();
    this.rateLimitTracking.clear();
    console.log('✅ ToolManager cleanup completed');
  }
}

export * from '../types/tools';