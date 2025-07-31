import { ITextSegmenter, TextSegment, SegmentationOptions } from '../ITextSegmenter';
import { injectable } from 'tsyringe';

@injectable()
export class TextSegmenter implements ITextSegmenter {
  private static readonly DEFAULT_MAX_LENGTH = 500;
  
  public segment(text: string, options?: SegmentationOptions): TextSegment[] {
    if (this.isEmptyText(text)) {
      return [];
    }
    
    const config = this.parseSegmentationConfig(options);
    const rawSegments = this.createRawSegments(text, config);
    const cleanedSegments = this.removeEmptySegments(rawSegments);
    
    return this.applyLengthConstraints(cleanedSegments, config.minLength, config.maxLength);
  }
  
  private isEmptyText(text: string): boolean {
    return !text?.trim();
  }
  
  private parseSegmentationConfig(options?: SegmentationOptions) {
    return {
      minLength: options?.minLength ?? 0,
      maxLength: options?.maxLength ?? TextSegmenter.DEFAULT_MAX_LENGTH,
      preferredMethod: options?.preferredMethod ?? 'sentence'
    };
  }
  
  private createRawSegments(text: string, config: { preferredMethod: string }): TextSegment[] {
    if (config.preferredMethod === 'sentence') {
      return this.trySegmentationStrategies(text);
    } else {
      return this.tryLineBasedSegmentation(text);
    }
  }
  
  private trySegmentationStrategies(text: string): TextSegment[] {
    const sentenceSegments = this.segmentBySentences(text);
    
    if (this.isSuccessfulSentenceSegmentation(sentenceSegments, text)) {
      return sentenceSegments;
    }
    
    return this.tryLineBasedSegmentation(text);
  }
  
  private isSuccessfulSentenceSegmentation(segments: TextSegment[], text: string): boolean {
    return segments.length > 0 && !(segments.length === 1 && !this.hasSentenceEnding(text));
  }
  
  private tryLineBasedSegmentation(text: string): TextSegment[] {
    const lineSegments = this.segmentByLines(text);
    
    if (lineSegments.length > 1) {
      return lineSegments;
    }
    
    return this.createChunkSegment(text);
  }
  
  private removeEmptySegments(segments: TextSegment[]): TextSegment[] {
    return segments.filter(segment => segment.text.trim().length > 0);
  }
  
  private segmentBySentences(text: string): TextSegment[] {
    const abbreviations = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Sr.', 'Jr.', 'Ph.D.', 'U.S.', 'U.K.', 'A.I.', 'M.D.', 'B.A.', 'M.A.', 'D.D.S.', 'Ph.D', 'U.S.A.', 'Inc.', 'Ltd.', 'Co.', 'Corp.', 'vs.', 'etc.', 'i.e.', 'e.g.'];
    
    let processedText = text;
    const replacements: Map<string, string> = new Map();
    
    abbreviations.forEach((abbr, index) => {
      const placeholder = `__ABBR_${index}__`;
      const abbrRegex = new RegExp(abbr.replace(/\./g, '\\.'), 'g');
      processedText = processedText.replace(abbrRegex, placeholder);
      replacements.set(placeholder, abbr);
    });
    
    const sentenceRegex = /[^.!?]+[.!?]+\s*/g;
    const segments: TextSegment[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    
    while ((match = sentenceRegex.exec(processedText)) !== null) {
      let sentenceText = match[0];
      
      replacements.forEach((original, placeholder) => {
        sentenceText = sentenceText.replace(new RegExp(placeholder, 'g'), original);
      });
      
      const trimmedText = sentenceText.trim();
      if (trimmedText) {
        const originalStartIndex = text.indexOf(trimmedText, lastIndex);
        segments.push({
          text: trimmedText,
          startIndex: originalStartIndex,
          endIndex: originalStartIndex + trimmedText.length - 1,
          type: 'sentence'
        });
        lastIndex = originalStartIndex + trimmedText.length;
      }
    }
    
    if (lastIndex < text.length) {
      let remainingText = text.substring(lastIndex);
      const trimmedRemaining = remainingText.trim();
      if (trimmedRemaining) {
        const remainingStart = text.indexOf(trimmedRemaining, lastIndex);
        segments.push({
          text: trimmedRemaining,
          startIndex: remainingStart,
          endIndex: remainingStart + trimmedRemaining.length - 1,
          type: 'sentence'
        });
      }
    }
    
    return segments;
  }
  
  private segmentByLines(text: string): TextSegment[] {
    const lines = text.split(/\r?\n|\r/);
    const segments: TextSegment[] = [];
    let currentIndex = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        const lineStart = text.indexOf(line, currentIndex);
        segments.push({
          text: trimmedLine,
          startIndex: lineStart,
          endIndex: lineStart + line.length - 1,
          type: 'line'
        });
      }
      currentIndex += line.length + 1;
    }
    
    return segments;
  }
  
  private createChunkSegment(text: string): TextSegment[] {
    return [{
      text: text.trim(),
      startIndex: 0,
      endIndex: text.length - 1,
      type: 'chunk'
    }];
  }
  
  private hasSentenceEnding(text: string): boolean {
    return /[.!?]/.test(text);
  }
  
  private applyLengthConstraints(segments: TextSegment[], minLength: number, maxLength: number): TextSegment[] {
    let filteredSegments = segments.filter(segment => segment.text.length >= minLength);
    
    const splitSegments: TextSegment[] = [];
    for (const segment of filteredSegments) {
      if (segment.text.length > maxLength) {
        const chunks = this.splitIntoChunks(segment.text, maxLength);
        let chunkStart = segment.startIndex;
        
        for (const chunk of chunks) {
          splitSegments.push({
            text: chunk,
            startIndex: chunkStart,
            endIndex: chunkStart + chunk.length - 1,
            type: 'chunk'
          });
          chunkStart += chunk.length;
        }
      } else {
        splitSegments.push(segment);
      }
    }
    
    return splitSegments;
  }
  
  private splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    let currentChunk = '';
    
    for (const word of words) {
      if (currentChunk.length + word.length + 1 > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
}