import { DistillationConfig } from '../services/IDistillationService';
import { getModelConfig, LLM_PROVIDERS_CONFIG } from './providers/llm-providers.config';

/**
 * Type-safe harm block threshold options for Gemini safety settings
 */
export type HarmBlockThreshold = 'BLOCK_NONE' | 'BLOCK_LOW' | 'BLOCK_MEDIUM' | 'BLOCK_HIGH';

/**
 * Type-safe safety categories for Gemini content filtering
 */
export type SafetyCategory = 'harassment' | 'hate_speech' | 'sexually_explicit' | 'dangerous_content';

/**
 * Type-safe fallback strategy options
 */
export type FallbackStrategy = 'simple' | 'rule-based' | 'local-model';

/**
 * Type-safe log level options
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Gemini-specific configuration interface extending the base DistillationConfig
 * Uses explicit types instead of any/string for better type safety
 */
export interface GeminiConfig extends DistillationConfig {
  readonly provider: 'gemini';  // Use readonly for immutable properties
  readonly apiKey: string;
  readonly model: string;
  readonly projectId?: string;
  readonly location?: string;
  
  // Gemini-specific options with strict typing
  readonly safetySettings?: {
    readonly harmBlockThreshold?: HarmBlockThreshold;
    readonly categories?: readonly SafetyCategory[];  // Use readonly arrays for immutable config
  };
  
  // Generation configuration with strict typing
  readonly generationConfig?: {
    readonly stopSequences?: readonly string[];
    readonly candidateCount?: number;
    readonly topK?: number;
    readonly topP?: number;
  };
  
  // Override parent types with more specific ones
  readonly fallbackStrategy?: FallbackStrategy;
  readonly logLevel?: LogLevel;
}

/**
 * Helper function to parse integer with validation
 */
function parseIntWithRange(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  varName: string
): number {
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`${varName} must be a valid integer, got: ${value}`);
  }
  
  if (parsed < min || parsed > max) {
    throw new Error(`${varName} must be between ${min} and ${max}, got: ${parsed}`);
  }
  
  return parsed;
}

/**
 * Helper function to parse float with validation
 */
function parseFloatWithRange(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  varName: string
): number {
  if (!value) return defaultValue;
  
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`${varName} must be a valid number, got: ${value}`);
  }
  
  if (parsed < min || parsed > max) {
    throw new Error(`${varName} must be between ${min} and ${max}, got: ${parsed}`);
  }
  
  return parsed;
}

/**
 * Helper function to parse boolean environment variables
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Type-safe parser for fallback strategy with validation
 */
function parseFallbackStrategy(value: string | undefined): FallbackStrategy {
  const validStrategies: readonly FallbackStrategy[] = ['simple', 'rule-based', 'local-model'] as const;
  if (!value) return 'simple';
  
  const strategy = value.toLowerCase() as FallbackStrategy;
  if (validStrategies.includes(strategy)) {
    return strategy;
  }
  
  console.warn(`Invalid fallback strategy: ${value}, using default: simple`);
  return 'simple';
}

/**
 * Type-safe parser for log level with validation
 */
function parseLogLevel(value: string | undefined): LogLevel {
  const validLevels: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'] as const;
  if (!value) return 'info';
  
  const level = value.toLowerCase() as LogLevel;
  if (validLevels.includes(level)) {
    return level;
  }
  
  console.warn(`Invalid log level: ${value}, using default: info`);
  return 'info';
}

/**
 * Type-safe parser for harm block threshold with validation
 */
function parseHarmBlockThreshold(value: string | undefined): HarmBlockThreshold {
  const validThresholds: readonly HarmBlockThreshold[] = ['BLOCK_NONE', 'BLOCK_LOW', 'BLOCK_MEDIUM', 'BLOCK_HIGH'] as const;
  if (!value) return 'BLOCK_MEDIUM';
  
  const threshold = value.toUpperCase() as HarmBlockThreshold;
  if (validThresholds.includes(threshold)) {
    return threshold;
  }
  
  console.warn(`Invalid harm block threshold: ${value}, using default: BLOCK_MEDIUM`);
  return 'BLOCK_MEDIUM';
}

