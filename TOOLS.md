# 🛠️ Tool System Documentation

The WhatsApp LLM Chatbot now includes a powerful **autonomous tool system** that allows the AI to use various tools to enhance its capabilities. Tools are automatically discovered and loaded from the `src/tools/` directory.

## 🎯 How It Works

1. **Zero Configuration**: Drop a tool file into `src/tools/` and it's automatically available
2. **Autonomous Usage**: The LLM decides when and how to use tools based on user requests
3. **Rich Context**: Tools have access to user data, conversation history, and all bot services
4. **Type Safe**: Full TypeScript support with comprehensive interfaces

## 📁 Available Tools

### 🧮 Calculator (`calculator.js`)
**Purpose**: Perform mathematical calculations and solve math problems

**Examples**:
- "Calculate 15% of 250"
- "What's the square root of 144?"
- "Solve: (2 + 3) * 4 - 1"

**Features**:
- Safe expression evaluation
- Support for basic operators (+, -, *, /, ^, %)
- Math functions (sqrt, sin, cos, tan, log, abs, floor, ceil, round)
- Constants (pi, e)

### 🔍 Search (`search.js`)
**Purpose**: Search the web for current information and facts

**Examples**:
- "Search for latest news about AI"
- "Find information about the weather in Tokyo"
- "Look up the current price of Bitcoin"

**Features**:
- Web search capabilities (mock implementation - easily replaceable with real API)
- Rate limiting (10 calls per minute)
- Formatted results with titles, snippets, and URLs

### 🌤️ Weather (`weather.js`)
**Purpose**: Get current weather conditions and forecasts

**Examples**:
- "What's the weather in New York?"
- "Show me the temperature in London in Fahrenheit"
- "How's the weather in Tokyo?"

**Features**:
- Multiple temperature units (Celsius, Fahrenheit, Kelvin)
- Comprehensive weather data (temperature, humidity, wind, pressure)
- Location-based queries

### 🕐 Time (`time.js`)
**Purpose**: Get current time and date information for any timezone

**Examples**:
- "What time is it in Tokyo?"
- "Show me the current time in UTC"
- "What's the date in New York?"

**Features**:
- Timezone support with city name mapping
- Multiple time formats (12-hour, 24-hour, ISO)
- Day of week/year calculations
- Weekend detection

### 🆔 UUID (`uuid.js`)
**Purpose**: Generate unique identifiers for development and testing

**Examples**:
- "Generate a UUID"
- "Create 5 random UUIDs"
- "Generate a short ID"

**Features**:
- Multiple UUID versions (v1, v3, v4, v5)
- Custom length random strings
- NanoID and short ID generation
- Bulk generation support

## 🔧 Creating Custom Tools

### Basic Tool Structure

Create a new `.js` or `.ts` file in `src/tools/` with this structure:

```javascript
module.exports = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'number', description: 'Second parameter' }
    },
    required: ['param1']
  },
  enabled: true,
  category: 'utility',
  version: '1.0.0',

  async execute(params, context) {
    const { param1, param2 } = params;
    
    // Your tool logic here
    
    return {
      success: true,
      data: { result: 'some data' },
      message: 'User-friendly response'
    };
  }
};
```

### Tool Properties

| Property | Required | Description |
|----------|----------|-------------|
| `name` | ✅ | Unique tool identifier |
| `description` | ✅ | What the tool does (for LLM) |
| `parameters` | ✅ | JSON Schema for parameters |
| `execute` | ✅ | Function that performs the tool action |
| `enabled` | ❌ | Whether tool is active (default: true) |
| `category` | ❌ | Tool category for organization |
| `version` | ❌ | Tool version |
| `rateLimit` | ❌ | Rate limiting configuration |
| `initialize` | ❌ | Setup function called on load |
| `cleanup` | ❌ | Cleanup function called on shutdown |

### Tool Context

Every tool receives a `context` object with:

```typescript
interface ToolContext {
  message: BotMessage;           // Current WhatsApp message
  user?: User;                   // User info from database
  conversation?: Conversation;    // Conversation data
  services: {
    database?: DatabaseService;  // Database access
    rag?: RAGService;           // RAG/vector search
    cache: NodeCache;           // Caching service
  };
}
```

### Tool Result Format

Tools must return a `ToolResult` object:

```typescript
interface ToolResult {
  success: boolean;        // Whether operation succeeded
  data?: any;             // Structured data (optional)
  error?: string;         // Error message if failed
  message?: string;       // User-friendly message
  shouldContinue?: boolean; // Whether to continue processing
}
```

## 🎛️ Tool Management

### Runtime Commands

The chatbot provides methods to manage tools at runtime:

```typescript
// Get tool statistics
const stats = chatbot.getToolStats();

// Get available tools
const tools = chatbot.getAvailableTools();

// Enable/disable tools
chatbot.enableTool('calculator');
chatbot.disableTool('search');

// Reload a tool (for development)
await chatbot.reloadTool('my_tool');
```

