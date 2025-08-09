/**
 * Configuration schema and validation for Concept Organizer
 * 
 * This file defines:
 * - Complete configuration structure with validation
 * - Environment-specific overrides
 * - Type-safe access to configuration values
 * - Runtime validation with helpful error messages
 * 
 * Design principles:
 * - Schema-first configuration
 * - Fail fast on invalid config
 * - Clear validation error messages
 * - Environment-based profiles
 */

import { z } from 'zod';

// =============================================================================
// BASIC CONFIGURATION SCHEMAS
// =============================================================================

/**
 * Environment types with specific behavior
 */
const EnvironmentSchema = z.enum(['development', 'test', 'production']);

/**
 * Log level configuration
 */
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * Database connection configuration
 */
const DatabaseConfigSchema = z.object({
  // SQLite database path
  sqlite: z.object({
    path: z.string().min(1),
    enableWAL: z.boolean().default(true),
    busyTimeout: z.number().int().min(1000).default(30000),
  }),
  
  // Redis configuration (optional)
  redis: z.object({
    enabled: z.boolean().default(true),
    url: z.string().url().optional(),
    host: z.string().default('localhost'),
    port: z.number().int().min(1).max(65535).default(6379),
    password: z.string().optional(),
    db: z.number().int().min(0).default(0),
    keyPrefix: z.string().default('concept-organizer:'),
  }).optional(),
});

/**
 * Vector database configuration
 */
const VectorConfigSchema = z.object({
  // Qdrant connection
  qdrant: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    timeout: z.number().int().min(1000).default(30000),
    
    // Collection names
    collections: z.object({
      concepts: z.string().min(1).default('concept-artifacts'),
      folders: z.string().min(1).default('folder-centroids'),
    }),
    
    // HNSW parameters for performance tuning
    hnsw: z.object({
      m: z.number().int().min(4).max(64).default(16),
      efConstruct: z.number().int().min(4).max(512).default(200),
      efSearch: z.number().int().min(1).max(512).default(100),
    }),
  }),
  
  // Embedding configuration
  embeddings: z.object({
    // Provider selection
    provider: z.enum(['local', 'openai', 'huggingface']).default('local'),
    
    // Local model configuration (Transformers.js)
    local: z.object({
      modelPath: z.string().default('./models/'),
      modelName: z.string().default('distilbert-mnli'),
      cacheEmbeddings: z.boolean().default(true),
      batchSize: z.number().int().min(1).max(100).default(32),
    }),
    
    // OpenAI configuration
    openai: z.object({
      apiKey: z.string().optional(),
      model: z.string().default('text-embedding-3-small'),
      dimensions: z.number().int().min(256).max(3072).default(1536),
      batchSize: z.number().int().min(1).max(2048).default(100),
    }).optional(),
    
    // HuggingFace configuration
    huggingface: z.object({
      apiKey: z.string().optional(),
      model: z.string().default('sentence-transformers/all-MiniLM-L6-v2'),
      endpoint: z.string().url().optional(),
    }).optional(),
  }),
});

/**
 * Processing pipeline configuration
 */
const ProcessingConfigSchema = z.object({
  // Text assembly configuration
  assembly: z.object({
    minTextLength: z.number().int().min(1).default(10),
    minWordCount: z.number().int().min(1).default(3),
    maxTextLength: z.number().int().min(100).default(5000),
    minQualityScore: z.number().min(0).max(1).default(0.3),
    enableStitching: z.boolean().default(true),
    maxStitchDistance: z.number().int().min(1).default(5),
  }),
  
  // Routing thresholds
  routing: z.object({
    highConfidenceThreshold: z.number().min(0).max(1).default(0.82),
    lowConfidenceThreshold: z.number().min(0).max(1).default(0.65),
    crossLinkDelta: z.number().min(0).max(0.5).default(0.03),
    crossLinkMinScore: z.number().min(0).max(1).default(0.79),
    maxCrossLinks: z.number().int().min(0).max(10).default(3),
    maxFolderDepth: z.number().int().min(1).max(6).default(4),
  }),
  
  // Batch processing
  batching: z.object({
    maxBatchSize: z.number().int().min(1).max(1000).default(50),
    batchTimeoutMs: z.number().int().min(100).max(60000).default(5000),
    maxConcurrentBatches: z.number().int().min(1).max(20).default(5),
    retryAttempts: z.number().int().min(0).max(10).default(3),
    retryDelayMs: z.number().int().min(100).max(30000).default(1000),
  }),
});

