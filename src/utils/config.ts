import { config } from 'dotenv';
import { LLMConfig } from '../types';

config();

export interface AppConfig {
  llm: LLMConfig;
  whatsapp: {
    session: string;
    qrMaxRetries: number;
    restartOnAuthFail: boolean;
  };
  bot: {
    systemPrompt: string;
    maxTokens: number;
    temperature: number;
    enableLogging: boolean;
    rateLimit: {
      maxRequests: number;
      windowMs: number;
    };
  };
  models: {
    anthropic: {
      model: string;
      maxTokens: number;
      temperature: number;
    };
    openrouter: {
      model: string;
      maxTokens: number;
      temperature: number;
    };
  };
  supabase?: {
    url: string;
    anonKey: string;
    projectId: string;
  };
  server: {
    port: number;
    enableHealthCheck: boolean;
  };
  openai?: {
    apiKey: string;
  };
  features: {
    enableRAG: boolean;
    enableVision: boolean;
    enablePDF: boolean;
  };
}

class ConfigManager {
  private static instance: ConfigManager;
  private _config: AppConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  get config(): AppConfig {
    if (!this._config) {
      this._config = this.loadConfig();
    }
    return this._config;
  }

  private loadConfig(): AppConfig {
    // No longer require specific API keys since we'll select them interactively
    // At least one API key should be available for the selected provider

    const llmConfig: any = {
      provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openrouter') || 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY || '',
      model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1000'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
    };

    if (process.env.LLM_BASE_URL) {
      llmConfig.baseURL = process.env.LLM_BASE_URL;
    }

    return {
      llm: llmConfig,
      whatsapp: {
        session: process.env.WHATSAPP_SESSION || 'default',
        qrMaxRetries: parseInt(process.env.WHATSAPP_QR_MAX_RETRIES || '3'),
        restartOnAuthFail: process.env.WHATSAPP_RESTART_ON_AUTH_FAIL === 'true'
      },
      bot: {
        systemPrompt: process.env.BOT_SYSTEM_PROMPT || 
          'You are a helpful WhatsApp chatbot assistant. Be concise, friendly, and helpful in your responses.',
        maxTokens: parseInt(process.env.BOT_MAX_TOKENS || '1000'),
        temperature: parseFloat(process.env.BOT_TEMPERATURE || '0.7'),
        enableLogging: process.env.BOT_ENABLE_LOGGING !== 'false',
        rateLimit: {
          maxRequests: parseInt(process.env.BOT_RATE_LIMIT_MAX_REQUESTS || '10'),
          windowMs: parseInt(process.env.BOT_RATE_LIMIT_WINDOW_MS || '60000')
        }
      },
      models: {
        anthropic: {
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '1000'),
          temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.7')
        },
        openrouter: {
          model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
          maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '1000'),
          temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.7')
        }
      },
      ...(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? {
        supabase: {
          url: process.env.SUPABASE_URL,
          anonKey: process.env.SUPABASE_ANON_KEY,
          projectId: process.env.SUPABASE_PROJECT_ID || ''
        }
      } : {}),
      server: {
        port: parseInt(process.env.PORT || '3000'),
        enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false'
      },
      ...(process.env.OPENAI_API_KEY ? {
        openai: {
          apiKey: process.env.OPENAI_API_KEY
        }
      } : {}),
      features: {
        enableRAG: process.env.ENABLE_RAG !== 'false',
        enableVision: process.env.ENABLE_VISION !== 'false',
        enablePDF: process.env.ENABLE_PDF !== 'false'
      }
    };
  }

  updateConfig(updates: Partial<AppConfig>): void {
    if (this._config) {
      this._config = { ...this._config, ...updates };
    }
  }

  validateConfig(selectedProvider?: 'anthropic' | 'openrouter'): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.config;

      // Only validate the selected provider's API key
      if (selectedProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
        errors.push('ANTHROPIC_API_KEY is required for Anthropic provider');
      }
      
      if (selectedProvider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
        errors.push('OPENROUTER_API_KEY is required for OpenRouter provider');
      }

      if (config.llm.maxTokens && (config.llm.maxTokens <= 0 || config.llm.maxTokens > 4000)) {
        errors.push('LLM max tokens must be between 1 and 4000');
      }

      if (config.llm.temperature && (config.llm.temperature < 0 || config.llm.temperature > 2)) {
        errors.push('LLM temperature must be between 0 and 2');
      }

      if (config.bot.rateLimit.maxRequests <= 0) {
        errors.push('Rate limit max requests must be greater than 0');
      }

      if (config.bot.rateLimit.windowMs <= 0) {
        errors.push('Rate limit window must be greater than 0');
      }

    } catch (error) {
      errors.push(`Configuration loading error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  printConfig(selectedProvider?: 'anthropic' | 'openrouter'): void {
    const config = this.config;
    console.log('📋 Current Configuration:');
    
    if (selectedProvider) {
      const modelConfig = config.models[selectedProvider];
      console.log(`  LLM Provider: ${selectedProvider}`);
      console.log(`  Model: ${modelConfig.model}`);
      console.log(`  Max Tokens: ${modelConfig.maxTokens}`);
      console.log(`  Temperature: ${modelConfig.temperature}`);
    } else {
      console.log(`  Anthropic Model: ${config.models.anthropic.model}`);
      console.log(`  OpenRouter Model: ${config.models.openrouter.model}`);
    }
    
    console.log(`  WhatsApp Session: ${config.whatsapp.session}`);
    console.log(`  Logging: ${config.bot.enableLogging ? 'Enabled' : 'Disabled'}`);
    console.log(`  Rate Limit: ${config.bot.rateLimit.maxRequests} requests per ${config.bot.rateLimit.windowMs}ms`);
    if (config.supabase) {
      console.log(`  Supabase: Connected (Project: ${config.supabase.projectId})`);
    }
    if (config.openai) {
      console.log(`  OpenAI: Connected (for embeddings)`);
    }
    console.log(`  🧠 RAG: ${config.features.enableRAG ? 'Enabled' : 'Disabled'}`);
    console.log(`  👁️ Vision: ${config.features.enableVision ? 'Enabled' : 'Disabled'}`);
    console.log(`  📄 PDF: ${config.features.enablePDF ? 'Enabled' : 'Disabled'}`);
    console.log('');
  }
}

export const configManager = ConfigManager.getInstance();