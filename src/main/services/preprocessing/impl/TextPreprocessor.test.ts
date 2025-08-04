import { describe, it, expect, beforeEach } from 'vitest';
import { TextPreprocessor } from './TextPreprocessor';

describe('TextPreprocessor', () => {
  let preprocessor: TextPreprocessor;

  beforeEach(() => {
    preprocessor = new TextPreprocessor();
  });

  describe('basic text cleaning', () => {
    it('should remove special UI characters', async () => {
      const input = '«» £ active-recall | [ia EXPLORER';
      const result = await preprocessor.preprocess(input);
      
      expect(result).not.toContain('«»');
      expect(result).not.toContain('£');
      expect(result).toContain('active-recall');
      expect(result).toContain('EXPLORER');
    });

    it('should remove excessive pipes and brackets', async () => {
      const input = 'TS VisionService.ts | | [ia] EXPLORER [[ ]]';
      const result = await preprocessor.preprocess(input);
      
      expect(result).not.toMatch(/\|\s*\|/);
      expect(result).not.toContain('[]');
      expect(result).not.toContain('[[ ]]');
      expect(result).toContain('VisionService.ts');
      expect(result).toContain('EXPLORER');
    });

    it('should normalize whitespace', async () => {
      const input = 'Text    with     multiple      spaces';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toBe('Text with multiple spaces');
    });

    it('should remove common UI navigation elements', async () => {
      const input = 'OPEN EDITORS src > main > services > analysis > impl > T EducationalContentDetector.ts';
      const result = await preprocessor.preprocess(input);
      
      expect(result).not.toContain('OPEN EDITORS');
      expect(result).toContain('EducationalContentDetector.ts');
    });

    it('should remove file path separators', async () => {
      const input = 'src/main/services/analysis/impl/TopicClassificationService.ts';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('TopicClassificationService.ts');
      expect(result.split('/').length).toBeLessThan(input.split('/').length);
    });
  });

  describe('spell checking', () => {
    it('should correct common OCR errors', async () => {
      const input = 'Tne quick brown fox jumps over teh lazy dog';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('The quick brown fox jumps over the lazy dog');
    });

    it('should handle programming terms correctly', async () => {
      const input = 'TypeScript JavaScript async await function';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('TypeScript');
      expect(result).toContain('JavaScript');
      expect(result).toContain('async');
      expect(result).toContain('await');
    });

    it('should preserve correctly spelled technical terms', async () => {
      const input = 'IClassificationService TopicClassificationService TesseractOcrService';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('IClassificationService');
      expect(result).toContain('TopicClassificationService');
      expect(result).toContain('TesseractOcrService');
    });
  });

  describe('content extraction', () => {
    it('should extract meaningful content from mixed UI and text', async () => {
      const input = `
        TS VisionService.ts TS TopicClassificationService.ts 1, M
        export class EducationalContentDetector implements IClassificationService {
        private static readonly STUDYING THRESHOLD = 0.5;
      `;
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('export class EducationalContentDetector implements IClassificationService');
      expect(result).toContain('STUDYING THRESHOLD');
      expect(result).not.toContain('1, M');
    });

    it('should remove line numbers and git status indicators', async () => {
      const input = '11 export class EducationalContentDetector implements IClassificationService { |S % X';
      const result = await preprocessor.preprocess(input);
      
      expect(result).not.toMatch(/^\d+\s/);
      expect(result).not.toContain('|S % X');
      expect(result).toContain('export class EducationalContentDetector');
    });

    it('should handle real OCR output from the example', async () => {
      const input = `«> £ active-recall 8 LEN A= | | [ia EXPLORER TS VisionService.ts TS TopicClassificationService.ts 1, M
      TS EducationalContentDetectorts 5,U X Ts TesseractOcrService.ts TS Orchestrator.ts Ts ErrorHandlerts`;
      const result = await preprocessor.preprocess(input);
      
      expect(result).not.toContain('«>');
      expect(result).not.toContain('£');
      expect(result).not.toContain('8 LEN A=');
      expect(result).toContain('VisionService');
      expect(result).toContain('TopicClassificationService');
      expect(result).toContain('TesseractOcrService');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', async () => {
      const result = await preprocessor.preprocess('');
      expect(result).toBe('');
    });

    it('should handle input with only special characters', async () => {
      const result = await preprocessor.preprocess('«» | | [] {} <> %% $$');
      // After cleaning, only pipes should remain, then get normalized
      expect(result.trim()).toBe('|');
    });

    it('should preserve meaningful punctuation', async () => {
      const input = 'This is a sentence. It has punctuation! Does it work?';
      const result = await preprocessor.preprocess(input);
      
      expect(result).toContain('.');
      expect(result).toContain('!');
      expect(result).toContain('?');
    });
  });
});