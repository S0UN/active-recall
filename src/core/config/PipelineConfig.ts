/**
 * Pipeline Configuration
 * 
 * Centralized configuration for all pipeline thresholds, limits, and parameters.
 * This file replaces all hardcoded values with configurable settings.
 */

interface RoutingThresholds {
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  newTopicThreshold: number;
  duplicateThreshold: number;
  // Note: folderPlacementThreshold removed - was used for broken multi-folder placement
  // New intelligent system uses binary decision: high confidence OR LLM analysis
}

interface BatchProcessingConfig {
  minClusterSize: number;
  enableBatchClustering: boolean;
  enableFolderCreation: boolean;
}

interface TextValidationConfig {
  minTextLength: number;
  maxTextLength: number;
}

interface VectorConfig {
  defaultDimensions: number;
  maxFolderMembers: number;
  maxExemplars: number;
  contextSearchLimit: number;
  titleSearchLimit: number;
}

interface FolderScoringWeights {
  avgSimilarityWeight: number;
  maxSimilarityWeight: number;
  maxCountBonus: number;
  countBonusMultiplier: number;
}

interface ClusteringConfig {
  clusterSimilarityThreshold: number;
  minClusterForSuggestion: number;
  unsortedSimilarityThreshold: number;
  unsortedSearchLimit: number;
}

interface CacheConfig {
  defaultTtlDays: number;
  enableCaching: boolean;
}

export interface PipelineConfig {
  routing: RoutingThresholds;
  batch: BatchProcessingConfig;
  textValidation: TextValidationConfig;
  vector: VectorConfig;
  folderScoring: FolderScoringWeights;
  clustering: ClusteringConfig;
  cache: CacheConfig;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  routing: {
    highConfidenceThreshold: 0.82,
    lowConfidenceThreshold: 0.65,
    newTopicThreshold: 0.5,
    duplicateThreshold: 0.75
    // Note: folderPlacementThreshold removed - not used in intelligent routing system
  },
  
  batch: {
    minClusterSize: 5,
    enableBatchClustering: true,
    enableFolderCreation: true
  },
  
  textValidation: {
    minTextLength: 3,
    maxTextLength: 5000
  },
  
  vector: {
    defaultDimensions: 1536,
    maxFolderMembers: 1000,
    maxExemplars: 100,
    contextSearchLimit: 50,
    titleSearchLimit: 1
  },
  
  folderScoring: {
    avgSimilarityWeight: 0.6,
    maxSimilarityWeight: 0.2,
    maxCountBonus: 0.3,
    countBonusMultiplier: 0.1
  },
  
  clustering: {
    clusterSimilarityThreshold: 0.75,
    minClusterForSuggestion: 2,
    unsortedSimilarityThreshold: 0.7,
    unsortedSearchLimit: 20
  },
  
  cache: {
    defaultTtlDays: 30,
    enableCaching: true
  }
};

/**
 * Parse float value with fallback to default
 */
