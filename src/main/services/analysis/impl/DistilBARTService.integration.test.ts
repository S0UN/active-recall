import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DistilBARTService } from './DistilBARTService';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { ClassificationError } from '../../../errors/CustomErrors';

// Mock the transformers library
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    allowRemoteModels: true,
    localModelPath: ''
  },
}));

describe('DistilBARTService with TextPreprocessor Integration', () => {
  let service: DistilBARTService;
  let mockPreprocessor: ITextPreprocessor;
  let mockClassifier: any;

  beforeEach(async () => {
    // Create mock preprocessor
    mockPreprocessor = {
      preprocess: vi.fn().mockImplementation(async (text: string) => {
        // Simulate preprocessing - cleaning and spell correction
        return text
          .replace(/[«»£]/g, '')
          .replace(/\s+/g, ' ')
          .replace('teh', 'the')
          .trim();
      })
    };

    // Create mock classifier
    mockClassifier = vi.fn();
    const { pipeline } = await import('@xenova/transformers');
    (pipeline as any).mockResolvedValue(mockClassifier);

    // Create service with preprocessor
    service = new DistilBARTService(mockPreprocessor);
    await service.init();
  });

  describe('text preprocessing integration', () => {
    it('should use TextPreprocessor before classification', async () => {
      const input = '«» The quick brown fox jumps over teh lazy dog';
      const expectedPreprocessed = 'The quick brown fox jumps over the lazy dog';
      
      mockClassifier.mockResolvedValue({
        scores: [0.8],
        labels: ['studying technical or educational content']
      });

      await service.classifyWithConfidence(input);

      expect(mockPreprocessor.preprocess).toHaveBeenCalledWith(input);
      expect(mockClassifier).toHaveBeenCalledWith(
        expectedPreprocessed,
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should fail when preprocessor errors occur', async () => {
      const input = 'Some text';
      mockPreprocessor.preprocess = vi.fn().mockRejectedValue(new Error('Preprocessing failed'));

      await expect(service.classifyWithConfidence(input))
        .rejects.toThrow('Preprocessing failed');
    });

    it('should improve classification accuracy with preprocessing', async () => {
      // Simulate OCR output with errors
      const ocrOutput = `«> £ active-recall 8 LEN A= | | [ia EXPLORER
      Teh Executor framework will pool threads, resize automatically, and recreate threads
      if necessary. It also supports futures, a common concurrent programming construct.`;
      
      // Mock preprocessor to clean this up significantly
      mockPreprocessor.preprocess = vi.fn().mockResolvedValue(
        'The Executor framework will pool threads, resize automatically, and recreate threads ' +
        'if necessary. It also supports futures, a common concurrent programming construct.'
      );

      mockClassifier.mockResolvedValue({
        scores: [0.85], // High confidence after preprocessing
        labels: ['studying technical or educational content']
      });

      const result = await service.classifyWithConfidence(ocrOutput);
      
      expect(mockPreprocessor.preprocess).toHaveBeenCalledWith(ocrOutput);
      expect(result.classification).toBe('Studying');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle empty preprocessed text', async () => {
      const input = '«» | | [] {} <> %% $$'; // All special characters
      mockPreprocessor.preprocess = vi.fn().mockResolvedValue('');

      await expect(service.classifyWithConfidence(input))
        .rejects.toThrow(ClassificationError);
    });
  });
});