import { EmbeddingsService, EmbeddingResult, EmbeddingBatch } from './embeddings';
import { SupabaseEmbeddingsService, SupabaseEmbeddingResult, SupabaseEmbeddingBatch } from './supabase-embeddings';
import { SupabaseClient } from '@supabase/supabase-js';

export type EmbeddingProvider = 'openai' | 'supabase';

export interface HybridEmbeddingConfig {
  provider: EmbeddingProvider;
  openaiApiKey?: string;
  supabaseClient?: SupabaseClient;
  fallbackProvider?: EmbeddingProvider;
}

/**
 * Unified embeddings service that supports both OpenAI and Supabase embeddings
 * Provides seamless switching between providers and fallback capabilities
 */
export class HybridEmbeddingsService {
  private openaiService?: EmbeddingsService;
  private supabaseService?: SupabaseEmbeddingsService;
  private primaryProvider: EmbeddingProvider;
  private fallbackProvider?: EmbeddingProvider;

  constructor(config: HybridEmbeddingConfig) {
    this.primaryProvider = config.provider;
    if (config.fallbackProvider) {
      this.fallbackProvider = config.fallbackProvider;
    }

    // Initialize OpenAI service if API key is provided
    if (config.openaiApiKey) {
      this.openaiService = new EmbeddingsService(config.openaiApiKey);
    }

    // Initialize Supabase service if client is provided
    if (config.supabaseClient) {
      this.supabaseService = new SupabaseEmbeddingsService(config.supabaseClient);
    }

    console.log(`🧠 Hybrid Embeddings initialized - Primary: ${this.primaryProvider}, Fallback: ${this.fallbackProvider || 'none'}`);
  }

  /**
   * Generate a single embedding using the configured provider
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      return await this.tryGenerateEmbedding(text, this.primaryProvider);
    } catch (error) {
      if (this.fallbackProvider) {
        console.warn(`Primary embedding provider (${this.primaryProvider}) failed, trying fallback (${this.fallbackProvider})`);
        try {
          return await this.tryGenerateEmbedding(text, this.fallbackProvider);
        } catch (fallbackError) {
          throw new Error(`Both embedding providers failed. Primary: ${error instanceof Error ? error.message : 'Unknown'}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate multiple embeddings in batch
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingBatch> {
    try {
      return await this.tryGenerateEmbeddings(texts, this.primaryProvider);
    } catch (error) {
      if (this.fallbackProvider) {
        console.warn(`Primary embedding provider (${this.primaryProvider}) failed for batch, trying fallback (${this.fallbackProvider})`);
        try {
          return await this.tryGenerateEmbeddings(texts, this.fallbackProvider);
        } catch (fallbackError) {
          throw new Error(`Both embedding providers failed for batch. Primary: ${error instanceof Error ? error.message : 'Unknown'}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Try to generate embedding with specific provider
   */
  private async tryGenerateEmbedding(text: string, provider: EmbeddingProvider): Promise<EmbeddingResult> {
    switch (provider) {
      case 'openai':
        if (!this.openaiService) {
          throw new Error('OpenAI embeddings service not initialized');
        }
        return await this.openaiService.generateEmbedding(text);

      case 'supabase':
        if (!this.supabaseService) {
          throw new Error('Supabase embeddings service not initialized');
        }
        const supabaseResult = await this.supabaseService.generateEmbedding(text);
        return this.convertSupabaseResult(supabaseResult);

      default:
        throw new Error(`Unknown embedding provider: ${provider}`);
    }
  }

  /**
   * Try to generate embeddings batch with specific provider
   */
  private async tryGenerateEmbeddings(texts: string[], provider: EmbeddingProvider): Promise<EmbeddingBatch> {
    switch (provider) {
      case 'openai':
        if (!this.openaiService) {
          throw new Error('OpenAI embeddings service not initialized');
        }
        return await this.openaiService.generateEmbeddings(texts);

      case 'supabase':
        if (!this.supabaseService) {
          throw new Error('Supabase embeddings service not initialized');
        }
        const supabaseBatch = await this.supabaseService.generateEmbeddings(texts);
        return this.convertSupabaseBatch(supabaseBatch);

      default:
        throw new Error(`Unknown embedding provider: ${provider}`);
    }
  }