function parseFloatWithFallback(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const parsed = parseFloat(value.trim());
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse integer value with fallback to default
 */
function parseIntWithFallback(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const parsed = parseInt(value.trim());
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean value with fallback to default
 */
function parseBooleanWithFallback(value: string | undefined, defaultValue: boolean): boolean {
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const trimmed = value.trim().toLowerCase();
  return trimmed !== 'false' && trimmed !== '0';
}

/**
 * Load configuration from environment variables with fallbacks to defaults
 */
export function loadPipelineConfig(): PipelineConfig {
  return {
    routing: {
      highConfidenceThreshold: parseFloatWithFallback(process.env.HIGH_CONFIDENCE_THRESHOLD, DEFAULT_PIPELINE_CONFIG.routing.highConfidenceThreshold),
      lowConfidenceThreshold: parseFloatWithFallback(process.env.LOW_CONFIDENCE_THRESHOLD, DEFAULT_PIPELINE_CONFIG.routing.lowConfidenceThreshold),
      newTopicThreshold: parseFloatWithFallback(process.env.NEW_TOPIC_THRESHOLD, DEFAULT_PIPELINE_CONFIG.routing.newTopicThreshold),
      duplicateThreshold: parseFloatWithFallback(process.env.DUPLICATE_THRESHOLD, DEFAULT_PIPELINE_CONFIG.routing.duplicateThreshold)
      // Note: FOLDER_PLACEMENT_THRESHOLD env var no longer used - was for broken multi-folder placement
    },
    
    batch: {
      minClusterSize: parseIntWithFallback(process.env.MIN_CLUSTER_SIZE, DEFAULT_PIPELINE_CONFIG.batch.minClusterSize),
      enableBatchClustering: parseBooleanWithFallback(process.env.ENABLE_BATCH_CLUSTERING, DEFAULT_PIPELINE_CONFIG.batch.enableBatchClustering),
      enableFolderCreation: parseBooleanWithFallback(process.env.ENABLE_FOLDER_CREATION, DEFAULT_PIPELINE_CONFIG.batch.enableFolderCreation)
    },
    
    textValidation: {
      minTextLength: parseIntWithFallback(process.env.MIN_TEXT_LENGTH, DEFAULT_PIPELINE_CONFIG.textValidation.minTextLength),
      maxTextLength: parseIntWithFallback(process.env.MAX_TEXT_LENGTH, DEFAULT_PIPELINE_CONFIG.textValidation.maxTextLength)
    },
    
    vector: {
      defaultDimensions: parseIntWithFallback(process.env.VECTOR_DIMENSIONS, DEFAULT_PIPELINE_CONFIG.vector.defaultDimensions),
      maxFolderMembers: parseIntWithFallback(process.env.MAX_FOLDER_MEMBERS, DEFAULT_PIPELINE_CONFIG.vector.maxFolderMembers),
      maxExemplars: parseIntWithFallback(process.env.MAX_EXEMPLARS, DEFAULT_PIPELINE_CONFIG.vector.maxExemplars),
      contextSearchLimit: parseIntWithFallback(process.env.CONTEXT_SEARCH_LIMIT, DEFAULT_PIPELINE_CONFIG.vector.contextSearchLimit),
      titleSearchLimit: parseIntWithFallback(process.env.TITLE_SEARCH_LIMIT, DEFAULT_PIPELINE_CONFIG.vector.titleSearchLimit)
    },
    
    folderScoring: {
      avgSimilarityWeight: parseFloatWithFallback(process.env.AVG_SIMILARITY_WEIGHT, DEFAULT_PIPELINE_CONFIG.folderScoring.avgSimilarityWeight),
      maxSimilarityWeight: parseFloatWithFallback(process.env.MAX_SIMILARITY_WEIGHT, DEFAULT_PIPELINE_CONFIG.folderScoring.maxSimilarityWeight),
      maxCountBonus: parseFloatWithFallback(process.env.MAX_COUNT_BONUS, DEFAULT_PIPELINE_CONFIG.folderScoring.maxCountBonus),
      countBonusMultiplier: parseFloatWithFallback(process.env.COUNT_BONUS_MULTIPLIER, DEFAULT_PIPELINE_CONFIG.folderScoring.countBonusMultiplier)
    },
    
    clustering: {
      clusterSimilarityThreshold: parseFloatWithFallback(process.env.CLUSTER_SIMILARITY_THRESHOLD, DEFAULT_PIPELINE_CONFIG.clustering.clusterSimilarityThreshold),
      minClusterForSuggestion: parseIntWithFallback(process.env.MIN_CLUSTER_FOR_SUGGESTION, DEFAULT_PIPELINE_CONFIG.clustering.minClusterForSuggestion),
      unsortedSimilarityThreshold: parseFloatWithFallback(process.env.UNSORTED_SIMILARITY_THRESHOLD, DEFAULT_PIPELINE_CONFIG.clustering.unsortedSimilarityThreshold),
      unsortedSearchLimit: parseIntWithFallback(process.env.UNSORTED_SEARCH_LIMIT, DEFAULT_PIPELINE_CONFIG.clustering.unsortedSearchLimit)
    },
    
    cache: {
      defaultTtlDays: parseIntWithFallback(process.env.CACHE_TTL_DAYS, DEFAULT_PIPELINE_CONFIG.cache.defaultTtlDays),
      enableCaching: parseBooleanWithFallback(process.env.ENABLE_CACHING, DEFAULT_PIPELINE_CONFIG.cache.enableCaching)
    }
  };
}

/**
 * Validate configuration values are within acceptable ranges
 */
export function validatePipelineConfig(config: PipelineConfig): void {
  const errors: string[] = [];
  
  if (config.routing.highConfidenceThreshold <= config.routing.lowConfidenceThreshold) {
    errors.push('High confidence threshold must be greater than low confidence threshold');
  }
  
  if (config.routing.lowConfidenceThreshold <= config.routing.newTopicThreshold) {
    errors.push('Low confidence threshold must be greater than new topic threshold');
  }
  
  if (config.textValidation.minTextLength <= 0) {
    errors.push('Minimum text length must be positive');
  }
  
  if (config.textValidation.maxTextLength <= config.textValidation.minTextLength) {
    errors.push('Maximum text length must be greater than minimum text length');
  }
  
  if (config.vector.defaultDimensions <= 0) {
    errors.push('Vector dimensions must be positive');
  }
  
  if (errors.length > 0) {
    throw new Error(`Invalid pipeline configuration: ${errors.join(', ')}`);
  }
}