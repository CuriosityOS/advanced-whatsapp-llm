import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { fromPath } from 'pdf2pic';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MediaAttachment } from '../types/whatsapp';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

export interface EnhancedPDFProcessingResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    pages: number;
    wordCount: number;
    charCount: number;
    parsingMethod: string;
    hasImages: boolean;
    processingTime: number;
  };
  images?: string[]; // Base64 encoded images if extracted
  success: boolean;
  error?: string;
}

export class EnhancedPDFService {
  private static readonly MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_TEXT_LENGTH = 100000; // 100k characters
  private static readonly MAX_PAGES = 100;
  private static readonly TEMP_DIR = os.tmpdir();

  /**
   * Process PDF with multiple strategies for maximum compatibility
   */
  static async processPDF(media: MediaAttachment): Promise<EnhancedPDFProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Validation
      if (media.type !== 'document') {
        throw new Error('Media is not a document');
      }

      if (!this.isPDFFile(media)) {
        throw new Error('File is not a PDF');
      }

      if (media.data.length > this.MAX_PDF_SIZE) {
        throw new Error(`PDF file too large. Maximum size: ${this.MAX_PDF_SIZE / (1024 * 1024)}MB`);
      }

      console.log(`📄 Processing PDF: ${media.filename || 'unknown'} (${media.data.length} bytes)`);

      // Strategy 1: Try PDF.js (most reliable)
      try {
        const result = await this.processPDFWithPDFJS(media);
        result.metadata.processingTime = Date.now() - startTime;
        return result;
      } catch (pdfjsError) {
        console.warn('PDF.js parsing failed:', pdfjsError instanceof Error ? pdfjsError.message : String(pdfjsError));
      }

      // Strategy 2: Try pdf-parse (fallback)
      try {
        const pdf = require('pdf-parse');
        const data = await pdf(media.data, {
          max: this.MAX_PAGES,
          version: 'v1.10.100'
        });

        const extractedText = this.cleanText(data.text.trim());
        const wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;

        return {
          text: extractedText,
          metadata: {
            title: data.info?.Title || media.filename || 'Unknown',
            author: data.info?.Author,
            pages: data.numpages,
            wordCount,
            charCount: extractedText.length,
            parsingMethod: 'pdf-parse fallback',
            hasImages: false,
            processingTime: Date.now() - startTime
          },
          success: true
        };
      } catch (parseError) {
        console.warn('pdf-parse fallback failed:', parseError instanceof Error ? parseError.message : String(parseError));
      }

      // Strategy 3: Convert to images and OCR (for scanned PDFs)
      // Skip image conversion for now if GraphicsMagick/ImageMagick is not available
      if (process.env.ENABLE_PDF_IMAGE_CONVERSION === 'true') {
        try {
          const result = await this.processPDFAsImages(media);
          result.metadata.processingTime = Date.now() - startTime;
          return result;
        } catch (imageError) {
          console.warn('Image conversion failed:', imageError instanceof Error ? imageError.message : String(imageError));
        }
      }

