import { VectorService, SearchResult } from './vector';
import { EmbeddingsService } from './embeddings';
import { PDFService, PDFProcessingResult } from './pdf';
import { VisionService } from './vision';
import { BotMessage, MediaAttachment } from '../types/whatsapp';
import { LLMMessage, LLMProvider, LLMGenerationOptions } from '../types/llm';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface RAGContext {
  query: string;
  relevantContent: SearchResult[];
  totalSources: number;
  searchTime: number;
}

export interface RAGResponse {
  answer: string;
  context: RAGContext;
  tokensUsed: number;
  sources: string[];
}

export interface DocumentProcessingResult {
  success: boolean;
  documentId?: string;
  chunksCreated: number;
  error?: string;
  processingTime: number;
}

export class RAGService {
  private vectorService: VectorService;
  private embeddingsService: EmbeddingsService;
  private llmProvider: LLMProvider;
  private searchCache: Map<string, { results: SearchResult[], timestamp: number }> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(
    vectorService: VectorService,
    embeddingsService: EmbeddingsService,
    llmProvider: LLMProvider
  ) {
    this.vectorService = vectorService;
    this.embeddingsService = embeddingsService;
    this.llmProvider = llmProvider;
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 10 * 60 * 1000); // Every 10 minutes
  }

  async processDocument(
    userId: string,
    conversationId: string,
    media: MediaAttachment
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now();

    try {
      logger.rag(`Processing document: ${media.filename || 'Unknown'} (${media.type})`);
      
      let contentText = '';
      let processingResult: PDFProcessingResult | null = null;

      // Process based on media type
      if (media.type === 'document' && PDFService.isPDFFile(media)) {
        logger.embeddingProgress('Extracting text from PDF...');
        processingResult = await PDFService.processPDF(media);
        if (processingResult.success) {
          contentText = processingResult.text;
          logger.embeddingStats(`PDF processed: ${contentText.length} characters extracted`);
        } else {
          logger.error(`PDF processing failed: ${processingResult.error}`);
          return {
            success: false,
            chunksCreated: 0,
            error: processingResult.error || 'Unknown processing error',
            processingTime: Date.now() - startTime
          };
        }
      } else if (media.type === 'image' && VisionService.isImageSupported(media.mimetype || '')) {
        // For images, we'll store them but not create embeddings unless there's text content
        contentText = media.caption || '';
        logger.embeddingProgress(`Image processed with caption: ${contentText.length} chars`);
      } else {
        logger.error(`Unsupported file type: ${media.type}`);
        return {
          success: false,
          chunksCreated: 0,
          error: `Unsupported file type: ${media.type}`,
          processingTime: Date.now() - startTime
        };
      }

      // Store the document
      logger.vector('Storing document metadata...');
      const document = await this.vectorService.storeDocument(
        userId,
        conversationId,
        media,
        contentText
      );

      let chunksCreated = 0;

      // Create chunks and embeddings for text content
      if (contentText.trim().length > 0) {
        logger.embedding('Creating embeddings for document content...');
        const chunks = await this.vectorService.storeDocumentChunks(
          document.id,
          contentText
        );
        chunksCreated = chunks.length;
      }

      const processingTime = Date.now() - startTime;
      logger.embeddingSuccess(`Document processing complete: ${chunksCreated} chunks created in ${processingTime}ms`);

      return {
        success: true,
        documentId: document.id,
        chunksCreated,
        processingTime
      };

    } catch (error) {
      logger.error(`Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  async generateRAGResponse(
    query: string,
    userId: string,
    options: {
      conversationHistory?: LLMMessage[];
      maxSources?: number;
      similarityThreshold?: number;
      includeDocuments?: boolean;
      includeKnowledgeBase?: boolean;
    } = {}
  ): Promise<RAGResponse> {
    const {
      conversationHistory = [],
      maxSources = 5,
      similarityThreshold = 0.7,
      includeDocuments = true,
      includeKnowledgeBase = true
    } = options;

    const searchStartTime = Date.now();

    try {
      logger.rag(`Generating RAG response for query: "${query.substring(0, 50)}..."`);
      
      // Search for relevant content
      const relevantContent = await this.vectorService.searchSimilarContent(
        query,
        {
          limit: maxSources,
          threshold: similarityThreshold,
          userId,
          includeDocuments,
          includeKnowledgeBase
        }
      );

      const searchTime = Date.now() - searchStartTime;
      logger.embeddingStats(`Found ${relevantContent.length} relevant sources in ${searchTime}ms`);

      // Build context for the LLM
      const context = this.buildRAGContext(query, relevantContent, searchTime);
      
      logger.rag('Generating contextual response with LLM...');
      // Generate response with context
      const response = await this.generateContextualResponse(
        query,
        context,
        conversationHistory
      );

      logger.embeddingSuccess(`RAG response generated: ${response.usage?.totalTokens || 0} tokens used`);

      return {
        answer: response.content,
        context,
        tokensUsed: response.usage?.totalTokens || 0,
        sources: this.extractSources(relevantContent)
      };

    } catch (error) {
      logger.error(`RAG response generation failed: ${error}`);
      throw error;
    }
  }

  async handleMultimodalMessage(
    message: BotMessage,
    userId: string,
    conversationHistory: LLMMessage[] = []
  ): Promise<{
    response: string;
    documentProcessed?: DocumentProcessingResult;
    ragContext?: RAGContext;
    tokensUsed: number;
  }> {
    try {
      let documentProcessed: DocumentProcessingResult | undefined;
      let ragContext: RAGContext | undefined;

      // Process attached media if present
      if (message.hasMedia && message.media) {
        documentProcessed = await this.processDocument(
          userId,
          message.from, // Using from as conversation ID for now
          message.media
        );
      }

      // Determine if we should use RAG
      const shouldUseRAG = this.shouldUseRAG(message.content);

      let llmResponse;
      if (shouldUseRAG) {
        // Use RAG for complex queries
        const ragResponse = await this.generateRAGResponse(
          message.content,
          userId,
          { conversationHistory }
        );
        
        llmResponse = { content: ragResponse.answer, usage: { totalTokens: ragResponse.tokensUsed } };
        ragContext = ragResponse.context;
      } else {
        // Direct LLM response for simple queries
        const messages: LLMMessage[] = [
          ...conversationHistory,
          {
            role: 'user',
            content: message.hasMedia && message.media 
              ? VisionService.createMultimodalContent(message.content, message.media)
              : message.content
          }
        ];

        llmResponse = await this.llmProvider.generateResponse(messages);
      }

      // Add document processing info to response if applicable
      let responseText = llmResponse.content;
      if (documentProcessed?.success) {
        responseText += `\n\n📄 Document processed successfully! Created ${documentProcessed.chunksCreated} searchable chunks.`;
      } else if (documentProcessed?.error) {
        responseText += `\n\n⚠️ Document processing failed: ${documentProcessed.error}`;
      }

      const result: any = {
        response: responseText,
        tokensUsed: llmResponse.usage?.totalTokens || 0
      };

      if (documentProcessed) {
        result.documentProcessed = documentProcessed;
      }

      if (ragContext) {
        result.ragContext = ragContext;
      }

      return result;

    } catch (error) {
      console.error('Multimodal message handling error:', error);
      throw error;
    }
  }

  private shouldUseRAG(query: string): boolean {
    // Simple heuristics to determine if RAG should be used
    const ragKeywords = [
      'search', 'find', 'look for', 'document', 'file', 'pdf',
      'tell me about', 'what is', 'explain', 'summarize',
      'show me', 'analyze', 'compare', 'research'
    ];

    const queryLower = query.toLowerCase();
    return ragKeywords.some(keyword => queryLower.includes(keyword)) || query.length > 100;
  }

  private buildRAGContext(
    query: string,
    relevantContent: SearchResult[],
    searchTime: number
  ): RAGContext {
    return {
      query,
      relevantContent,
      totalSources: relevantContent.length,
      searchTime
    };
  }

  private async generateContextualResponse(
    query: string,
    context: RAGContext,
    conversationHistory: LLMMessage[]
  ): Promise<{ content: string; usage?: { totalTokens: number } }> {
    // Build context string from relevant content
    const contextString = context.relevantContent.length > 0
      ? context.relevantContent
          .map((result, index) => {
            const source = result.source === 'document' 
              ? `Document: ${result.metadata.filename || 'Unknown'}`
              : `Knowledge Base: ${result.metadata.title || 'Unknown'}`;
            
            return `[${index + 1}] ${source} (Similarity: ${(result.similarity * 100).toFixed(1)}%)\n${result.content}`;
          })
          .join('\n\n---\n\n')
      : 'No relevant context found.';

    const systemPrompt = `You are a helpful AI assistant with access to relevant context from documents and knowledge base. 

Use the following context to answer the user's question. If the context doesn't contain relevant information, say so and answer based on your general knowledge.

Context:
${contextString}

Guidelines:
1. Answer the question directly and helpfully
2. Cite sources when using information from the context
3. If context is not relevant, clearly state that and provide a general answer
4. Be concise but comprehensive
5. If dealing with multiple sources, synthesize the information appropriately`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: query }
    ];

    return await this.llmProvider.generateResponse(messages);
  }

  private extractSources(relevantContent: SearchResult[]): string[] {
    return relevantContent.map(result => {
      if (result.source === 'document') {
        return result.metadata.filename || 'Unknown Document';
      } else {
        return result.metadata.title || 'Knowledge Base';
      }
    });
  }

  async addKnowledgeBaseEntry(
    title: string,
    content: string,
    source?: string,
    tags: string[] = []
  ): Promise<void> {
    await this.vectorService.addToKnowledgeBase(title, content, source, tags);
  }

  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    totalKnowledgeBase: number;
    storageSize: string;
  }> {
    const stats = await this.vectorService.getStorageStats();
    return {
      ...stats,
      storageSize: this.formatBytes(stats.storageSize)
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Performance optimization methods
  private generateCacheKey(query: string, userId: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    return crypto.createHash('md5').update(`${query}:${userId}:${optionsStr}`).digest('hex');
  }

  private async getCachedSearch(cacheKey: string): Promise<SearchResult[] | null> {
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.results;
    }
    return null;
  }

  private setCachedSearch(cacheKey: string, results: SearchResult[]): void {
    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });
  }

  private async getCachedEmbedding(text: string): Promise<number[] | null> {
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    return this.embeddingCache.get(textHash) || null;
  }

  private setCachedEmbedding(text: string, embedding: number[]): void {
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    this.embeddingCache.set(textHash, embedding);
  }

  private cleanCache(): void {
    const now = Date.now();
    
    // Clean search cache
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.searchCache.delete(key);
      }
    }
    
    // Limit embedding cache size
    if (this.embeddingCache.size > 1000) {
      const keys = Array.from(this.embeddingCache.keys());
      const keysToDelete = keys.slice(0, keys.length - 800); // Keep latest 800
      keysToDelete.forEach(key => this.embeddingCache.delete(key));
    }
    
    logger.embeddingStats(`Cache cleaned: ${this.searchCache.size} search entries, ${this.embeddingCache.size} embedding entries`);
  }

  // Batch processing for better performance
  async processMultipleDocuments(
    documents: Array<{
      userId: string;
      conversationId: string;
      media: MediaAttachment;
    }>
  ): Promise<DocumentProcessingResult[]> {
    logger.rag(`Starting batch processing for ${documents.length} documents`);
    logger.embedding('Processing documents in parallel...');
    
    const results = await Promise.allSettled(
      documents.map(doc => 
        this.processDocument(doc.userId, doc.conversationId, doc.media)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    logger.embeddingSuccess(`Batch processing complete: ${successCount}/${documents.length} documents processed successfully`);

    return results.map((result, index) => 
      result.status === 'fulfilled' 
        ? result.value
        : {
            success: false,
            chunksCreated: 0,
            error: `Batch processing failed: ${result.reason}`,
            processingTime: 0
          }
    );
  }

  getCacheStats(): {
    searchCacheSize: number;
    embeddingCacheSize: number;
    cacheHitRate: number;
  } {
    return {
      searchCacheSize: this.searchCache.size,
      embeddingCacheSize: this.embeddingCache.size,
      cacheHitRate: 0 // Would need to track hits/misses for accurate calculation
    };
  }
}