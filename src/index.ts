import { configManager } from './utils/config';
import { ProviderSelector } from './utils/provider-selector';
import { WhatsAppService } from './services/whatsapp';
import { Chatbot } from './bot/chatbot';

async function main() {
  try {
    console.log('🤖 WhatsApp Chatbot Starting...\n');

    // Interactive provider selection
    const { provider, selectedType } = await ProviderSelector.quickSelect();
    
    // Validate configuration for selected provider
    const validation = configManager.validateConfig(selectedType);
    if (!validation.isValid) {
      console.error('❌ Configuration errors:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    // Print configuration
    configManager.printConfig(selectedType);

    // Initialize WhatsApp service
    console.log('🔧 Initializing WhatsApp service...');
    const whatsappService = new WhatsAppService(configManager.config.whatsapp);

    // Initialize chatbot with selected provider and its specific configuration
    console.log(`🔧 Initializing chatbot with ${selectedType} provider...`);
    const modelConfig = configManager.config.models[selectedType];
    const chatbotConfig: any = {
      llmProvider: provider,
      systemPrompt: configManager.config.bot.systemPrompt,
      maxTokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      enableLogging: configManager.config.bot.enableLogging,
      rateLimit: configManager.config.bot.rateLimit,
      openaiApiKey: configManager.config.openai?.apiKey,
      enableRAG: configManager.config.features.enableRAG,
      enableVision: configManager.config.features.enableVision,
      enablePDF: configManager.config.features.enablePDF,
      enableMCP: configManager.config.features.enableMCP,
      mcpServers: configManager.config.mcp?.servers,
      cacheConfig: {
        ttlSeconds: 3600, // 1 hour
        maxKeys: 1000
      }
    };

    if (configManager.config.supabase) {
      chatbotConfig.supabase = configManager.config.supabase;
    }

    const chatbot = new Chatbot(whatsappService, chatbotConfig);

    // Set up graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down gracefully...');
      try {
        await chatbot.stop();
        console.log('✅ Chatbot stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the chatbot
    console.log('🚀 Starting chatbot...');
    await chatbot.start();

    // Log success and stats
    chatbot.on('ready', async () => {
      console.log('\n✅ WhatsApp Chatbot is ready to receive messages!');
      
      const stats = chatbot.getStats();
      console.log('📊 Basic Stats:', {
        provider: stats.provider,
        conversations: stats.activeConversations,
        features: stats.features
      });

      const advancedStats = await chatbot.getAdvancedStats();
      if (advancedStats) {
        console.log('🔧 Advanced Stats:', advancedStats);
      }
      
      // Test calculator tool functionality
      console.log('\n🔧 Testing tool functionality...');
      try {
        await chatbot.testCalculatorTool();
      } catch (error) {
        console.error('❌ Tool testing failed:', error);
      }

      console.log('\n💡 Tips:');
      console.log('  - Send text messages for chat');
      if (stats.features.vision) {
        console.log('  - Send images for vision analysis');
      }
      if (stats.features.pdf) {
        console.log('  - Send PDFs for document processing');
      }
      if (stats.features.rag) {
        console.log('  - Ask questions about uploaded documents');
      }
      if (stats.features.mcp && stats.features.mcpTools > 0) {
        console.log(`  - Use MCP tools (${stats.features.mcpTools} available)`);
      }
      console.log('  - Ask "What tools do you have?" to see available tools');
      console.log('  - Press Ctrl+C to stop the bot');
    });

    // Log errors
    chatbot.on('error', (error) => {
      console.error('🚨 Chatbot error:', error);
    });

  } catch (error) {
    console.error('💥 Failed to start chatbot:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('💥 Application failed to start:', error);
  process.exit(1);
});