import { MediaAttachment } from '../types/whatsapp';
import { LLMImageContent, LLMTextContent } from '../types/llm';
import mimeTypes from 'mime-types';

export class VisionService {
  private static readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  static isImageSupported(mimetype: string): boolean {
    return this.SUPPORTED_IMAGE_TYPES.includes(mimetype.toLowerCase());
  }

  static createImageContent(media: MediaAttachment): LLMImageContent {
    if (!this.isImageSupported(media.mimetype || '')) {
      throw new Error(`Unsupported image type: ${media.mimetype}`);
    }

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: media.mimetype || 'image/jpeg',
        data: media.data.toString('base64')
      }
    };
  }

  static createTextContent(text: string): LLMTextContent {
    return {
      type: 'text',
      text
    };
  }

  static createMultimodalContent(
    text: string, 
    media?: MediaAttachment
  ): (LLMTextContent | LLMImageContent)[] {
    const content: (LLMTextContent | LLMImageContent)[] = [];
    
    if (text.trim()) {
      content.push(this.createTextContent(text));
    }
    
    if (media && media.type === 'image' && this.isImageSupported(media.mimetype || '')) {
      content.push(this.createImageContent(media));
    }
    
    return content;
  }

  static extractImageDescription(
    text: string,
    media?: MediaAttachment
  ): string {
    let description = text.trim();
    
    if (media && media.caption) {
      description += media.caption ? ` Caption: ${media.caption}` : '';
    }
    
    if (!description && media?.type === 'image') {
      description = 'Please analyze this image and describe what you see.';
    }
    
    return description;
  }

  static getImageInfo(media: MediaAttachment): {
    size: number;
    type: string;
    isSupported: boolean;
  } {
    return {
      size: media.data.length,
      type: media.mimetype || 'unknown',
      isSupported: this.isImageSupported(media.mimetype || '')
    };
  }
}