/**
 * Type-safe parser for safety categories with validation
 */
function parseSafetyCategories(value: string | undefined): readonly SafetyCategory[] | undefined {
  if (!value) return undefined;
  
  const validCategories: readonly SafetyCategory[] = ['harassment', 'hate_speech', 'sexually_explicit', 'dangerous_content'] as const;
  const categories = value.split(',').map(c => c.trim().toLowerCase()) as SafetyCategory[];
  
  const validatedCategories = categories.filter(category => {
    if (validCategories.includes(category)) {
      return true;
    }
    console.warn(`Invalid safety category: ${category}, ignoring`);
    return false;
  });
  
  return validatedCategories.length > 0 ? validatedCategories : undefined;
}

/**
 * Load Gemini configuration from environment variables
 */
export function loadGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for Gemini provider');
  }
  
  // Determine model from environment or use default
  const modelEnv = process.env.GEMINI_MODEL || 'flash-lite';
  const modelKey = modelEnv.toUpperCase().replace(/-/g, '_');
  const modelConfig = getModelConfig('GEMINI', modelKey) || 
                     getModelConfig('GEMINI', 'FLASH_LITE')!;
  
  // Load thresholds with model-specific overrides
  const flushThreshold = parseIntWithRange(
    process.env[`GEMINI_${modelKey}_THRESHOLD`] || process.env.BATCH_FLUSH_THRESHOLD,
    modelConfig.flushThreshold,
    1000,
    1000000,
    'Flush threshold'
  );
  
  const config: GeminiConfig = {
    // Core settings
    provider: 'gemini',
    apiKey,
    model: modelConfig.name,
    projectId: process.env.GEMINI_PROJECT_ID,
    location: process.env.GEMINI_LOCATION || 'us-central1',
    
    // Model parameters
    maxTokens: parseIntWithRange(
      process.env.GEMINI_MAX_TOKENS,
      modelConfig.maxTokens || 200,
      1,
      modelConfig.maxTokens,
      'GEMINI_MAX_TOKENS'
    ),
    temperature: parseFloatWithRange(
      process.env.GEMINI_TEMPERATURE,
      0.1,
      0.0,
      2.0,
      'GEMINI_TEMPERATURE'
    ),
    
    // Performance settings
    cacheEnabled: parseBoolean(process.env.CACHE_ENABLED, true),
    requestTimeout: parseIntWithRange(
      process.env.GEMINI_REQUEST_TIMEOUT,
      30000,
      1000,
      600000,
      'GEMINI_REQUEST_TIMEOUT'
    ),
    retryAttempts: parseIntWithRange(
      process.env.GEMINI_RETRY_ATTEMPTS,
      3,
      0,
      10,
      'GEMINI_RETRY_ATTEMPTS'
    ),
    retryDelay: parseIntWithRange(
      process.env.GEMINI_RETRY_DELAY,
      1000,
      100,
      60000,
      'GEMINI_RETRY_DELAY'
    ),
    
    // Multi-concept settings
    multiConceptEnabled: parseBoolean(process.env.GEMINI_MULTI_CONCEPT_ENABLED, true),
    maxConceptsPerDistillation: parseIntWithRange(
      process.env.GEMINI_MAX_CONCEPTS_PER_DISTILLATION,
      5,
      1,
      10,
      'GEMINI_MAX_CONCEPTS_PER_DISTILLATION'
    ),
    specificityEnforcement: parseBoolean(process.env.GEMINI_SPECIFICITY_ENFORCEMENT, true),
    
    // Rate limiting
    dailyRequestLimit: parseIntWithRange(
      process.env.GEMINI_DAILY_REQUEST_LIMIT,
      10000,
      1,
      1000000,
      'GEMINI_DAILY_REQUEST_LIMIT'
    ),
    burstLimit: parseIntWithRange(
      process.env.GEMINI_BURST_LIMIT,
      10,
      1,
      100,
      'GEMINI_BURST_LIMIT'
    ),
    quotaWarningThreshold: parseFloatWithRange(
      process.env.GEMINI_QUOTA_WARNING_THRESHOLD,
      0.8,
      0.1,
      1.0,
      'GEMINI_QUOTA_WARNING_THRESHOLD'
    ),
    
    // Advanced prompting
    promptVersion: process.env.GEMINI_PROMPT_VERSION || 'v2.0-gemini',
    chainOfThoughtEnabled: parseBoolean(process.env.GEMINI_CHAIN_OF_THOUGHT_ENABLED, true),
    fewShotExamplesEnabled: parseBoolean(process.env.GEMINI_FEW_SHOT_EXAMPLES_ENABLED, true),
    ocrAwarenessEnabled: parseBoolean(process.env.GEMINI_OCR_AWARENESS_ENABLED, true),
    
    // Content filtering
    educationalContentFilter: parseBoolean(process.env.GEMINI_EDUCATIONAL_CONTENT_FILTER, true),
    commercialContentFilter: parseBoolean(process.env.GEMINI_COMMERCIAL_CONTENT_FILTER, true),
    minContentLength: parseIntWithRange(
      process.env.GEMINI_MIN_CONTENT_LENGTH,
      10,
      1,
      1000,
      'GEMINI_MIN_CONTENT_LENGTH'
    ),
    maxContentLength: parseIntWithRange(
      process.env.GEMINI_MAX_CONTENT_LENGTH,
      50000,
      100,
      1000000,
      'GEMINI_MAX_CONTENT_LENGTH'
    ),
    
    // Fallback behavior
    fallbackEnabled: parseBoolean(process.env.GEMINI_FALLBACK_ENABLED, true),
    fallbackStrategy: parseFallbackStrategy(process.env.GEMINI_FALLBACK_STRATEGY),
    
    // Monitoring
    debugMode: parseBoolean(process.env.GEMINI_DEBUG_MODE, false),
    logLevel: parseLogLevel(process.env.GEMINI_LOG_LEVEL),
    metricsEnabled: parseBoolean(process.env.GEMINI_METRICS_ENABLED, false),
    
    // Gemini-specific safety settings
    safetySettings: {
      harmBlockThreshold: parseHarmBlockThreshold(process.env.GEMINI_HARM_BLOCK_THRESHOLD),
      categories: parseSafetyCategories(process.env.GEMINI_SAFETY_CATEGORIES)
    },
    
    // Generation configuration
    generationConfig: {
      stopSequences: process.env.GEMINI_STOP_SEQUENCES?.split(',').map(s => s.trim()),
      candidateCount: parseIntWithRange(
        process.env.GEMINI_CANDIDATE_COUNT,
        1,
        1,
        8,
        'GEMINI_CANDIDATE_COUNT'
      ),
      topK: parseIntWithRange(
        process.env.GEMINI_TOP_K,
        40,
        1,
        100,
        'GEMINI_TOP_K'
      ),
      topP: parseFloatWithRange(
        process.env.GEMINI_TOP_P,
        0.95,
        0.0,
        1.0,
        'GEMINI_TOP_P'
      )
    }
  };
  
  // Log configuration in debug mode
  if (config.debugMode) {
    console.log('[GeminiConfig] Loaded configuration:', {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      multiConceptEnabled: config.multiConceptEnabled,
      flushThreshold
    });
  }
  
  return config;
}

/**
 * Get the appropriate flush threshold for the current Gemini model
 */
export function getGeminiFlushThreshold(): number {
  try {
    const modelEnv = process.env.GEMINI_MODEL || 'flash-lite';
    const modelKey = modelEnv.toUpperCase().replace(/-/g, '_');
    
    // Check for model-specific threshold first
    const specificThreshold = process.env[`GEMINI_${modelKey}_THRESHOLD`];
    if (specificThreshold) {
      return parseIntWithRange(specificThreshold, 60000, 1000, 1000000, 'Model threshold');
    }
    
    // Fall back to model config default
    const modelConfig = getModelConfig('GEMINI', modelKey);
    if (modelConfig) {
      return modelConfig.flushThreshold;
    }
    
    // Final fallback
    return 60000;
  } catch (error) {
    console.error('[GeminiConfig] Error getting flush threshold:', error);
    return 60000;
  }
}