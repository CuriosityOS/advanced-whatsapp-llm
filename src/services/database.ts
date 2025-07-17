import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BotMessage, LLMResponse } from '../types';

export interface User {
  id: string;
  whatsapp_id: string;
  name?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface Conversation {
  id: string;
  user_id: string;
  whatsapp_chat_id: string;
  is_group: boolean;
  group_name?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface Message {
  id: string;
  conversation_id: string;
  whatsapp_message_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens_used?: number;
  model_used?: string;
  provider_used?: string;
  response_time_ms?: number;
  created_at: string;
  metadata: Record<string, any>;
}

export class DatabaseService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async createUser(whatsappId: string, name?: string, phone?: string): Promise<User> {
    const { data, error } = await this.supabase
      .from('users')
      .insert({
        whatsapp_id: whatsappId,
        name,
        phone
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return data as User;
  }

  async getOrCreateUser(whatsappId: string, name?: string): Promise<User> {
    // Try to get existing user
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('*')
      .eq('whatsapp_id', whatsappId)
      .single();

    if (existingUser) {
      // Update name if provided and different
      if (name && existingUser.name !== name) {
        const { data: updatedUser, error } = await this.supabase
          .from('users')
          .update({ name })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (error) {
          console.warn(`Failed to update user name: ${error.message}`);
          return existingUser as User;
        }
        
        return updatedUser as User;
      }
      
      return existingUser as User;
    }

    // Create new user
    return await this.createUser(whatsappId, name);
  }

  async getOrCreateConversation(userId: string, whatsappChatId: string, isGroup: boolean = false, groupName?: string): Promise<Conversation> {
    // Try to get existing conversation
    const { data: existingConversation } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('whatsapp_chat_id', whatsappChatId)
      .single();

    if (existingConversation) {
      return existingConversation as Conversation;
    }

    // Create new conversation
    const { data, error } = await this.supabase
      .from('conversations')
      .insert({
        user_id: userId,
        whatsapp_chat_id: whatsappChatId,
        is_group: isGroup,
        group_name: groupName
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    return data as Conversation;
  }

  async saveMessage(
    conversationId: string,
    whatsappMessageId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    timestamp: Date,
    options: {
      tokensUsed?: number;
      modelUsed?: string;
      providerUsed?: string;
      responseTimeMs?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<Message> {
    // First try to find existing message
    const { data: existingMessage } = await this.supabase
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', whatsappMessageId)
      .single();

    if (existingMessage) {
      return existingMessage as Message;
    }

    // If not found, insert new message
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        whatsapp_message_id: whatsappMessageId,
        role,
        content,
        timestamp: timestamp.toISOString(),
        tokens_used: options.tokensUsed,
        model_used: options.modelUsed,
        provider_used: options.providerUsed,
        response_time_ms: options.responseTimeMs,
        metadata: options.metadata || {}
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save message: ${error.message}`);
    }

    return data as Message;
  }

  async saveUserMessage(botMessage: BotMessage): Promise<{ user: User; conversation: Conversation; message: Message }> {
    try {
      // Get or create user
      const user = await this.getOrCreateUser(botMessage.from, botMessage.senderName);

      // Get or create conversation
      const conversation = await this.getOrCreateConversation(
        user.id,
        botMessage.from,
        botMessage.isGroup,
        botMessage.groupName
      );

      // Save message
      const message = await this.saveMessage(
        conversation.id,
        botMessage.id,
        'user',
        botMessage.content,
        new Date(botMessage.timestamp)
      );

      return { user, conversation, message };
    } catch (error) {
      console.error('Error saving user message:', error);
      throw error;
    }
  }

  async saveBotResponse(
    conversationId: string,
    responseId: string,
    content: string,
    llmResponse: LLMResponse,
    providerUsed: string,
    modelUsed: string,
    responseTimeMs: number
  ): Promise<Message> {
    return await this.saveMessage(
      conversationId,
      responseId,
      'assistant',
      content,
      new Date(),
      {
        tokensUsed: llmResponse.usage?.totalTokens || 0,
        modelUsed,
        providerUsed,
        responseTimeMs,
        metadata: {
          usage: llmResponse.usage
        }
      }
    );
  }

  async getConversationHistory(conversationId: string, limit: number = 20): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get conversation history: ${error.message}`);
    }

    return (data as Message[]).reverse(); // Return in chronological order
  }

  async getUserStats(userId: string): Promise<{
    totalMessages: number;
    totalConversations: number;
    totalTokensUsed: number;
    firstMessageDate: string | null;
    lastMessageDate: string | null;
  }> {
    const { data: conversations } = await this.supabase
      .from('conversations')
      .select('id')
      .eq('user_id', userId);

    if (!conversations || conversations.length === 0) {
      return {
        totalMessages: 0,
        totalConversations: 0,
        totalTokensUsed: 0,
        firstMessageDate: null,
        lastMessageDate: null
      };
    }

    const conversationIds = conversations.map(c => c.id);

    const { data: messageStats } = await this.supabase
      .from('messages')
      .select('tokens_used, timestamp')
      .in('conversation_id', conversationIds);

    if (!messageStats) {
      return {
        totalMessages: 0,
        totalConversations: conversations.length,
        totalTokensUsed: 0,
        firstMessageDate: null,
        lastMessageDate: null
      };
    }

    const totalTokensUsed = messageStats.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0);
    const timestamps = messageStats.map(msg => msg.timestamp).sort();

    return {
      totalMessages: messageStats.length,
      totalConversations: conversations.length,
      totalTokensUsed,
      firstMessageDate: timestamps[0] || null,
      lastMessageDate: timestamps[timestamps.length - 1] || null
    };
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalConversations: number;
    totalMessages: number;
    totalTokensUsed: number;
    activeUsersLast24h: number;
  }> {
    const [
      { count: totalUsers },
      { count: totalConversations },
      { count: totalMessages },
      { data: tokenData },
      { count: activeUsers }
    ] = await Promise.all([
      this.supabase.from('users').select('*', { count: 'exact', head: true }),
      this.supabase.from('conversations').select('*', { count: 'exact', head: true }),
      this.supabase.from('messages').select('*', { count: 'exact', head: true }),
      this.supabase.from('messages').select('tokens_used'),
      this.supabase.from('messages')
        .select('conversation_id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    const totalTokensUsed = tokenData?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) || 0;

    return {
      totalUsers: totalUsers || 0,
      totalConversations: totalConversations || 0,
      totalMessages: totalMessages || 0,
      totalTokensUsed,
      activeUsersLast24h: activeUsers || 0
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('users').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}