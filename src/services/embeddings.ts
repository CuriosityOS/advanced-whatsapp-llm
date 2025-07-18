import OpenAI from 'openai';
import { configManager } from '../utils/config';
import { logger } from '../utils/logger';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
  tokens: number;
}

export interface EmbeddingBatch {
  embeddings: EmbeddingResult[];
  totalTokens: number;
}

export class EmbeddingsService {
  private openai: OpenAI;
  private readonly model = 'text-embedding-3-small'; // More cost-effective than text-embedding-3-large
  private readonly maxTokensPerRequest = 8000;

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      if (!text.trim()) {
        throw new Error('Text cannot be empty');
      }

      logger.embedding(`Generating embedding for text (${text.length} chars)`);
      logger.embeddingProgress(`Using model: ${this.model}`);

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text.trim(),
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding returned from OpenAI');
      }

      const result = {
        embedding: response.data[0]!.embedding,
        text: text.trim(),
        tokens: response.usage?.total_tokens || 0
      };

      logger.embeddingSuccess(`Generated ${result.embedding.length}D embedding (${result.tokens} tokens)`);
      return result;

    } catch (error) {
      logger.error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingBatch> {
    try {
      if (texts.length === 0) {
        return { embeddings: [], totalTokens: 0 };
      }

      // Filter out empty texts
      const validTexts = texts.filter(text => text.trim().length > 0);
      
      if (validTexts.length === 0) {
        return { embeddings: [], totalTokens: 0 };
      }

      logger.embedding(`Starting batch embedding for ${validTexts.length} texts`);
      
      // Process in batches to avoid rate limits
      const batchSize = 100; // OpenAI allows up to 2048 inputs per request
      const results: EmbeddingResult[] = [];
      let totalTokens = 0;
      const totalBatches = Math.ceil(validTexts.length / batchSize);

      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batchIndex = Math.floor(i / batchSize) + 1;
        const batch = validTexts.slice(i, i + batchSize);
        
        logger.embeddingProgress(`Processing batch ${batchIndex}/${totalBatches} (${batch.length} items)`);
        
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float'
        });

        response.data.forEach((item, index) => {
          results.push({
            embedding: item.embedding,
            text: batch[index]!,
            tokens: 0 // Individual token counts not provided in batch
          });
        });

        totalTokens += response.usage?.total_tokens || 0;
        
        logger.embeddingStats(`Batch ${batchIndex} complete - ${response.data.length} embeddings generated`);

        // Add a small delay between batches to be respectful to the API
        if (i + batchSize < validTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.embeddingSuccess(`Batch embedding complete: ${results.length} embeddings generated (${totalTokens} tokens)`);
      
      return {
        embeddings: results,
        totalTokens
      };

    } catch (error) {
      logger.error(`Batch embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

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

  async isServiceHealthy(): Promise<boolean> {
    try {
      const testResponse = await this.openai.embeddings.create({
        model: this.model,
        input: 'health check',
        encoding_format: 'float'
      });
      
      return testResponse.data.length > 0;
    } catch {
      return false;
    }
  }

  getModelInfo(): {
    model: string;
    dimensions: number;
    maxTokens: number;
  } {
    return {
      model: this.model,
      dimensions: 1536, // text-embedding-3-small produces 1536-dimensional vectors
      maxTokens: this.maxTokensPerRequest
    };
  }
}