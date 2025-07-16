import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolFunction } from '../types/tools';

const execAsync = promisify(exec);

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPConfig {
  servers: MCPServer[];
  timeout?: number;
  retryAttempts?: number;
}

export class MCPService extends EventEmitter {
  private servers: Map<string, MCPServer> = new Map();
  private connectedServers: Set<string> = new Set();
  private tools: Map<string, Tool> = new Map();
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    super();
    this.config = {
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      ...config
    };
    
    // Initialize servers
    config.servers?.forEach(server => {
      this.servers.set(server.name, server);
    });
  }

  async initialize(): Promise<void> {
    console.log('🔗 Initializing MCP Service...');
    
    const enabledServers = Array.from(this.servers.values()).filter(s => s.enabled);
    
    if (enabledServers.length === 0) {
      console.log('ℹ️  No MCP servers configured');
      return;
    }

    console.log(`🚀 Starting ${enabledServers.length} MCP servers...`);
    
    const initPromises = enabledServers.map(server => this.connectToServer(server));
    const results = await Promise.allSettled(initPromises);
    
    let successCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        const serverName = enabledServers[index]?.name || 'Unknown';
        const errorMessage = result.status === 'rejected' ? result.reason : 'Unknown error';
        console.error(`❌ Failed to connect to MCP server ${serverName}:`, errorMessage);
      }
    });

    console.log(`✅ MCP Service initialized: ${successCount}/${enabledServers.length} servers connected`);
    this.emit('initialized', { 
      totalServers: enabledServers.length, 
      connectedServers: successCount,
      toolCount: this.tools.size
    });
  }

  private async connectToServer(server: MCPServer): Promise<void> {
    try {
      console.log(`🔌 Connecting to MCP server: ${server.name}`);
      
      // For now, we'll implement a basic MCP client
      // In a full implementation, you'd use the @modelcontextprotocol/sdk
      
      // Mock connection for demonstration
      await this.mockMCPConnection(server);
      
      this.connectedServers.add(server.name);
      console.log(`✅ Connected to MCP server: ${server.name}`);
      
      this.emit('serverConnected', { serverName: server.name });
      
    } catch (error) {
      console.error(`❌ Failed to connect to MCP server ${server.name}:`, error);
      this.emit('serverError', { serverName: server.name, error });
      throw error;
    }
  }

  private async mockMCPConnection(server: MCPServer): Promise<void> {
    // Mock MCP tools based on server name
    const mockTools = this.getMockToolsForServer(server.name);
    
    mockTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }

  private getMockToolsForServer(serverName: string): Tool[] {
    // Mock tools based on common MCP server types
    switch (serverName) {
      case 'filesystem':
        return [
          {
            name: 'read_file',
            description: 'Read the contents of a file',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'The path to the file to read'
                }
              },
              required: ['path']
            },
            enabled: true,
            category: 'filesystem',
            version: '1.0.0',
            async execute(params: any, context: any) {
              // Mock file reading
              return {
                success: true,
                data: { content: `Mock file content for ${params.path}` },
                message: `File ${params.path} read successfully`
              };
            }
          },
          {
            name: 'write_file',
            description: 'Write content to a file',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'The path to the file to write'
                },
                content: {
                  type: 'string',
                  description: 'The content to write to the file'
                }
              },
              required: ['path', 'content']
            },
            enabled: true,
            category: 'filesystem',
            version: '1.0.0',
            async execute(params: any, context: any) {
              // Mock file writing
              return {
                success: true,
                data: { path: params.path, bytesWritten: params.content.length },
                message: `File ${params.path} written successfully`
              };
            }
          }
        ];
      
      case 'database':
        return [
          {
            name: 'execute_query',
            description: 'Execute a database query',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The SQL query to execute'
                },
                parameters: {
                  type: 'array',
                  description: 'Query parameters',
                  items: { type: 'string' }
                }
              },
              required: ['query']
            },
            enabled: true,
            category: 'database',
            version: '1.0.0',
            async execute(params: any, context: any) {
              // Mock database query
              return {
                success: true,
                data: { 
                  rows: [{ id: 1, name: 'Mock Data' }], 
                  rowCount: 1 
                },
                message: 'Query executed successfully'
              };
            }
          }
        ];
      
      case 'web':
        return [
          {
            name: 'fetch_url',
            description: 'Fetch content from a URL',
            parameters: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The URL to fetch'
                },
                method: {
                  type: 'string',
                  description: 'HTTP method',
                  enum: ['GET', 'POST', 'PUT', 'DELETE'],
                  default: 'GET'
                }
              },
              required: ['url']
            },
            enabled: true,
            category: 'web',
            version: '1.0.0',
            async execute(params: any, context: any) {
              // Mock web request
              return {
                success: true,
                data: { 
                  status: 200, 
                  content: `Mock content from ${params.url}` 
                },
                message: `Successfully fetched ${params.url}`
              };
            }
          }
        ];
      
      default:
        return [];
    }
  }

  getAvailableTools(): ToolFunction[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.enabled)
      .map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
  }

  async executeTool(name: string, parameters: any, context: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`MCP tool '${name}' not found`);
    }

    if (!tool.enabled) {
      throw new Error(`MCP tool '${name}' is disabled`);
    }

    try {
      const result = await tool.execute(parameters, context);
      this.emit('toolExecuted', { name, success: result.success, result });
      return result;
    } catch (error) {
      this.emit('toolError', { name, error });
      throw error;
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this.connectedServers);
  }

  getServerStatus(): Record<string, { connected: boolean; toolCount: number }> {
    const status: Record<string, { connected: boolean; toolCount: number }> = {};
    
    this.servers.forEach((server, name) => {
      const connected = this.connectedServers.has(name);
      const toolCount = Array.from(this.tools.values())
        .filter(tool => tool.category === name).length;
      
      status[name] = { connected, toolCount };
    });
    
    return status;
  }

  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting MCP servers...');
    
    // Clean up connections
    this.connectedServers.clear();
    this.tools.clear();
    
    console.log('✅ MCP Service disconnected');
    this.emit('disconnected');
  }

  async reconnectServer(serverName: string): Promise<boolean> {
    const server = this.servers.get(serverName);
    if (!server) {
      return false;
    }

    try {
      await this.connectToServer(server);
      return true;
    } catch (error) {
      console.error(`Failed to reconnect to MCP server ${serverName}:`, error);
      return false;
    }
  }

  enableServer(serverName: string): boolean {
    const server = this.servers.get(serverName);
    if (server) {
      server.enabled = true;
      return true;
    }
    return false;
  }

  disableServer(serverName: string): boolean {
    const server = this.servers.get(serverName);
    if (server) {
      server.enabled = false;
      this.connectedServers.delete(serverName);
      
      // Remove tools from this server
      const toolsToRemove = Array.from(this.tools.entries())
        .filter(([_, tool]) => tool.category === serverName)
        .map(([name, _]) => name);
      
      toolsToRemove.forEach(name => this.tools.delete(name));
      
      return true;
    }
    return false;
  }

  getStats() {
    return {
      totalServers: this.servers.size,
      connectedServers: this.connectedServers.size,
      totalTools: this.tools.size,
      enabledTools: Array.from(this.tools.values()).filter(t => t.enabled).length,
      serverStatus: this.getServerStatus()
    };
  }
}

// Default MCP configuration
export const createDefaultMCPConfig = (): MCPConfig => ({
  servers: [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem'],
      enabled: false // Disabled by default
    },
    {
      name: 'database',
      command: 'npx',
      args: ['@modelcontextprotocol/server-database'],
      enabled: false // Disabled by default
    },
    {
      name: 'web',
      command: 'npx',
      args: ['@modelcontextprotocol/server-web'],
      enabled: false // Disabled by default
    }
  ],
  timeout: 30000,
  retryAttempts: 3
});