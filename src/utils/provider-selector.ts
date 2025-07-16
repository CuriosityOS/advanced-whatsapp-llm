import readline from 'readline';
import { LLMProvider } from '../types';
import { AnthropicProvider, OpenRouterProvider } from '../providers';
import { configManager } from './config';

export interface ProviderSelectionResult {
  provider: LLMProvider;
  selectedType: 'anthropic' | 'openrouter';
}

export class ProviderSelector {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async selectProvider(): Promise<ProviderSelectionResult> {
    console.log('🤖 WhatsApp Chatbot Setup');
    console.log('==========================');
    console.log('Available LLM Providers:');
    console.log('1. Anthropic (Claude)');
    console.log('2. OpenRouter (Multiple Models)');
    console.log('');

    const choice = await this.askQuestion('Select your preferred LLM provider (1 or 2): ');
    
    let selectedType: 'anthropic' | 'openrouter';
    let provider: LLMProvider;

    switch (choice.trim()) {
      case '1':
        selectedType = 'anthropic';
        provider = await this.setupAnthropicProvider();
        break;
      case '2':
        selectedType = 'openrouter';
        provider = await this.setupOpenRouterProvider();
        break;
      default:
        console.log('❌ Invalid choice. Defaulting to Anthropic...');
        selectedType = 'anthropic';
        provider = await this.setupAnthropicProvider();
        break;
    }

    this.rl.close();
    return { provider, selectedType };
  }

  private async setupAnthropicProvider(): Promise<AnthropicProvider> {
    console.log('\n🔧 Setting up Anthropic (Claude) Provider...');
    
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables. Please add it to your .env file.');
    }

    console.log('✅ Anthropic API key found in environment');
    
    const config = configManager.config;
    const defaultModel = config.models.anthropic.model;
    const defaultMaxTokens = config.models.anthropic.maxTokens;
    const defaultTemperature = config.models.anthropic.temperature;
    
    console.log(`📋 Current Anthropic Configuration:`);
    console.log(`   Model: ${defaultModel}`);
    console.log(`   Max Tokens: ${defaultMaxTokens}`);
    console.log(`   Temperature: ${defaultTemperature}`);
    
    const useDefault = await this.askQuestion('Use current configuration? (y/n, default: y): ');
    
    if (useDefault.trim().toLowerCase() === 'n') {
      const model = await this.askQuestion(`Enter Claude model (default: ${defaultModel}): `);
      const selectedModel = model.trim() || defaultModel;
      console.log(`🔄 Model updated to: ${selectedModel}`);
    }
    
    console.log(`🚀 Using Anthropic with configured settings`);
    
    return new AnthropicProvider(anthropicKey);
  }

  private async setupOpenRouterProvider(): Promise<OpenRouterProvider> {
    console.log('\n🔧 Setting up OpenRouter Provider...');
    
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    
    if (!openRouterKey) {
      throw new Error('OPENROUTER_API_KEY not found in environment variables. Please add it to your .env file.');
    }

    console.log('✅ OpenRouter API key found in environment');
    
    const config = configManager.config;
    const defaultModel = config.models.openrouter.model;
    const defaultMaxTokens = config.models.openrouter.maxTokens;
    const defaultTemperature = config.models.openrouter.temperature;
    
    console.log(`📋 Current OpenRouter Configuration:`);
    console.log(`   Model: ${defaultModel}`);
    console.log(`   Max Tokens: ${defaultMaxTokens}`);
    console.log(`   Temperature: ${defaultTemperature}`);
    
    const useDefault = await this.askQuestion('Use current configuration? (y/n, default: y): ');
    
    if (useDefault.trim().toLowerCase() === 'n') {
      const model = await this.askQuestion(`Enter model (default: ${defaultModel}): `);
      const selectedModel = model.trim() || defaultModel;
      console.log(`🔄 Model updated to: ${selectedModel}`);
    }
    
    console.log(`🚀 Using OpenRouter with configured settings`);
    
    return new OpenRouterProvider(openRouterKey);
  }

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  static async quickSelect(): Promise<ProviderSelectionResult> {
    const selector = new ProviderSelector();
    return await selector.selectProvider();
  }
}