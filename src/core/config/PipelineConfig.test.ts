/**
 * PipelineConfig Tests
 * 
 * Comprehensive test suite for the configuration system to ensure
 * all magic numbers are properly configurable and validated.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  loadPipelineConfig, 
  validatePipelineConfig, 
  DEFAULT_PIPELINE_CONFIG,
  PipelineConfig 
} from './PipelineConfig';

describe('PipelineConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_PIPELINE_CONFIG', () => {
    it('should have all required routing thresholds', () => {
      expect(DEFAULT_PIPELINE_CONFIG.routing.highConfidenceThreshold).toBe(0.82);
      expect(DEFAULT_PIPELINE_CONFIG.routing.lowConfidenceThreshold).toBe(0.65);
      expect(DEFAULT_PIPELINE_CONFIG.routing.newTopicThreshold).toBe(0.5);
      expect(DEFAULT_PIPELINE_CONFIG.routing.duplicateThreshold).toBe(0.9);
    });

    it('should have properly ordered confidence thresholds', () => {
      const { routing } = DEFAULT_PIPELINE_CONFIG;
      
      expect(routing.duplicateThreshold).toBeGreaterThan(routing.highConfidenceThreshold);
      expect(routing.highConfidenceThreshold).toBeGreaterThan(routing.lowConfidenceThreshold);
      expect(routing.lowConfidenceThreshold).toBeGreaterThan(routing.newTopicThreshold);
    });

    it('should have all batch processing configuration', () => {
      expect(DEFAULT_PIPELINE_CONFIG.batch.minClusterSize).toBe(5);
      expect(DEFAULT_PIPELINE_CONFIG.batch.enableBatchClustering).toBe(true);
      expect(DEFAULT_PIPELINE_CONFIG.batch.enableFolderCreation).toBe(true);
    });

    it('should have all text validation limits', () => {
      expect(DEFAULT_PIPELINE_CONFIG.textValidation.minTextLength).toBe(3);
      expect(DEFAULT_PIPELINE_CONFIG.textValidation.maxTextLength).toBe(5000);
      expect(DEFAULT_PIPELINE_CONFIG.textValidation.minQualityScore).toBe(0.3);
      expect(DEFAULT_PIPELINE_CONFIG.textValidation.minWordCount).toBe(3);
      expect(DEFAULT_PIPELINE_CONFIG.textValidation.shortTextQualityScore).toBe(0.2);
    });

    it('should have quality score weights that sum to 1.0', () => {
      const { qualityScore } = DEFAULT_PIPELINE_CONFIG;
      const sum = qualityScore.uniquenessWeight + qualityScore.lengthWeight;
      
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should have folder scoring weights that sum to less than 1.0 (leaving room for count bonus)', () => {
      const { folderScoring } = DEFAULT_PIPELINE_CONFIG;
      const sum = folderScoring.avgSimilarityWeight + folderScoring.maxSimilarityWeight;
      
      expect(sum).toBeLessThan(1.0);
      expect(sum).toBeCloseTo(0.8, 2);
    });

    it('should have reasonable vector configuration defaults', () => {
      expect(DEFAULT_PIPELINE_CONFIG.vector.defaultDimensions).toBe(1536);
      expect(DEFAULT_PIPELINE_CONFIG.vector.maxFolderMembers).toBeGreaterThan(0);
      expect(DEFAULT_PIPELINE_CONFIG.vector.contextSearchLimit).toBeGreaterThan(0);
      expect(DEFAULT_PIPELINE_CONFIG.vector.titleSearchLimit).toBe(1);
    });
  });

  describe('loadPipelineConfig', () => {
    it('should return default configuration when no environment variables are set', () => {
      const config = loadPipelineConfig();
      
      expect(config).toEqual(DEFAULT_PIPELINE_CONFIG);
    });

    it('should load routing thresholds from environment variables', () => {
      process.env.HIGH_CONFIDENCE_THRESHOLD = '0.85';
      process.env.LOW_CONFIDENCE_THRESHOLD = '0.70';
      process.env.NEW_TOPIC_THRESHOLD = '0.55';
      process.env.DUPLICATE_THRESHOLD = '0.95';

      const config = loadPipelineConfig();

      expect(config.routing.highConfidenceThreshold).toBe(0.85);
      expect(config.routing.lowConfidenceThreshold).toBe(0.70);
      expect(config.routing.newTopicThreshold).toBe(0.55);
      expect(config.routing.duplicateThreshold).toBe(0.95);
    });

    it('should load batch processing configuration from environment', () => {
      process.env.MIN_CLUSTER_SIZE = '8';
      process.env.ENABLE_BATCH_CLUSTERING = 'false';
      process.env.ENABLE_FOLDER_CREATION = 'false';

      const config = loadPipelineConfig();

      expect(config.batch.minClusterSize).toBe(8);
      expect(config.batch.enableBatchClustering).toBe(false);
      expect(config.batch.enableFolderCreation).toBe(false);
    });

    it('should load text validation configuration from environment', () => {
      process.env.MIN_TEXT_LENGTH = '5';
      process.env.MAX_TEXT_LENGTH = '8000';
      process.env.MIN_QUALITY_SCORE = '0.4';
      process.env.MIN_WORD_COUNT = '4';
      process.env.SHORT_TEXT_QUALITY_SCORE = '0.3';

      const config = loadPipelineConfig();

      expect(config.textValidation.minTextLength).toBe(5);
      expect(config.textValidation.maxTextLength).toBe(8000);
      expect(config.textValidation.minQualityScore).toBe(0.4);
      expect(config.textValidation.minWordCount).toBe(4);
      expect(config.textValidation.shortTextQualityScore).toBe(0.3);
    });

    it('should handle boolean environment variables correctly', () => {
      process.env.ENABLE_BATCH_CLUSTERING = 'true';
      process.env.ENABLE_FOLDER_CREATION = 'true';
      process.env.ENABLE_CACHING = 'true';

      const config = loadPipelineConfig();

      expect(config.batch.enableBatchClustering).toBe(true);
      expect(config.batch.enableFolderCreation).toBe(true);
      expect(config.cache.enableCaching).toBe(true);
    });

    it('should handle boolean false values correctly', () => {
      process.env.ENABLE_BATCH_CLUSTERING = 'false';
      process.env.ENABLE_FOLDER_CREATION = 'false';
      process.env.ENABLE_CACHING = 'false';

      const config = loadPipelineConfig();

      expect(config.batch.enableBatchClustering).toBe(false);
      expect(config.batch.enableFolderCreation).toBe(false);
      expect(config.cache.enableCaching).toBe(false);
    });

    it('should load vector configuration from environment', () => {
      process.env.VECTOR_DIMENSIONS = '768';
      process.env.MAX_FOLDER_MEMBERS = '2000';
      process.env.CONTEXT_SEARCH_LIMIT = '100';

      const config = loadPipelineConfig();

      expect(config.vector.defaultDimensions).toBe(768);
      expect(config.vector.maxFolderMembers).toBe(2000);
      expect(config.vector.contextSearchLimit).toBe(100);
    });

    it('should load clustering configuration from environment', () => {
      process.env.CLUSTER_SIMILARITY_THRESHOLD = '0.80';
      process.env.MIN_CLUSTER_FOR_SUGGESTION = '3';
      process.env.UNSORTED_SIMILARITY_THRESHOLD = '0.65';
      process.env.UNSORTED_SEARCH_LIMIT = '30';

      const config = loadPipelineConfig();

      expect(config.clustering.clusterSimilarityThreshold).toBe(0.80);
      expect(config.clustering.minClusterForSuggestion).toBe(3);
      expect(config.clustering.unsortedSimilarityThreshold).toBe(0.65);
      expect(config.clustering.unsortedSearchLimit).toBe(30);
    });

    it('should gracefully handle invalid numeric environment variables', () => {
      process.env.HIGH_CONFIDENCE_THRESHOLD = 'invalid';
      process.env.MIN_CLUSTER_SIZE = 'not-a-number';

      const config = loadPipelineConfig();

      // Should fall back to defaults when parsing fails
      expect(config.routing.highConfidenceThreshold).toBe(DEFAULT_PIPELINE_CONFIG.routing.highConfidenceThreshold);
      expect(config.batch.minClusterSize).toBe(DEFAULT_PIPELINE_CONFIG.batch.minClusterSize);
    });
  });

  describe('validatePipelineConfig', () => {
    it('should pass validation for default configuration', () => {
      expect(() => validatePipelineConfig(DEFAULT_PIPELINE_CONFIG)).not.toThrow();
    });

    it('should reject configuration where high confidence threshold is not greater than low confidence', () => {
      const invalidConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        routing: {
          ...DEFAULT_PIPELINE_CONFIG.routing,
          highConfidenceThreshold: 0.6,  // Lower than low confidence threshold
          lowConfidenceThreshold: 0.65
        }
      };

      expect(() => validatePipelineConfig(invalidConfig))
        .toThrow(/High confidence threshold must be greater than low confidence threshold/);
    });

    it('should reject configuration where low confidence threshold is not greater than new topic threshold', () => {
      const invalidConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        routing: {
          ...DEFAULT_PIPELINE_CONFIG.routing,
          lowConfidenceThreshold: 0.4,  // Lower than new topic threshold
          newTopicThreshold: 0.5
        }
      };

      expect(() => validatePipelineConfig(invalidConfig))
        .toThrow(/Low confidence threshold must be greater than new topic threshold/);
    });

    it('should reject configuration with zero or negative minimum text length', () => {
      const invalidConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        textValidation: {
          ...DEFAULT_PIPELINE_CONFIG.textValidation,
          minTextLength: 0
        }
      };

      expect(() => validatePipelineConfig(invalidConfig))
        .toThrow(/Minimum text length must be positive/);
    });

    it('should reject configuration where maximum text length is not greater than minimum', () => {
      const invalidConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        textValidation: {
          ...DEFAULT_PIPELINE_CONFIG.textValidation,
          minTextLength: 1000,
          maxTextLength: 500  // Smaller than minimum
        }
      };

      expect(() => validatePipelineConfig(invalidConfig))
        .toThrow(/Maximum text length must be greater than minimum text length/);
    });

    it('should reject configuration with zero or negative vector dimensions', () => {
      const invalidConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        vector: {
          ...DEFAULT_PIPELINE_CONFIG.vector,
          defaultDimensions: -1
        }
      };

      expect(() => validatePipelineConfig(invalidConfig))
        .toThrow(/Vector dimensions must be positive/);
    });

    it('should accept valid configuration with custom values', () => {
      const validConfig: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        routing: {
          highConfidenceThreshold: 0.90,
          lowConfidenceThreshold: 0.75,
          newTopicThreshold: 0.60,
          duplicateThreshold: 0.95
        },
        textValidation: {
          minTextLength: 5,
          maxTextLength: 10000,
          minQualityScore: 0.4,
          minWordCount: 5,
          shortTextQualityScore: 0.3
        }
      };

      expect(() => validatePipelineConfig(validConfig)).not.toThrow();
    });
  });

  describe('configuration integration', () => {
    it('should maintain consistency between related thresholds', () => {
      const config = loadPipelineConfig();
      
      // Quality score weights should be positive
      expect(config.qualityScore.uniquenessWeight).toBeGreaterThan(0);
      expect(config.qualityScore.lengthWeight).toBeGreaterThan(0);
      
      // Folder scoring weights should be positive
      expect(config.folderScoring.avgSimilarityWeight).toBeGreaterThan(0);
      expect(config.folderScoring.maxSimilarityWeight).toBeGreaterThan(0);
      expect(config.folderScoring.countBonusMultiplier).toBeGreaterThan(0);
      expect(config.folderScoring.maxCountBonus).toBeGreaterThan(0);
    });

    it('should have clustering thresholds within reasonable ranges', () => {
      const config = loadPipelineConfig();
      
      expect(config.clustering.clusterSimilarityThreshold).toBeGreaterThan(0);
      expect(config.clustering.clusterSimilarityThreshold).toBeLessThan(1);
      expect(config.clustering.unsortedSimilarityThreshold).toBeGreaterThan(0);
      expect(config.clustering.unsortedSimilarityThreshold).toBeLessThan(1);
    });

    it('should have cache configuration with reasonable defaults', () => {
      const config = loadPipelineConfig();
      
      expect(config.cache.defaultTtlDays).toBeGreaterThan(0);
      expect(config.cache.enableCaching).toBe(true);
    });
  });

  describe('environment variable edge cases', () => {
    it('should handle empty string environment variables', () => {
      process.env.HIGH_CONFIDENCE_THRESHOLD = '';
      process.env.MIN_CLUSTER_SIZE = '';

      const config = loadPipelineConfig();

      // Should fall back to defaults
      expect(config.routing.highConfidenceThreshold).toBe(DEFAULT_PIPELINE_CONFIG.routing.highConfidenceThreshold);
      expect(config.batch.minClusterSize).toBe(DEFAULT_PIPELINE_CONFIG.batch.minClusterSize);
    });

    it('should handle whitespace-only environment variables', () => {
      process.env.LOW_CONFIDENCE_THRESHOLD = '   ';
      process.env.VECTOR_DIMENSIONS = '  \t  ';

      const config = loadPipelineConfig();

      // Should fall back to defaults or parse as NaN
      expect(config.routing.lowConfidenceThreshold).toBe(DEFAULT_PIPELINE_CONFIG.routing.lowConfidenceThreshold);
      expect(config.vector.defaultDimensions).toBe(DEFAULT_PIPELINE_CONFIG.vector.defaultDimensions);
    });

    it('should handle boolean-like strings correctly', () => {
      process.env.ENABLE_BATCH_CLUSTERING = 'TRUE';
      process.env.ENABLE_FOLDER_CREATION = 'false';  // lowercase false
      process.env.ENABLE_CACHING = '1';

      const config = loadPipelineConfig();

      expect(config.batch.enableBatchClustering).toBe(true);  // 'TRUE' should work
      expect(config.batch.enableFolderCreation).toBe(false); // 'false' (lowercase) disables
      expect(config.cache.enableCaching).toBe(true);         // '1' should work
    });
  });
});