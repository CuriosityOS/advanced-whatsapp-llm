import { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEmbeddingResult {
  embedding: number[];
  text: string;
  tokens: number;
}

export interface SupabaseEmbeddingBatch {
  embeddings: SupabaseEmbeddingResult[];
  totalTokens: number;
}

/**
 * Supabase-native embeddings service that eliminates OpenAI dependency
 * Uses Supabase's built-in embedding capabilities with pgvector
 */
export class SupabaseEmbeddingsService {
  private supabase: SupabaseClient;
  private readonly model = 'gte-small'; // Supabase's default embedding model
  private readonly dimensions = 384; // GTE-small produces 384-dimensional vectors

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Generate embedding using Supabase's built-in embedding function
   */
  async generateEmbedding(text: string): Promise<SupabaseEmbeddingResult> {
    try {
      if (!text.trim()) {
        throw new Error('Text cannot be empty');
      }

      // Use Supabase's built-in embedding function
      const { data, error } = await this.supabase.rpc('embed', {
        input: text.trim()
      });

      if (error) {
        throw new Error(`Supabase embedding error: ${error.message}`);
      }

      if (!data || !Array.isArray(data)) {
        throw new Error('No embedding returned from Supabase');
      }

      return {
        embedding: data,
        text: text.trim(),
        tokens: this.estimateTokens(text.trim())
      };

    } catch (error) {
      console.error('Supabase embedding generation error:', error);
      throw new Error(`Failed to generate Supabase embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate multiple embeddings in batch
   */
  async generateEmbeddings(texts: string[]): Promise<SupabaseEmbeddingBatch> {
    try {
      if (texts.length === 0) {
        return { embeddings: [], totalTokens: 0 };
      }

      // Filter out empty texts
      const validTexts = texts.filter(text => text.trim().length > 0);
      
      if (validTexts.length === 0) {
        return { embeddings: [], totalTokens: 0 };
      }

      // Process in smaller batches to avoid timeouts
      const batchSize = 50;
      const results: SupabaseEmbeddingResult[] = [];
      let totalTokens = 0;

      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(text => this.generateEmbedding(text));
        const batchResults = await Promise.all(batchPromises);
        
        results.push(...batchResults);
        totalTokens += batchResults.reduce((sum, result) => sum + result.tokens, 0);

        // Add a small delay between batches to be respectful
        if (i + batchSize < validTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        embeddings: results,
        totalTokens
      };

    } catch (error) {
      console.error('Supabase batch embedding generation error:', error);
      throw new Error(`Failed to generate Supabase embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar embeddings using Supabase vector similarity
   */
  async searchSimilar(
    queryEmbedding: number[],
    tableName: string,
    embeddingColumn: string = 'embedding',
    options: {
      limit?: number;
      threshold?: number;
      select?: string;
      filter?: Record<string, any>;
    } = {}
  ): Promise<any[]> {
    const {
      limit = 5,
      threshold = 0.7,
      select = '*',
      filter = {}
    } = options;

    try {
      let query = this.supabase
        .from(tableName)
        .select(select)
        .gte(`1 - (${embeddingColumn} <=> '[${queryEmbedding.join(',')}]')`, threshold)
        .order(`${embeddingColumn} <=> '[${queryEmbedding.join(',')}]'`)
        .limit(limit);

      // Apply filters
      Object.entries(filter).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { data, error } = await query;

      if (error) {
        throw new Error(`Supabase vector search error: ${error.message}`);
      }

      return data || [];

    } catch (error) {
      console.error('Supabase vector search error:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Check if Supabase embeddings service is healthy
   */
  async isServiceHealthy(): Promise<boolean> {
    try {
      const testResult = await this.generateEmbedding('health check');
      return testResult.embedding.length === this.dimensions;
    } catch {
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): {
    model: string;
    dimensions: number;
    provider: string;
  } {
    return {
      model: this.model,
      dimensions: this.dimensions,
      provider: 'supabase'
    };
  }

  /**
   * Create the necessary Supabase function for embeddings if it doesn't exist
   */
  async ensureEmbeddingFunction(): Promise<void> {
    try {
      // Try to create the embedding function
      // This uses Supabase's edge functions or a stored procedure
      const { error } = await this.supabase.rpc('ensure_embedding_function');
      
      if (error && !error.message.includes('already exists')) {
        console.warn('Could not ensure embedding function exists:', error.message);
      }
    } catch (error) {
      console.warn('Embedding function setup warning:', error);
    }
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Create embedding table if it doesn't exist
   */
  async createEmbeddingTable(tableName: string): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('create_embedding_table', {
        table_name: tableName,
        dimensions: this.dimensions
      });

      if (error && !error.message.includes('already exists')) {
        throw new Error(`Failed to create embedding table: ${error.message}`);
      }
    } catch (error) {
      console.error('Error creating embedding table:', error);
      throw error;
    }
  }
}