/**
 * LLM service configuration
 */
const LLMConfigSchema = z.object({
  // Enable/disable LLM features
  enabled: z.boolean().default(false),
  
  // Provider configuration
  provider: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
  
  // OpenAI configuration
  openai: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gpt-3.5-turbo'),
    temperature: z.number().min(0).max(2).default(0.1),
    maxTokens: z.number().int().min(1).max(4096).default(1000),
    timeout: z.number().int().min(1000).max(60000).default(30000),
  }).optional(),
  
  // Token budget limits
  budget: z.object({
    dailyTokenLimit: z.number().int().min(0).default(100000),
    monthlyTokenLimit: z.number().int().min(0).default(1000000),
    costPerTokenUSD: z.number().min(0).default(0.0000015), // GPT-3.5-turbo input cost
    alertThreshold: z.number().min(0).max(1).default(0.8), // 80% of limit
  }),
  
  // Operation-specific limits
  operations: z.object({
    summaryGeneration: z.object({
      enabled: z.boolean().default(true),
      maxTokens: z.number().int().min(50).max(2000).default(500),
      cacheResults: z.boolean().default(true),
    }),
    
    routingArbitration: z.object({
      enabled: z.boolean().default(true),
      maxTokens: z.number().int().min(100).max(1000).default(300),
      onlyForAmbiguous: z.boolean().default(true),
    }),
    
    folderRenaming: z.object({
      enabled: z.boolean().default(true),
      maxTokens: z.number().int().min(50).max(500).default(200),
      batchSize: z.number().int().min(1).max(50).default(10),
    }),
  }),
});

/**
 * Storage paths and file management
 */
const StorageConfigSchema = z.object({
  // Base paths
  basePath: z.string().min(1).default('./data'),
  knowledgeBasePath: z.string().min(1).default('./data/knowledge-base'),
  
  // File management
  files: z.object({
    createMarkdown: z.boolean().default(false), // JSON only by default
    atomicWrites: z.boolean().default(true),
    backupOnWrite: z.boolean().default(false),
    compressionEnabled: z.boolean().default(false),
  }),
  
  // Audit logging
  audit: z.object({
    enabled: z.boolean().default(true),
    logPath: z.string().min(1).default('./data/audit'),
    rotateDaily: z.boolean().default(true),
    retentionDays: z.number().int().min(1).default(90),
    compressOldLogs: z.boolean().default(true),
  }),
  
  // Backup configuration
  backup: z.object({
    enabled: z.boolean().default(true),
    schedule: z.string().default('0 2 * * *'), // Daily at 2 AM
    retentionDays: z.number().int().min(1).default(30),
    compressBackups: z.boolean().default(true),
    verifyIntegrity: z.boolean().default(true),
  }),
});

/**
 * Feature flags for gradual rollout
 */
const FeatureFlagsSchema = z.object({
  // Core features
  localOnlyMode: z.boolean().default(true),
  hybridMode: z.boolean().default(false),
  cloudMode: z.boolean().default(false),
  
  // AI features
  enableLLMSummaries: z.boolean().default(false),
  enableLLMArbitration: z.boolean().default(false),
  enableReranker: z.boolean().default(false),
  
  // Quality features
  enableDeduplication: z.boolean().default(true),
  enableCrossLinking: z.boolean().default(true),
  enableReviewQueue: z.boolean().default(true),
  
  // Maintenance features  
  enableBackgroundJobs: z.boolean().default(true),
  enableAutoRename: z.boolean().default(false),
  enableAutoTidy: z.boolean().default(false),
  
  // Performance features
  enableCaching: z.boolean().default(true),
  enableBatching: z.boolean().default(true),
  enableIndexOptimization: z.boolean().default(true),
});

/**
 * Logging and observability configuration
 */
const ObservabilityConfigSchema = z.object({
  // Logging configuration
  logging: z.object({
    level: LogLevelSchema.default('info'),
    console: z.boolean().default(true),
    file: z.boolean().default(true),
    filePath: z.string().default('./data/logs/concept-organizer.log'),
    maxFileSize: z.string().default('10MB'),
    maxFiles: z.number().int().min(1).default(5),
    structured: z.boolean().default(true), // JSON logging
  }),
  
  // Metrics configuration  
  metrics: z.object({
    enabled: z.boolean().default(true),
    collectInterval: z.number().int().min(1000).default(60000), // 1 minute
    retentionHours: z.number().int().min(1).default(24),
    exportPrometheus: z.boolean().default(false),
    prometheusPort: z.number().int().min(1024).max(65535).default(9090),
  }),
  
  // Health checks
  health: z.object({
    enabled: z.boolean().default(true),
    port: z.number().int().min(1024).max(65535).default(3001),
    endpoint: z.string().default('/health'),
    checkInterval: z.number().int().min(1000).default(30000), // 30 seconds
  }),
});

