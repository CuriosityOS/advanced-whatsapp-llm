import pdf from 'pdf-parse';
import { MediaAttachment } from '../types/whatsapp';
import { EnhancedPDFService, EnhancedPDFProcessingResult } from './pdf-enhanced';

export interface PDFProcessingResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    pages: number;
    wordCount: number;
    charCount: number;
    parsingMethod?: string;
  };
  success: boolean;
  error?: string;
}

export class PDFService {
  private static readonly MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_TEXT_LENGTH = 50000; // 50k characters

  static async processPDF(media: MediaAttachment): Promise<PDFProcessingResult> {
    // Use enhanced PDF service for better compatibility
    try {
      const enhancedResult = await EnhancedPDFService.processPDF(media);
      
      // Convert enhanced result to legacy format for backward compatibility
      const legacyResult: PDFProcessingResult = {
        text: enhancedResult.text,
        metadata: {
          pages: enhancedResult.metadata.pages,
          wordCount: enhancedResult.metadata.wordCount,
          charCount: enhancedResult.metadata.charCount
        },
        success: enhancedResult.success
      };
      
      // Only add error if it exists
      if (enhancedResult.error) {
        legacyResult.error = enhancedResult.error;
      }
      
      // Only add optional fields if they have values
      if (enhancedResult.metadata.title) {
        legacyResult.metadata.title = enhancedResult.metadata.title;
      }
      if (enhancedResult.metadata.author) {
        legacyResult.metadata.author = enhancedResult.metadata.author;
      }
      if (enhancedResult.metadata.parsingMethod) {
        legacyResult.metadata.parsingMethod = enhancedResult.metadata.parsingMethod;
      }
      
      return legacyResult;
    } catch (error) {
      console.error('Enhanced PDF processing failed, falling back to legacy method:', error);
      
      // Fallback to legacy method
      return this.processPDFLegacy(media);
    }
  }

  /**
   * Legacy PDF processing method (kept as fallback)
   */
  private static async processPDFLegacy(media: MediaAttachment): Promise<PDFProcessingResult> {
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

      // Try primary PDF parsing with error recovery
      let data;
      let parsingMethod = 'primary';
      
      try {
        data = await pdf(media.data, {
          max: 100, // Maximum number of pages to process
          version: 'v1.10.100'
        });
        console.log(`PDF parsed successfully using ${parsingMethod} method`);
      } catch (primaryError) {
        console.warn('Primary PDF parsing failed, attempting fallback methods...', primaryError instanceof Error ? primaryError.message : String(primaryError));
        
        // Try with different version
        try {
          data = await pdf(media.data, {
            max: 100,
            version: 'v1.9.426'
          });
          parsingMethod = 'fallback v1.9.426';
          console.log(`PDF parsed successfully using ${parsingMethod} method`);
        } catch (secondaryError) {
          // Try with minimal options
          try {
            data = await pdf(media.data, {
              max: 50
            });
            parsingMethod = 'minimal options';
            console.log(`PDF parsed successfully using ${parsingMethod} method`);
          } catch (tertiaryError) {
            // All parsing methods failed
            console.error('All PDF parsing methods failed:', {
              primary: primaryError instanceof Error ? primaryError.message : String(primaryError),
              secondary: secondaryError instanceof Error ? secondaryError.message : String(secondaryError),
              tertiary: tertiaryError instanceof Error ? tertiaryError.message : String(tertiaryError)
            });
            throw primaryError; // Throw the original error
          }
        }
      }

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
          charCount: extractedText.length,
          parsingMethod
        },
        success: true
      };

    } catch (error) {
      console.error('PDF processing error:', error);
      
      // Enhanced error handling with user-friendly messages
      let errorMessage = 'PDF processing failed';
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('bad xref') || errorMsg.includes('xref')) {
          errorMessage = 'PDF file structure is corrupted or incompatible. Please try a different PDF file.';
        } else if (errorMsg.includes('invalid pdf') || errorMsg.includes('pdf structure')) {
          errorMessage = 'The file is not a valid PDF or is corrupted. Please verify the file and try again.';
        } else if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
          errorMessage = 'PDF is password-protected or encrypted. Please provide an unprotected PDF file.';
        } else if (errorMsg.includes('unsupported') || errorMsg.includes('version')) {
          errorMessage = 'PDF version is not supported. Please try saving the PDF in a compatible format.';
        } else if (errorMsg.includes('memory') || errorMsg.includes('heap')) {
          errorMessage = 'PDF is too complex to process. Please try a simpler PDF file.';
        } else {
          errorMessage = `PDF processing failed: ${error.message}`;
        }
      }
      
      // Add helpful suggestions
      const suggestions = this.getPDFErrorSuggestions(error);
      if (suggestions) {
        errorMessage += `\n\n💡 Suggestions:\n${suggestions}`;
      }
      
      return {
        text: '',
        metadata: {
          pages: 0,
          wordCount: 0,
          charCount: 0
        },
        success: false,
        error: errorMessage
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
    // Use enhanced PDF service for better summaries
    try {
      const enhancedResult: EnhancedPDFProcessingResult = {
        text: result.text,
        metadata: {
          pages: result.metadata.pages,
          wordCount: result.metadata.wordCount,
          charCount: result.metadata.charCount,
          parsingMethod: result.metadata.parsingMethod || 'legacy',
          hasImages: false,
          processingTime: 0
        },
        success: result.success
      };
      
      // Only add error if it exists
      if (result.error) {
        enhancedResult.error = result.error;
      }
      
      // Only add optional fields if they have values
      if (result.metadata.title) {
        enhancedResult.metadata.title = result.metadata.title;
      }
      if (result.metadata.author) {
        enhancedResult.metadata.author = result.metadata.author;
      }
      
      return EnhancedPDFService.createPDFSummary(enhancedResult);
    } catch (error) {
      // Fallback to legacy summary
      return this.createPDFSummaryLegacy(result);
    }
  }

  private static createPDFSummaryLegacy(result: PDFProcessingResult): string {
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
    // Use enhanced PDF service for better chunking
    return EnhancedPDFService.createChunks(text, chunkSize, overlap);
  }

  private static getPDFErrorSuggestions(error: any): string | null {
    if (!(error instanceof Error)) return null;
    
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('bad xref') || errorMsg.includes('xref')) {
      return `• Try re-saving the PDF from the original application
• Use "Save As" instead of "Export" if possible
• Try converting the PDF using online tools like SmallPDF or ILovePDF
• Check if the PDF opens correctly in other applications`;
    }
    
    if (errorMsg.includes('invalid pdf') || errorMsg.includes('pdf structure')) {
      return `• Verify the file is actually a PDF (not renamed)
• Try opening the PDF in a different PDF viewer
• Re-download the PDF if it was downloaded from the internet
• Try creating a new PDF from the original source`;
    }
    
    if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
      return `• Remove password protection from the PDF
• Use PDF tools to unlock the document
• Export to PDF without security settings`;
    }
    
    if (errorMsg.includes('unsupported') || errorMsg.includes('version')) {
      return `• Save the PDF in PDF/A format for better compatibility
• Try using Adobe Acrobat or similar tools to optimize the PDF
• Convert to a newer PDF version (1.4 or higher)`;
    }
    
    if (errorMsg.includes('memory') || errorMsg.includes('heap')) {
      return `• Reduce the PDF file size by compressing images
• Split large PDFs into smaller sections
• Try processing fewer pages at a time`;
    }
    
    return `• Try re-saving the PDF in a compatible format
• Check if the PDF is corrupted by opening it in other applications
• Contact support if the issue persists`;
  }
}