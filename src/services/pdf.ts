import pdf from 'pdf-parse';
import { MediaAttachment } from '../types/whatsapp';

export interface PDFProcessingResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    pages: number;
    wordCount: number;
    charCount: number;
  };
  success: boolean;
  error?: string;
}

export class PDFService {
  private static readonly MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_TEXT_LENGTH = 50000; // 50k characters

  static async processPDF(media: MediaAttachment): Promise<PDFProcessingResult> {
    try {
      if (media.type !== 'document') {
        throw new Error('Media is not a document');
      }

      if (!this.isPDFFile(media)) {
        throw new Error('File is not a PDF');
      }

      if (media.data.length > this.MAX_PDF_SIZE) {
        throw new Error(`PDF file too large. Maximum size: ${this.MAX_PDF_SIZE / (1024 * 1024)}MB`);
      }

      const data = await pdf(media.data, {
        max: 100, // Maximum number of pages to process
        version: 'v1.10.100'
      });

      let extractedText = data.text.trim();
      
      // Truncate if too long
      if (extractedText.length > this.MAX_TEXT_LENGTH) {
        extractedText = extractedText.substring(0, this.MAX_TEXT_LENGTH) + '\n\n[Content truncated due to length...]';
      }

      // Clean up the text
      extractedText = this.cleanText(extractedText);

      const wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;

      return {
        text: extractedText,
        metadata: {
          title: data.info?.Title || media.filename || 'Unknown',
          author: data.info?.Author,
          pages: data.numpages,
          wordCount,
          charCount: extractedText.length
        },
        success: true
      };

    } catch (error) {
      console.error('PDF processing error:', error);
      return {
        text: '',
        metadata: {
          pages: 0,
          wordCount: 0,
          charCount: 0
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  static isPDFFile(media: MediaAttachment): boolean {
    const isPDFMime = media.mimetype === 'application/pdf';
    const isPDFExtension = media.filename?.toLowerCase().endsWith('.pdf') || false;
    return isPDFMime || isPDFExtension;
  }

  private static cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page headers/footers (simple heuristic)
      .replace(/^.{0,100}Page \d+.{0,100}$/gm, '')
      // Remove excessive line breaks
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  static createPDFSummary(result: PDFProcessingResult): string {
    if (!result.success) {
      return `Failed to process PDF: ${result.error}`;
    }

    const { metadata } = result;
    const summary = [
      `📄 PDF Document Analysis`,
      `Title: ${metadata.title}`,
      metadata.author ? `Author: ${metadata.author}` : null,
      `Pages: ${metadata.pages}`,
      `Word Count: ${metadata.wordCount.toLocaleString()}`,
      `Character Count: ${metadata.charCount.toLocaleString()}`,
      '',
      '📋 Content:',
      result.text
    ].filter(Boolean).join('\n');

    return summary;
  }

  static createChunks(text: string, chunkSize: number = 2000, overlap: number = 200): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;
      
      // Try to break at a sentence or paragraph boundary
      if (end < text.length) {
        const sentenceEnd = text.lastIndexOf('.', end);
        const paragraphEnd = text.lastIndexOf('\n', end);
        const breakPoint = Math.max(sentenceEnd, paragraphEnd);
        
        if (breakPoint > start + chunkSize * 0.5) {
          end = breakPoint + 1;
        }
      }

      chunks.push(text.substring(start, end).trim());
      start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}