// =============================================================================
// COMPLETE CONFIGURATION SCHEMA
// =============================================================================

/**
 * Complete configuration schema with all sections
 */
export const ConfigSchema = z.object({
  // Environment and basic settings
  environment: EnvironmentSchema.default('development'),
  nodeEnv: z.string().default('development'),
  
  // Core configuration sections
  database: DatabaseConfigSchema,
  vector: VectorConfigSchema,
  processing: ProcessingConfigSchema,
  llm: LLMConfigSchema,
  storage: StorageConfigSchema,
  features: FeatureFlagsSchema,
  observability: ObservabilityConfigSchema,
  
  // Integration settings (for existing services)
  integration: z.object({
    batcherService: z.object({
      enabled: z.boolean().default(true),
      bridgeToCore: z.boolean().default(true), // Bridge batches to core pipeline
    }),
    
    orchestrator: z.object({
      enabled: z.boolean().default(true),
      useCoreRouter: z.boolean().default(false), // Gradually migrate
    }),
  }),
}).refine(
  (config) => {
    // Validation: routing thresholds must be ordered
    return config.processing.routing.lowConfidenceThreshold <= 
           config.processing.routing.highConfidenceThreshold;
  },
  {
    message: 'High confidence threshold must be >= low confidence threshold',
    path: ['processing', 'routing'],
  }
).refine(
  (config) => {
    // Validation: LLM must be configured if enabled
    if (config.llm.enabled) {
      if (config.llm.provider === 'openai' && !config.llm.openai?.apiKey) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'LLM provider must be configured when LLM is enabled',
    path: ['llm'],
  }
);

// =============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// =============================================================================

/**
 * Development environment defaults
 */
export const DevelopmentConfig = {
  environment: 'development',
  
  database: {
    sqlite: {
      path: './data/sqlite/concept-organizer-dev.db',
    },
    redis: {
      enabled: true,
      host: 'localhost',
      port: 6379,
    },
  },
  
  vector: {
    qdrant: {
      url: 'http://localhost:6333',
    },
    embeddings: {
      provider: 'local',
      local: {
        cacheEmbeddings: true,
      },
    },
  },
  
  llm: {
    enabled: false, // Disabled by default in development
  },
  
  features: {
    localOnlyMode: true,
    enableLLMSummaries: false,
    enableBackgroundJobs: true,
  },
  
  observability: {
    logging: {
      level: 'debug',
      console: true,
    },
  },
} as const;

/**
 * Test environment defaults
 */
export const TestConfig = {
  environment: 'test',
  
  database: {
    sqlite: {
      path: ':memory:', // In-memory for tests
    },
    redis: {
      enabled: false, // Disable Redis in tests
    },
  },
  
  vector: {
    qdrant: {
      url: 'http://localhost:6333', // Use Docker Compose instance
    },
  },
  
  llm: {
    enabled: false,
  },
  
  features: {
    localOnlyMode: true,
    enableCaching: false,
    enableBackgroundJobs: false,
  },
  
  observability: {
    logging: {
      level: 'warn', // Reduce test noise
      console: false,
      file: false,
    },
    metrics: {
      enabled: false,
    },
  },
} as const;

/**
 * Production environment defaults
 */
export const ProductionConfig = {
  environment: 'production',
  
  features: {
    localOnlyMode: false,
    hybridMode: true,
    enableLLMSummaries: true,
    enableBackgroundJobs: true,
  },
  
  storage: {
    backup: {
      enabled: true,
      verifyIntegrity: true,
    },
  },
  
  observability: {
    logging: {
      level: 'info',
      structured: true,
    },
    metrics: {
      enabled: true,
      exportPrometheus: true,
    },
  },
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Config = z.infer<typeof ConfigSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;

// Component-specific config types
export type DatabaseConfig = Config['database'];
export type VectorConfig = Config['vector'];
export type ProcessingConfig = Config['processing'];
export type LLMConfig = Config['llm'];
export type StorageConfig = Config['storage'];
export type FeatureFlags = Config['features'];
export type ObservabilityConfig = Config['observability'];