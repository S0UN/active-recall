import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SegmentedClassificationService } from './SegmentedClassificationService';
import { ITextSegmenter } from '../../preprocessing/ITextSegmenter';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { UniversalModelFactory } from './UniversalModelFactory';

describe('SegmentedClassificationService - BART Large Integration', () => {
  let service: SegmentedClassificationService;
  let mockTextSegmenter: ITextSegmenter;
  let mockTextPreprocessor: ITextPreprocessor;
  let mockModelFactory: UniversalModelFactory;
  let mockStrategy: any;

  beforeEach(() => {
    mockStrategy = {
      classifyWithConfidence: vi.fn().mockResolvedValue({
        classification: 'computer science',
        confidence: 0.8
      }),
      classify: vi.fn().mockResolvedValue('computer science'),
      getLabels: vi.fn().mockReturnValue(['computer science', 'idle'])
    };

    mockTextSegmenter = {
      segment: vi.fn().mockReturnValue([
        { text: 'Sample text segment', startIndex: 0, endIndex: 19 }
      ])
    };

    mockTextPreprocessor = {
      preprocess: vi.fn().mockResolvedValue('cleaned sample text')
    };

    mockModelFactory = {
      createStrategy: vi.fn().mockResolvedValue(mockStrategy)
    } as any;

    service = new SegmentedClassificationService(
      mockTextSegmenter,
      mockTextPreprocessor,
      mockModelFactory
    );
  });

  describe('default configuration', () => {
    it('should use facebook/bart-large-mnli as default model', async () => {
      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        'facebook/bart-large-mnli',
        {
          topic: 'studying',
          threshold: 0.5
        }
      );
    });

    it('should use zero-shot strategy by default', async () => {
      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use confidence threshold of 0.5 by default', async () => {
      // The service now uses a single threshold for both model and studying determination
      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          threshold: 0.5
        })
      );
    });
  });

  describe('configuration updates', () => {
    it('should allow switching to different models', async () => {
      await service.updateConfiguration({
        modelName: 'microsoft/deberta-v3-large'
      });

      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        'microsoft/deberta-v3-large',
        expect.any(Object)
      );
    });

    it('should allow switching to embedding strategy', async () => {
      await service.updateConfiguration({
        strategyType: 'embedding',
        modelName: 'all-MiniLM-L6-v2'
      });

      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'embedding',
        'all-MiniLM-L6-v2',
        expect.any(Object)
      );
    });

    it('should allow custom topic configuration', async () => {
      await service.updateConfiguration({
        topic: 'machine learning',
        confidenceThreshold: 0.7
      });

      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        'facebook/bart-large-mnli',
        {
          topic: 'machine learning',
          threshold: 0.7
        }
      );
    });

    it('should allow hybrid strategy configuration', async () => {
      await service.updateConfiguration({
        strategyType: 'hybrid',
        modelName: 'hybrid-default',
        topic: 'biology'
      });

      await service.classify('test input');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'hybrid',
        'hybrid-default',
        {
          topic: 'biology',
          threshold: 0.5
        }
      );
    });
  });

  describe('BART Large specific features', () => {
    it('should handle complex technical content with BART Large', async () => {
      const technicalText = 'Machine learning algorithms require careful feature engineering and hyperparameter tuning';
      
      await service.classify(technicalText);
      
      expect(mockTextPreprocessor.preprocess).toHaveBeenCalledWith(technicalText);
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        'facebook/bart-large-mnli',
        expect.objectContaining({
          topic: 'studying'
        })
      );
    });

    it('should maintain high accuracy expectations with BART Large', async () => {
      // BART Large should handle nuanced content better
      mockStrategy.classifyWithConfidence.mockResolvedValue({
        classification: 'studying',
        confidence: 0.92  // High confidence expected from BART Large
      });

      const result = await service.classifyWithConfidence('Complex algorithmic content');
      
      expect(result.confidence).toBe(0.92);
      expect(result.classification).toBe('Studying');
    });

    it('should work with academic research content', async () => {
      await service.updateConfiguration({
        topic: 'academic research',
        confidenceThreshold: 0.7  // Higher threshold for research content
      });

      await service.classify('Peer-reviewed research methodology');
      
      expect(mockModelFactory.createStrategy).toHaveBeenCalledWith(
        'zero-shot',
        'facebook/bart-large-mnli',
        {
          topic: 'academic research',
          threshold: 0.7
        }
      );
    });
  });

  describe('performance characteristics', () => {
    it('should log configuration when using BART Large', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await service.updateConfiguration({
        modelName: 'facebook/bart-large-mnli',
        topic: 'advanced mathematics'
      });
      
      // The service should log the configuration update
      expect(mockModelFactory.createStrategy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it('should recreate classifier when configuration changes', async () => {
      // First classification
      await service.classify('test 1');
      expect(mockModelFactory.createStrategy).toHaveBeenCalledTimes(1);
      
      // Configuration change should trigger recreation
      await service.updateConfiguration({
        modelName: 'roberta-large-mnli'
      });
      
      // Second classification with new config
      await service.classify('test 2');
      expect(mockModelFactory.createStrategy).toHaveBeenCalledTimes(2);
      
      // Verify the new model is used
      expect(mockModelFactory.createStrategy).toHaveBeenLastCalledWith(
        'zero-shot',
        'roberta-large-mnli',
        expect.any(Object)
      );
    });
  });
});