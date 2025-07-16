import { SupabaseClient } from '@supabase/supabase-js';
import { EmbeddingsService, EmbeddingResult } from './embeddings';
import { PDFService } from './pdf';
import { MediaAttachment } from '../types/whatsapp';

export interface Document {
  id: string;
  user_id: string;
  conversation_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  content_text?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  token_count?: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  title: string;
  content: string;
  embedding?: number[];
  source?: string;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  content: string;
  similarity: number;
  metadata: Record<string, any>;
  source: 'document' | 'knowledge_base';
  document_id?: string;
  chunk_id?: string;
  kb_id?: string;
}

export class VectorService {
  private supabase: SupabaseClient;
  private embeddings: EmbeddingsService;

  constructor(supabase: SupabaseClient, embeddingsService: EmbeddingsService) {
    this.supabase = supabase;
    this.embeddings = embeddingsService;
  }

  async storeDocument(
    userId: string,
    conversationId: string,
    media: MediaAttachment,
    contentText?: string
  ): Promise<Document> {
    try {
      const { data: document, error } = await this.supabase
        .from('documents')
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          filename: media.filename || 'unknown',
          file_type: media.type,
          file_size: media.data.length,
          content_text: contentText,
          metadata: {
            mimetype: media.mimetype,
            caption: media.caption
          }
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store document: ${error.message}`);
      }

      return document as Document;
    } catch (error) {
      console.error('Document storage error:', error);
      throw error;
    }
  }

  async storeDocumentChunks(
    documentId: string,
    content: string,
    chunkSize: number = 1000,
    overlap: number = 200
  ): Promise<DocumentChunk[]> {
    try {
      const chunks = PDFService.createChunks(content, chunkSize, overlap);
      const embeddings = await this.embeddings.generateEmbeddings(chunks);

      const chunkData = chunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: index,
        content: chunk,
        embedding: embeddings.embeddings[index]?.embedding,
        token_count: embeddings.embeddings[index]?.tokens || 0,
        metadata: {
          chunk_size: chunk.length,
          total_chunks: chunks.length
        }
      }));

      const { data, error } = await this.supabase
        .from('document_chunks')
        .insert(chunkData)
        .select();

      if (error) {
        throw new Error(`Failed to store document chunks: ${error.message}`);
      }

      return data as DocumentChunk[];
    } catch (error) {
      console.error('Document chunks storage error:', error);
      throw error;
    }
  }

  async addToKnowledgeBase(
    title: string,
    content: string,
    source?: string,
    tags: string[] = []
  ): Promise<KnowledgeBase> {
    try {
      const embedding = await this.embeddings.generateEmbedding(content);

      const { data, error } = await this.supabase
        .from('knowledge_base')
        .insert({
          title,
          content,
          embedding: embedding.embedding,
          source,
          tags,
          metadata: {
            tokens: embedding.tokens,
            content_length: content.length
          }
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add to knowledge base: ${error.message}`);
      }

      return data as KnowledgeBase;
    } catch (error) {
      console.error('Knowledge base storage error:', error);
      throw error;
    }
  }

  async searchSimilarContent(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      userId?: string;
      includeDocuments?: boolean;
      includeKnowledgeBase?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 5,
      threshold = 0.7,
      userId,
      includeDocuments = true,
      includeKnowledgeBase = true
    } = options;

    try {
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      const results: SearchResult[] = [];

      // Search document chunks
      if (includeDocuments) {
        let documentQuery = this.supabase
          .from('document_chunks')
          .select(`
            *,
            documents!inner(user_id, filename, file_type, created_at)
          `);

        if (userId) {
          documentQuery = documentQuery.eq('documents.user_id', userId);
        }

        const { data: documentChunks, error: docError } = await documentQuery
          .gte('1 - (embedding <=> $1)', threshold)
          .order('embedding <=> $1')
          .limit(limit);

        if (docError) {
          console.error('Document search error:', docError);
        } else if (documentChunks) {
          documentChunks.forEach((chunk: any) => {
            const similarity = 1 - (chunk.embedding as any);
            results.push({
              content: chunk.content,
              similarity,
              metadata: {
                ...chunk.metadata,
                filename: chunk.documents.filename,
                file_type: chunk.documents.file_type,
                chunk_index: chunk.chunk_index
              },
              source: 'document',
              document_id: chunk.document_id,
              chunk_id: chunk.id
            });
          });
        }
      }

      // Search knowledge base
      if (includeKnowledgeBase) {
        const { data: kbItems, error: kbError } = await this.supabase
          .from('knowledge_base')
          .select('*')
          .gte('1 - (embedding <=> $1)', threshold)
          .order('embedding <=> $1')
          .limit(limit);

        if (kbError) {
          console.error('Knowledge base search error:', kbError);
        } else if (kbItems) {
          kbItems.forEach((item: any) => {
            const similarity = 1 - (item.embedding as any);
            results.push({
              content: item.content,
              similarity,
              metadata: {
                ...item.metadata,
                title: item.title,
                source: item.source,
                tags: item.tags
              },
              source: 'knowledge_base',
              kb_id: item.id
            });
          });
        }
      }

      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    } catch (error) {
      console.error('Vector search error:', error);
      throw error;
    }
  }

  async getDocumentsByUser(userId: string): Promise<Document[]> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user documents: ${error.message}`);
    }

    return data as Document[];
  }

  async deleteDocument(documentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    const { data, error } = await this.supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index');

    if (error) {
      throw new Error(`Failed to get document chunks: ${error.message}`);
    }

    return data as DocumentChunk[];
  }

  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    totalKnowledgeBase: number;
    storageSize: number;
  }> {
    const [documentsResult, chunksResult, kbResult] = await Promise.all([
      this.supabase.from('documents').select('*', { count: 'exact', head: true }),
      this.supabase.from('document_chunks').select('*', { count: 'exact', head: true }),
      this.supabase.from('knowledge_base').select('*', { count: 'exact', head: true })
    ]);

    const { data: sizeData } = await this.supabase
      .from('documents')
      .select('file_size');

    const totalSize = sizeData?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0;

    return {
      totalDocuments: documentsResult.count || 0,
      totalChunks: chunksResult.count || 0,
      totalKnowledgeBase: kbResult.count || 0,
      storageSize: totalSize
    };
  }
}