### Tool Statistics

Monitor tool usage with built-in statistics:

```javascript
{
  totalTools: 5,
  enabledTools: 4,
  toolCategories: {
    'utility': 3,
    'information': 2
  },
  usage: {
    'calculator': 15,
    'search': 8,
    'weather': 12
  },
  errors: {
    'calculator': 0,
    'search': 1,
    'weather': 0
  }
}
```

## 🔒 Security & Best Practices

### Parameter Validation
- Always validate parameters using JSON Schema
- Sanitize inputs to prevent injection attacks
- Set reasonable limits on parameter values

### Error Handling
```javascript
async execute(params, context) {
  try {
    // Tool logic here
    return { success: true, data: result };
  } catch (error) {
    console.error('Tool error:', error);
    return {
      success: false,
      error: error.message,
      message: 'User-friendly error message'
    };
  }
}
```

### Rate Limiting
```javascript
module.exports = {
  // ... other properties
  rateLimit: {
    maxCalls: 10,      // Maximum calls
    windowMs: 60000    // Time window (1 minute)
  },
  // ...
};
```

### Resource Management
- Use `initialize()` for setup (API clients, connections)
- Use `cleanup()` for proper resource disposal
- Handle API timeouts appropriately
- Cache expensive operations when possible

## 🚀 Advanced Examples

### API Integration Tool
```javascript
const axios = require('axios');

module.exports = {
  name: 'crypto_price',
  description: 'Get current cryptocurrency prices',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Crypto symbol (e.g., BTC, ETH)' }
    },
    required: ['symbol']
  },
  
  async execute({ symbol }, context) {
    try {
      const response = await axios.get(`https://api.example.com/price/${symbol}`);
      return {
        success: true,
        data: response.data,
        message: `${symbol.toUpperCase()}: $${response.data.price}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Could not get price for ${symbol}`
      };
    }
  }
};
```

### Database Integration Tool
```javascript
module.exports = {
  name: 'user_stats',
  description: 'Get user conversation statistics',
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['day', 'week', 'month'], default: 'week' }
    }
  },
  
  async execute({ period }, context) {
    if (!context.services.database || !context.user) {
      return {
        success: false,
        error: 'Database or user context not available'
      };
    }
    
    // Use database service to get stats
    const stats = await context.services.database.getUserStats(context.user.id, period);
    
    return {
      success: true,
      data: stats,
      message: `You've sent ${stats.messageCount} messages this ${period}`
    };
  }
};
```

## 📊 Monitoring & Debugging

### Enable Tool Logging
Tools automatically log their execution, but you can add custom logging:

```javascript
async execute(params, context) {
  console.log(`[${this.name}] Starting execution with:`, params);
  
  const result = await performOperation(params);
  
  console.log(`[${this.name}] Completed with result:`, result);
  return result;
}
```

### Tool Events
The ToolManager emits events you can listen to:

```javascript
toolManager.on('toolLoaded', ({ name, tool }) => {
  console.log(`Tool loaded: ${name}`);
});

toolManager.on('toolExecuted', ({ name, success, executionTime }) => {
  console.log(`Tool ${name} executed in ${executionTime}ms: ${success ? 'SUCCESS' : 'FAILED'}`);
});

toolManager.on('toolError', ({ name, error }) => {
  console.error(`Tool ${name} error:`, error);
});
```

## 🔄 Hot Reloading

During development, you can reload tools without restarting the bot:

```javascript
// Reload a specific tool
await chatbot.reloadTool('my_tool');

// Or manually trigger a reload
await toolManager.reloadTool('my_tool');
```

## 🧪 Testing Tools

Create unit tests for your tools:

```javascript
const myTool = require('./src/tools/my_tool.js');

describe('My Tool', () => {
  test('should execute successfully', async () => {
    const context = {
      message: { /* mock message */ },
      services: { cache: mockCache }
    };
    
    const result = await myTool.execute({ param1: 'test' }, context);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
```

---

## 🎉 Ready to Use!

The tool system is now fully integrated and ready to use. The LLM will automatically:

1. **Detect** when a tool could be helpful for a user's request
2. **Select** the appropriate tool(s) to use
3. **Execute** the tool with proper parameters
4. **Integrate** the results into a natural response

**Example Conversation:**
```
User: "What's 15% of 250 and what's the weather in Tokyo?"

Bot: Let me calculate that for you and check the weather in Tokyo.

[Bot uses calculator tool: 15% of 250 = 37.5]
[Bot uses weather tool: Gets Tokyo weather data]

Bot: "15% of 250 is 37.5. 

🌤️ Weather in Tokyo:
🌡️ Temperature: 22°C (feels like 24°C)
☁️ Conditions: Partly Cloudy
💧 Humidity: 65%
💨 Wind Speed: 12 km/h"
```

Start experimenting with the existing tools or create your own! 🚀