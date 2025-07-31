import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SegmentedClassificationService } from './SegmentedClassificationService';
import { ITextSegmenter, TextSegment } from '../../preprocessing/ITextSegmenter';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { IClassificationService } from '../IClassificationService';

describe('SegmentedClassificationService', () => {
  let mockSegmenter: ITextSegmenter;
  let mockPreprocessor: ITextPreprocessor;
  let mockClassifier: IClassificationService;
  let service: SegmentedClassificationService;
  const defaultConfig: { studyingThreshold: number } = { studyingThreshold: 0.7 };

  beforeEach(() => {
    mockSegmenter = {
      segment: vi.fn()
    };
    
    mockPreprocessor = {
      preprocess: vi.fn()
    };
    
    mockClassifier = {
      classify: vi.fn(),
      classifyWithConfidence: vi.fn()
    };
    
    service = new SegmentedClassificationService(
      mockSegmenter,
      mockPreprocessor,
      mockClassifier,
      defaultConfig
    );
  });
  
  describe('classifySegmented', () => {
    it('should preprocess full text before segmenting', async () => {
      const rawText = 'Noisy OCR text with {%UI%} artifacts.';
      const cleanedText = 'Clean text';
      const segments: TextSegment[] = [
        { text: 'Clean text', startIndex: 0, endIndex: 9, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue(cleanedText);
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!).mockResolvedValue({
        classification: 'studying',
        confidence: 0.8
      });
      
      const result = await service.classifySegmented(rawText);
      
      expect(mockPreprocessor.preprocess).toHaveBeenCalledWith(rawText);
      expect(mockSegmenter.segment).toHaveBeenCalledWith(cleanedText);
      expect(result).toBe(true);
    });
    
    it('should return true when highest confidence exceeds threshold', async () => {
      const segments: TextSegment[] = [
        { text: 'JavaScript programming', startIndex: 0, endIndex: 20, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('clean text');
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!).mockResolvedValue({
        classification: 'studying',
        confidence: 0.85
      });
      
      const result = await service.classifySegmented('test text');
      
      expect(result).toBe(true);
    });
    
    it('should return false when highest confidence below threshold', async () => {
      const segments: TextSegment[] = [
        { text: 'Random text', startIndex: 0, endIndex: 10, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('clean text');
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!).mockResolvedValue({
        classification: 'studying',
        confidence: 0.4
      });
      
      const result = await service.classifySegmented('test text');
      
      expect(result).toBe(false);
    });
    
    it('should return false when classification is not studying', async () => {
      const segments: TextSegment[] = [
        { text: 'Random text', startIndex: 0, endIndex: 10, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('clean text');
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!).mockResolvedValue({
        classification: 'idle',
        confidence: 0.9
      });
      
      const result = await service.classifySegmented('test text');
      
      expect(result).toBe(false);
    });
    
    it('should return false when no segments found', async () => {
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('');
      vi.mocked(mockSegmenter.segment).mockReturnValue([]);
      
      const result = await service.classifySegmented('');
      
      expect(result).toBe(false);
    });
    
    it('should store detailed results for debugging', async () => {
      const segments: TextSegment[] = [
        { text: 'First segment', startIndex: 0, endIndex: 12, type: 'sentence' },
        { text: 'Second segment', startIndex: 14, endIndex: 27, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('clean text');
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!)
        .mockResolvedValueOnce({ classification: 'idle', confidence: 0.3 })
        .mockResolvedValueOnce({ classification: 'studying', confidence: 0.85 });
      
      await service.classifySegmented('test text');
      const lastResult = service.getLastClassificationResult();
      
      expect(lastResult).not.toBeNull();
      expect(lastResult!.overallClassification).toBe('studying');
      expect(lastResult!.highestConfidence).toBe(0.85);
      expect(lastResult!.segmentResults).toHaveLength(2);
    });
    
    it('should use custom threshold from config', async () => {
      const customService = new SegmentedClassificationService(
        mockSegmenter,
        mockPreprocessor,
        mockClassifier,
        { studyingThreshold: 0.9 }
      );
      
      const segments: TextSegment[] = [
        { text: 'Test segment', startIndex: 0, endIndex: 11, type: 'sentence' }
      ];
      
      vi.mocked(mockPreprocessor.preprocess).mockResolvedValue('clean text');
      vi.mocked(mockSegmenter.segment).mockReturnValue(segments);
      vi.mocked(mockClassifier.classifyWithConfidence!).mockResolvedValue({
        classification: 'studying',
        confidence: 0.85
      });
      
      const result = await customService.classifySegmented('test text');
      
      expect(result).toBe(false);
    });
  });
});