      // All strategies failed
      throw new Error('All PDF processing strategies failed');

    } catch (error) {
      console.error('Enhanced PDF processing error:', error);
      
      return {
        text: '',
        metadata: {
          pages: 0,
          wordCount: 0,
          charCount: 0,
          parsingMethod: 'failed',
          hasImages: false,
          processingTime: Date.now() - startTime
        },
        success: false,
        error: this.getEnhancedErrorMessage(error)
      };
    }
  }

  /**
   * Process PDF using PDF.js (most reliable method)
   */
  private static async processPDFWithPDFJS(media: MediaAttachment): Promise<EnhancedPDFProcessingResult> {
    // Convert Buffer to Uint8Array for PDF.js
    const uint8Array = new Uint8Array(media.data);
    
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: false
    });

    const pdf = await loadingTask.promise;
    const numPages = Math.min(pdf.numPages, this.MAX_PAGES);
    
    let fullText = '';
    let totalWords = 0;
    let hasImages = false;
    const images: string[] = [];

    console.log(`📄 Processing ${numPages} pages with PDF.js...`);

    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        
        // Extract text content
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        fullText += pageText + '\n\n';

        // Check for images
        try {
          const operatorList = await page.getOperatorList();
          if (operatorList.fnArray.includes(pdfjsLib.OPS.paintImageXObject)) {
            hasImages = true;
          }
        } catch (imageCheckError) {
          console.warn(`Could not check for images on page ${pageNum}:`, imageCheckError);
        }
      } catch (pageError) {
        console.warn(`Error processing page ${pageNum}:`, pageError);
        continue;
      }
    }

    // Get metadata
    const metadata = await pdf.getMetadata();
    const info = metadata.info as any;

    const cleanedText = this.cleanText(fullText.trim());
    const wordCount = cleanedText.split(/\s+/).filter(word => word.length > 0).length;

    // Truncate if too long
    let finalText = cleanedText;
    if (finalText.length > this.MAX_TEXT_LENGTH) {
      finalText = finalText.substring(0, this.MAX_TEXT_LENGTH) + '\n\n[Content truncated due to length...]';
    }

    const result: EnhancedPDFProcessingResult = {
      text: finalText,
      metadata: {
        title: info.Title || media.filename || 'Unknown',
        author: info.Author || undefined,
        subject: info.Subject || undefined,
        creator: info.Creator || undefined,
        producer: info.Producer || undefined,
        pages: numPages,
        wordCount,
        charCount: finalText.length,
        parsingMethod: 'PDF.js',
        hasImages,
        processingTime: 0 // Will be set by caller
      },
      success: true
    };
    
    if (images.length > 0) {
      result.images = images;
    }
    
    return result;
  }

  /**
   * Process PDF by converting to images (for scanned PDFs)
   */
  private static async processPDFAsImages(media: MediaAttachment): Promise<EnhancedPDFProcessingResult> {
    // Create temporary file
    const tempFile = path.join(this.TEMP_DIR, `temp_${Date.now()}.pdf`);
    
    try {
      // Write PDF to temporary file
      fs.writeFileSync(tempFile, media.data);
      
      // Convert to images
      const convert = fromPath(tempFile, {
        density: 100,
        saveFilename: 'page',
        savePath: this.TEMP_DIR,
        format: 'png',
        width: 800,
        height: 1200
      });

      const pageImages = await convert.bulk(-1, { responseType: 'base64' });
      
      // For now, just return basic info (OCR would go here)
      return {
        text: '[This appears to be a scanned PDF. Text extraction from images is not yet implemented.]',
        metadata: {
          title: media.filename || 'Scanned PDF',
          pages: pageImages.length,
          wordCount: 0,
          charCount: 0,
          parsingMethod: 'image conversion',
          hasImages: true,
          processingTime: 0
        },
        images: pageImages.map((img: any) => img.base64).filter(Boolean),
        success: true
      };
    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
    }
  }

  /**
   * Check if media is a PDF file
   */
  static isPDFFile(media: MediaAttachment): boolean {
    const isPDFMime = media.mimetype === 'application/pdf';
    const isPDFExtension = media.filename?.toLowerCase().endsWith('.pdf') || false;
    return isPDFMime || isPDFExtension;
  }

  /**
   * Clean extracted text
   */
  private static cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page headers/footers (simple heuristic)
      .replace(/^.{0,100}Page \d+.{0,100}$/gm, '')
      // Remove excessive line breaks
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Remove non-printable characters
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .trim();
  }

  /**
   * Get enhanced error message with suggestions
   */
  private static getEnhancedErrorMessage(error: any): string {
    if (!(error instanceof Error)) {
      return 'Unknown PDF processing error occurred';
    }

    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('invalid pdf') || errorMsg.includes('pdf structure') || errorMsg.includes('bad xref')) {
      return `PDF file appears to be corrupted or has compatibility issues.

💡 Try these solutions:
• Re-save the PDF from the original application
• Use "Save As" instead of "Export" when creating the PDF
• Try converting the PDF using tools like SmallPDF or ILovePDF
• Check if the PDF opens correctly in other applications`;
    }
    
    if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
      return `PDF is password-protected or encrypted.

💡 Solutions:
• Remove password protection from the PDF
• Use PDF tools to unlock the document
• Export to PDF without security settings`;
    }
    
    if (errorMsg.includes('memory') || errorMsg.includes('heap')) {
      return `PDF is too complex or large to process.

💡 Solutions:
• Reduce PDF file size by compressing images
• Split large PDFs into smaller sections
• Try processing fewer pages at a time`;
    }
    
    return `PDF processing failed: ${error.message}

💡 General solutions:
• Try re-saving the PDF in a compatible format
• Check if the PDF is corrupted by opening it in other applications
• Contact support if the issue persists`;
  }

  /**
   * Create PDF summary
   */
  static createPDFSummary(result: EnhancedPDFProcessingResult): string {
    if (!result.success) {
      return `❌ PDF Processing Failed\n\n${result.error}`;
    }

    const { metadata } = result;
    const summary = [
      `📄 PDF Document Analysis`,
      `📋 Title: ${metadata.title}`,
      metadata.author ? `👤 Author: ${metadata.author}` : null,
      metadata.subject ? `📝 Subject: ${metadata.subject}` : null,
      `📊 Pages: ${metadata.pages}`,
      `🔤 Word Count: ${metadata.wordCount.toLocaleString()}`,
      `📏 Character Count: ${metadata.charCount.toLocaleString()}`,
      `⚙️ Processing Method: ${metadata.parsingMethod}`,
      `🖼️ Contains Images: ${metadata.hasImages ? 'Yes' : 'No'}`,
      `⏱️ Processing Time: ${metadata.processingTime}ms`,
      '',
      '📋 Content:',
      result.text
    ].filter(Boolean).join('\n');

    return summary;
  }

  /**
   * Create text chunks for vector storage
   */
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