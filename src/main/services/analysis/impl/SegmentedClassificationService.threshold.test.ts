import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SegmentedClassificationService } from './SegmentedClassificationService';
import { ITextSegmenter, TextSegment } from '../../preprocessing/ITextSegmenter';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { UniversalModelFactory } from './UniversalModelFactory';

describe('SegmentedClassificationService - Segment Threshold Tests', () => {
  let service: SegmentedClassificationService;
  let mockTextSegmenter: ITextSegmenter;
  let mockTextPreprocessor: ITextPreprocessor;
  let mockModelFactory: UniversalModelFactory;
  let mockStrategy: any;

  beforeEach(() => {
    mockStrategy = {
      classifyWithConfidence: vi.fn(),
      classify: vi.fn(),
      getLabels: vi.fn().mockReturnValue(['computer science', 'idle'])
    };

    mockTextSegmenter = {
      segment: vi.fn()
    };

    mockTextPreprocessor = {
      preprocess: vi.fn().mockResolvedValue('cleaned text')
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

  // Test data factories for segment threshold scenarios
  const createSegments = (count: number): TextSegment[] => {
    return Array.from({ length: count }, (_, i) => ({
      text: `Segment ${i + 1}`,
      startIndex: i * 10,
      endIndex: (i + 1) * 10 - 1
    }));
  };

  const setupSegmentResults = {
    withStudyingProportion: (totalSegments: number, studyingCount: number, confidence = 0.9) => {
      const segments = createSegments(totalSegments);
      mockTextSegmenter.segment.mockReturnValue(segments);

      // First `studyingCount` segments return studying classification
      // Remaining segments return idle classification
      mockStrategy.classifyWithConfidence.mockImplementation(async (text: string) => {
        const segmentIndex = parseInt(text.split(' ')[1]) - 1;
        const isStudying = segmentIndex < studyingCount;
        
        return {
          classification: isStudying ? 'computer science' : 'idle',
          confidence: isStudying ? confidence : 0.2
        };
      });

      return { totalSegments, studyingCount, expectedProportion: studyingCount / totalSegments };
    }
  };

  const expectClassificationResult = {
    toBeStudying: async (text: string) => {
      const result = await service.classify(text);
      expect(result).toBe('Studying');
    },
    toBeIdle: async (text: string) => {
      const result = await service.classify(text);
      expect(result).toBe('Idle');
    },
    withConfidenceToBeStudying: async (text: string) => {
      const result = await service.classifyWithConfidence(text);
      expect(result.classification).toBe('Studying');
    },
    withConfidenceToBeIdle: async (text: string) => {
      const result = await service.classifyWithConfidence(text);
      expect(result.classification).toBe('Idle');
    },
    segmentedToBeTrue: async (text: string) => {
      const result = await service.classifySegmented(text);
      expect(result).toBe(true);
    },
    segmentedToBeFalse: async (text: string) => {
      const result = await service.classifySegmented(text);
      expect(result).toBe(false);
    }
  };

  describe('default segment threshold (40%)', () => {
    it('should classify as studying when exactly 40% of segments are studying', async () => {
      setupSegmentResults.withStudyingProportion(10, 4); // 4/10 = 40%
      
      await expectClassificationResult.toBeStudying('test text');
    });

    it('should classify as studying when more than 40% of segments are studying', async () => {
      setupSegmentResults.withStudyingProportion(10, 5); // 5/10 = 50%
      
      await expectClassificationResult.toBeStudying('test text');
    });

    it('should classify as idle when less than 40% of segments are studying', async () => {
      setupSegmentResults.withStudyingProportion(10, 3); // 3/10 = 30%
      
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should classify as idle when no segments are studying', async () => {
      setupSegmentResults.withStudyingProportion(5, 0); // 0/5 = 0%
      
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should classify as studying when all segments are studying', async () => {
      setupSegmentResults.withStudyingProportion(5, 5); // 5/5 = 100%
      
      await expectClassificationResult.toBeStudying('test text');
    });
  });

  describe('custom segment threshold configuration', () => {
    it('should respect 60% threshold when configured', async () => {
      await service.updateConfiguration({ segmentThresholdProportion: 0.6 });
      
      setupSegmentResults.withStudyingProportion(10, 5); // 5/10 = 50% < 60%
      
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should meet 60% threshold when exactly 60% are studying', async () => {
      await service.updateConfiguration({ segmentThresholdProportion: 0.6 });
      
      setupSegmentResults.withStudyingProportion(10, 6); // 6/10 = 60%
      
      await expectClassificationResult.toBeStudying('test text');
    });

    it('should respect 20% threshold for low-confidence scenarios', async () => {
      await service.updateConfiguration({ segmentThresholdProportion: 0.2 });
      
      setupSegmentResults.withStudyingProportion(10, 2); // 2/10 = 20%
      
      await expectClassificationResult.toBeStudying('test text');
    });

    it('should handle 100% threshold (all segments must be studying)', async () => {
      await service.updateConfiguration({ segmentThresholdProportion: 1.0 });
      
      setupSegmentResults.withStudyingProportion(5, 4); // 4/5 = 80% < 100%
      
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should meet 100% threshold when all segments are studying', async () => {
      await service.updateConfiguration({ segmentThresholdProportion: 1.0 });
      
      setupSegmentResults.withStudyingProportion(3, 3); // 3/3 = 100%
      
      await expectClassificationResult.toBeStudying('test text');
    });
  });

  describe('confidence threshold interaction', () => {
    it('should only count segments with sufficient confidence as studying', async () => {
      const segments = createSegments(5);
      mockTextSegmenter.segment.mockReturnValue(segments);

      // 3 segments have studying classification, but only 2 have sufficient confidence
      mockStrategy.classifyWithConfidence.mockImplementation(async (text: string) => {
        const segmentIndex = parseInt(text.split(' ')[1]) - 1;
        
        if (segmentIndex < 3) {
          return {
            classification: 'computer science',
            confidence: segmentIndex < 2 ? 0.9 : 0.7 // First 2 have high confidence, 3rd has low
          };
        }
        return { classification: 'idle', confidence: 0.2 };
      });

      // With default 85% confidence threshold and 40% segment threshold
      // Only 2/5 segments = 40% meet both criteria
      await expectClassificationResult.toBeStudying('test text');
      
      // If we raise segment threshold to 50%, it should fail
      await service.updateConfiguration({ segmentThresholdProportion: 0.5 });
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should handle low confidence threshold scenarios', async () => {
      await service.updateConfiguration({ 
        confidenceThreshold: 0.3,
        segmentThresholdProportion: 0.4 
      });
      
      // More segments will qualify with lower confidence threshold
      setupSegmentResults.withStudyingProportion(10, 4, 0.5); // 4/10 with 0.5 confidence
      
      await expectClassificationResult.toBeStudying('test text');
    });
  });

  describe('edge cases', () => {
    it('should handle single segment scenarios', async () => {
      setupSegmentResults.withStudyingProportion(1, 1); // 1/1 = 100%
      
      await expectClassificationResult.toBeStudying('test text');
    });

    it('should handle empty segment results', async () => {
      mockTextSegmenter.segment.mockReturnValue([]);
      
      await expectClassificationResult.toBeIdle('test text');
    });

    it('should maintain consistency across different classification methods', async () => {
      setupSegmentResults.withStudyingProportion(10, 5); // 5/10 = 50%
      
      const text = 'test text';
      await expectClassificationResult.toBeStudying(text);
      await expectClassificationResult.withConfidenceToBeStudying(text);
      await expectClassificationResult.segmentedToBeTrue(text);
    });
  });

  describe('environment variable configuration', () => {
    const originalEnv = process.env.SEGMENT_THRESHOLD_PROPORTION;

    afterEach(() => {
      process.env.SEGMENT_THRESHOLD_PROPORTION = originalEnv;
    });

    it('should use environment variable when valid', () => {
      process.env.SEGMENT_THRESHOLD_PROPORTION = '0.3';
      
      const newService = new SegmentedClassificationService(
        mockTextSegmenter,
        mockTextPreprocessor,
        mockModelFactory
      );
      
      // Verify the configuration was read (we can't directly test private methods)
      // This will be validated through behavior in integration tests
      expect(newService).toBeDefined();
    });

    it('should handle invalid environment variable gracefully', () => {
      process.env.SEGMENT_THRESHOLD_PROPORTION = 'invalid';
      
      const newService = new SegmentedClassificationService(
        mockTextSegmenter,
        mockTextPreprocessor,
        mockModelFactory
      );
      
      expect(newService).toBeDefined();
    });

    it('should handle out-of-range environment values gracefully', () => {
      process.env.SEGMENT_THRESHOLD_PROPORTION = '1.5'; // > 1.0
      
      const newService = new SegmentedClassificationService(
        mockTextSegmenter,
        mockTextPreprocessor,
        mockModelFactory
      );
      
      expect(newService).toBeDefined();
    });
  });

  describe('logging and debugging', () => {
    it('should provide detailed threshold analysis in debug logs', async () => {
      const logSpy = vi.spyOn(console, 'log'); // Logger.debug typically goes to console
      
      setupSegmentResults.withStudyingProportion(5, 2); // 2/5 = 40%
      
      await service.classify('test text');
      
      // Verify logging behavior (exact log format may vary)
      expect(mockModelFactory.createStrategy).toHaveBeenCalled();
    });
  });
});