  /**
   * Convert Supabase result to standard format
   */
  private convertSupabaseResult(result: SupabaseEmbeddingResult): EmbeddingResult {
    return {
      embedding: result.embedding,
      text: result.text,
      tokens: result.tokens
    };
  }

  /**
   * Convert Supabase batch to standard format
   */
  private convertSupabaseBatch(batch: SupabaseEmbeddingBatch): EmbeddingBatch {
    return {
      embeddings: batch.embeddings.map(this.convertSupabaseResult),
      totalTokens: batch.totalTokens
    };
  }

  /**
   * Check if the service is healthy
   */
  async isServiceHealthy(): Promise<boolean> {
    try {
      await this.generateEmbedding('health check');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get information about the current embedding provider
   */
  getModelInfo(): {
    primaryProvider: EmbeddingProvider;
    fallbackProvider?: EmbeddingProvider;
    model: string;
    dimensions: number;
    maxTokens?: number;
  } {
    const primaryService = this.getService(this.primaryProvider);
    
    if (this.primaryProvider === 'openai' && this.openaiService) {
      const info = this.openaiService.getModelInfo();
      const result: ReturnType<typeof this.getModelInfo> = {
        primaryProvider: this.primaryProvider,
        model: info.model,
        dimensions: info.dimensions,
        maxTokens: info.maxTokens
      };
      if (this.fallbackProvider) {
        result.fallbackProvider = this.fallbackProvider;
      }
      return result;
    } else if (this.primaryProvider === 'supabase' && this.supabaseService) {
      const info = this.supabaseService.getModelInfo();
      const result: ReturnType<typeof this.getModelInfo> = {
        primaryProvider: this.primaryProvider,
        model: info.model,
        dimensions: info.dimensions
      };
      if (this.fallbackProvider) {
        result.fallbackProvider = this.fallbackProvider;
      }
      return result;
    } else {
      const result: ReturnType<typeof this.getModelInfo> = {
        primaryProvider: this.primaryProvider,
        model: 'unknown',
        dimensions: 1536 // Default to OpenAI dimensions
      };
      if (this.fallbackProvider) {
        result.fallbackProvider = this.fallbackProvider;
      }
      return result;
    }
  }

  /**
   * Switch to a different primary provider
   */
  switchProvider(newProvider: EmbeddingProvider): void {
    if (newProvider === 'openai' && !this.openaiService) {
      throw new Error('Cannot switch to OpenAI: service not initialized');
    }
    if (newProvider === 'supabase' && !this.supabaseService) {
      throw new Error('Cannot switch to Supabase: service not initialized');
    }

    this.primaryProvider = newProvider;
    console.log(`🔄 Switched embedding provider to: ${newProvider}`);
  }

  /**
   * Get the service instance for a provider
   */
  private getService(provider: EmbeddingProvider): EmbeddingsService | SupabaseEmbeddingsService | null {
    switch (provider) {
      case 'openai':
        return this.openaiService || null;
      case 'supabase':
        return this.supabaseService || null;
      default:
        return null;
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): EmbeddingProvider[] {
    const providers: EmbeddingProvider[] = [];
    if (this.openaiService) providers.push('openai');
    if (this.supabaseService) providers.push('supabase');
    return providers;
  }

  /**
   * Setup Supabase embeddings infrastructure
   */
  async setupSupabaseEmbeddings(): Promise<void> {
    if (!this.supabaseService) {
      throw new Error('Supabase embeddings service not initialized');
    }
    
    await this.supabaseService.ensureEmbeddingFunction();
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    return EmbeddingsService.cosineSimilarity(a, b);
  }
}