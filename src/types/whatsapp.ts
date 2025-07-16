import { Message } from 'whatsapp-web.js';

export interface MediaAttachment {
  type: 'image' | 'document' | 'audio' | 'video';
  data: Buffer;
  filename?: string;
  mimetype?: string;
  caption?: string;
}

export interface BotMessage {
  id: string;
  content: string;
  from: string;
  timestamp: number;
  isGroup: boolean;
  groupName?: string;
  senderName?: string;
  hasMedia?: boolean;
  media?: MediaAttachment;
}

export interface BotResponse {
  content: string;
  mentions?: string[];
  quotedMessage?: string;
}

export interface WhatsAppClientConfig {
  puppeteerOptions?: any;
  session?: string;
  restartOnAuthFail?: boolean;
  qrMaxRetries?: number;
}

export interface MessageHandler {
  canHandle(message: BotMessage): boolean;
  handle(message: BotMessage): Promise<BotResponse | null>;
}

export type MessageMiddleware = (message: BotMessage, next: () => Promise<BotResponse | null>) => Promise<BotResponse | null>;