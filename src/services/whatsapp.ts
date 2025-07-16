import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { EventEmitter } from 'events';
import { BotMessage, BotResponse, WhatsAppClientConfig, MessageMiddleware, MediaAttachment } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as qrcode from 'qrcode-terminal';

export class WhatsAppService extends EventEmitter {
  private client: Client;
  private config: WhatsAppClientConfig;
  private middlewares: MessageMiddleware[] = [];
  private isReady = false;

  private getBrowserExecutablePath(): string | undefined {
    const platform = os.platform();
    const possiblePaths: string[] = [];

    // Bundled Chromium (preferred - version compatible)
    const bundledChromiumPaths = this.getBundledChromiumPaths();
    possiblePaths.push(...bundledChromiumPaths);

    // Platform-specific system browser paths
    if (platform === 'darwin') {
      // macOS paths
      possiblePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/opt/homebrew/bin/google-chrome-stable',
        '/usr/local/bin/google-chrome-stable'
      );
    } else if (platform === 'linux') {
      // Linux/Ubuntu paths
      possiblePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/snap/bin/google-chrome',
        '/opt/google/chrome/chrome',
        '/usr/local/bin/google-chrome-stable'
      );
    } else if (platform === 'win32') {
      // Windows paths
      possiblePaths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
      );
    }

    for (const browserPath of possiblePaths) {
      if (fs.existsSync(browserPath)) {
        console.log(`🔍 Found browser at: ${browserPath}`);
        return browserPath;
      }
    }

    console.warn('⚠️  No browser executable found. Puppeteer will attempt auto-detection.');
    return undefined;
  }

  private getBundledChromiumPaths(): string[] {
    const platform = os.platform();
    const baseDir = path.join(process.cwd(), 'node_modules/puppeteer-core/.local-chromium');
    
    // Check for different platform-specific Chromium installations
    const possibleVersionDirs = [
      'mac-1045629/chrome-mac/Chromium.app/Contents/MacOS/Chromium',  // macOS
      'linux-1045629/chrome-linux/chrome',  // Linux
      'win32-1045629/chrome-win/chrome.exe', // Windows
      'win64-1045629/chrome-win/chrome.exe'  // Windows 64-bit
    ];

    const bundledPaths: string[] = [];

    // Add platform-appropriate bundled Chromium paths
    for (const versionDir of possibleVersionDirs) {
      const fullPath = path.join(baseDir, versionDir);
      
      // Prioritize current platform paths
      if ((platform === 'darwin' && versionDir.includes('mac-')) ||
          (platform === 'linux' && versionDir.includes('linux-')) ||
          (platform === 'win32' && versionDir.includes('win'))) {
        bundledPaths.unshift(fullPath); // Add to front for priority
      } else {
        bundledPaths.push(fullPath); // Add to end as fallback
      }
    }

    return bundledPaths;
  }

  constructor(config: WhatsAppClientConfig = {}) {
    super();
    this.config = config;
    
    const executablePath = this.getBrowserExecutablePath();
    
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.session || 'default'
      }),
      puppeteer: {
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        ...config.puppeteerOptions
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr) => {
      console.log('\n🔗 QR Code generated. Please scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('\n📱 Scan this QR code with your WhatsApp mobile app to connect!');
      this.emit('qr', qr);
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp Client is ready!');
      this.isReady = true;
      this.emit('ready');
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp Client authenticated');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (message) => {
      console.error('❌ Authentication failed:', message);
      this.emit('auth_failure', message);
      
      if (this.config.restartOnAuthFail) {
        this.restart();
      }
    });

    this.client.on('disconnected', (reason) => {
      console.log('📱 WhatsApp Client disconnected:', reason);
      this.isReady = false;
      this.emit('disconnected', reason);
    });

    this.client.on('message', async (message) => {
      if (this.isReady) {
        await this.handleIncomingMessage(message);
      }
    });
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting WhatsApp Bot...');
      await this.client.initialize();
    } catch (error) {
      console.error('Failed to start WhatsApp client:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      console.log('🛑 Stopping WhatsApp Bot...');
      await this.client.destroy();
      this.isReady = false;
    } catch (error) {
      console.error('Failed to stop WhatsApp client:', error);
      throw error;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start();
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      if (message.fromMe || message.type !== 'chat') {
        return;
      }

      const botMessage = await this.convertToBotMessage(message);
      const response = await this.processMessageWithMiddlewares(botMessage);

      if (response) {
        await this.sendResponse(message, response);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.emit('error', error);
    }
  }

  private async convertToBotMessage(message: Message): Promise<BotMessage> {
    const contact = await message.getContact();
    const chat = await message.getChat();
    
    let media = undefined;
    let hasMedia = false;

    // Handle media messages
    if (message.hasMedia) {
      try {
        const messageMedia = await message.downloadMedia();
        if (messageMedia) {
          hasMedia = true;
          const mediaObj: any = {
            type: this.getMediaType(message.type),
            data: Buffer.from(messageMedia.data, 'base64'),
            mimetype: messageMedia.mimetype
          };

          if (messageMedia.filename) {
            mediaObj.filename = messageMedia.filename;
          }

          if (message.body) {
            mediaObj.caption = message.body;
          }

          media = mediaObj;
        }
      } catch (error) {
        console.error('Error downloading media:', error);
      }
    }
    
    const botMessage: BotMessage = {
      id: message.id.id,
      content: message.body,
      from: message.from,
      timestamp: message.timestamp * 1000,
      isGroup: chat.isGroup,
      senderName: contact.pushname || contact.name || message.from,
      hasMedia
    };

    if (chat.isGroup && chat.name) {
      botMessage.groupName = chat.name;
    }

    if (media) {
      botMessage.media = media;
    }

    return botMessage;
  }

  private getMediaType(messageType: string): 'image' | 'document' | 'audio' | 'video' {
    switch (messageType) {
      case 'image':
        return 'image';
      case 'document':
        return 'document';
      case 'audio':
      case 'ptt':
        return 'audio';
      case 'video':
        return 'video';
      default:
        return 'document';
    }
  }

  private async processMessageWithMiddlewares(message: BotMessage): Promise<BotResponse | null> {
    let index = 0;

    const next = async (): Promise<BotResponse | null> => {
      if (index >= this.middlewares.length) {
        this.emit('message', message);
        return null;
      }

      const middleware = this.middlewares[index++];
      if (middleware) {
        return await middleware(message, next);
      }
      return null;
    };

    return await next();
  }

  private async sendResponse(originalMessage: Message, response: BotResponse): Promise<void> {
    try {
      let options: any = {};

      if (response.quotedMessage) {
        options.quotedMessageId = originalMessage.id.id;
      }

      if (response.mentions && response.mentions.length > 0) {
        options.mentions = response.mentions;
      }

      await originalMessage.reply(response.content, undefined, options);
    } catch (error) {
      console.error('Error sending response:', error);
      throw error;
    }
  }

  addMiddleware(middleware: MessageMiddleware): void {
    this.middlewares.push(middleware);
  }

  removeMiddleware(middleware: MessageMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index > -1) {
      this.middlewares.splice(index, 1);
    }
  }

  isClientReady(): boolean {
    return this.isReady;
  }

  getClient(): Client {
    return this.client;
  }
}