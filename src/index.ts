import { configManager } from './utils/config';
import { ProviderSelector } from './utils/provider-selector';
import { WhatsAppService } from './services/whatsapp';
import { Chatbot } from './bot/chatbot';
import { logger } from './utils/logger';
import { art } from './utils/console-art';

async function main() {
  try {
    // Clear screen and show banner
    console.clear();
    logger.banner('neshauto', '1.0.0');
    logger.newLine();

    logger.bot('🚀 Initializing Advanced WhatsApp AI Chatbot...');
    logger.separator();

    // Interactive provider selection
    logger.subHeader('Provider Selection');
    const { provider, selectedType } = await ProviderSelector.quickSelect();
    
    // Validate configuration for selected provider
    logger.info('Validating configuration...');
    const validation = configManager.validateConfig(selectedType);
    if (!validation.isValid) {
      logger.error('Configuration validation failed:');
      validation.errors.forEach(error => logger.error(`  • ${error}`, { indent: 2 }));
      process.exit(1);
    }
    logger.success('Configuration validated successfully');

    // Print configuration
    logger.subHeader('Configuration Summary');
    configManager.printConfig(selectedType);

    // Initialize WhatsApp service
    logger.separator();
    logger.whatsapp('Initializing WhatsApp Web service...');
    const whatsappService = new WhatsAppService(configManager.config.whatsapp);

    // Initialize chatbot with selected provider and its specific configuration
    logger.provider(`Setting up ${selectedType} provider...`);
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
      logger.database('Supabase database integration enabled');
    }

    logger.bot('Creating chatbot instance...');
    const chatbot = new Chatbot(whatsappService, chatbotConfig);

    // Set up graceful shutdown
    const shutdown = async () => {
      logger.newLine();
      logger.warning('Shutdown signal received - initiating graceful shutdown...');
      try {
        await chatbot.stop();
        logger.success('Chatbot stopped successfully');
        logger.newLine();
        console.log(art.celebration());
        logger.info('Thank you for using WhatsApp LLM Bot! 👋');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the chatbot
    logger.separator();
    logger.bot('🚀 Launching chatbot engine...');
    await chatbot.start();

    // Log success and stats
    chatbot.on('ready', async () => {
      logger.newLine();
      logger.box('🎉 WhatsApp Chatbot Ready!\nScan QR code with WhatsApp mobile app', 'green');
      logger.newLine();
      
      const stats = chatbot.getStats();
      logger.stats('System Statistics', {
        provider: `${art.providerBadge(stats.provider)} ${stats.provider}`,
        'active conversations': stats.activeConversations,
        'total messages': stats.totalMessages,
        'features enabled': Object.values(stats.features).filter(Boolean).length,
        'tools available': stats.features.tools,
        'mcp tools': stats.features.mcpTools,
        'cache status': `${stats.cache.keys} keys, ${stats.cache.hits} hits`
      });

      const advancedStats = await chatbot.getAdvancedStats();
      if (advancedStats) {
        logger.stats('Advanced Statistics', advancedStats);
      }
      
      // Test calculator tool functionality
      logger.separator();
      logger.tool('Running tool system diagnostics...');
      try {
        await chatbot.testCalculatorTool();
        logger.toolSuccess('Tool system operational');
      } catch (error) {
        logger.error(`Tool testing failed: ${error}`);
      }

      logger.separator();
      logger.subHeader('💡 Usage Tips');
      const tips = [
        '📝 Send text messages for AI chat',
        ...(stats.features.vision ? ['🖼️ Send images for vision analysis'] : []),
        ...(stats.features.pdf ? ['📄 Send PDFs for document processing'] : []),
        ...(stats.features.rag ? ['🧠 Ask questions about uploaded documents'] : []),
        ...(stats.features.mcp && stats.features.mcpTools > 0 ? [`🔧 Use MCP tools (${stats.features.mcpTools} available)`] : []),
        '❓ Ask "What tools do you have?" to see available tools',
        '⚠️ Press Ctrl+C to stop the bot'
      ];

      tips.forEach(tip => logger.info(tip, { indent: 2 }));
      
      logger.newLine();
      console.log(art.sparkles());
      logger.success('System ready - awaiting WhatsApp messages...');
    });

    // Log errors
    chatbot.on('error', (error) => {
      logger.error(`Chatbot runtime error: ${error}`);
    });

  } catch (error) {
    logger.error(`Failed to start chatbot: ${error}`);
    console.log(art.errorBox('Startup failed - check configuration and try again'));
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Promise Rejection: ${reason}`);
  logger.debug(`Promise: ${promise}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.debug(`Stack: ${error.stack}`);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error(`Application startup failed: ${error.message}`);
  console.log(art.errorBox('Critical startup error - please check logs and configuration'));
  process.exit(1);
});