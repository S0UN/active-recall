/**
 * Production-grade OpenAI Configuration Loader
 * 
 * Provides comprehensive configuration management for OpenAI-based distillation
 * with advanced features, security, and production-ready defaults.
 * 
 * Features:
 * - Secure environment variable loading with validation
 * - Advanced prompting configuration options
 * - Multi-concept extraction settings
 * - Rate limiting and quota management
 * - Fallback and reliability options
 * - Debug and monitoring configuration
 */

import { config } from 'dotenv';
import { DistillationConfig } from '../services/IDistillationService';

// Load environment variables from .env file
config();

/**
 * Parse integer environment variable with range validation
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
 * Parse float environment variable with range validation
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
 * Load comprehensive OpenAI configuration from environment variables
 * 
 * Provides production-ready defaults while allowing fine-grained customization
 * through environment variables.
 * 
 * @returns Complete DistillationConfig with all OpenAI settings
 * @throws Error if required configuration is missing or invalid
 */
export function loadOpenAIConfig(): DistillationConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    throw new Error(
      'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.\n' +
      'Get your API key from: https://platform.openai.com/api-keys'
    );
  }

  // Parse numeric environment variables with validation
  const maxTokens = parseIntWithRange(process.env.OPENAI_MAX_TOKENS, 200, 1, 4000, 'OPENAI_MAX_TOKENS');
  const temperature = parseFloatWithRange(process.env.OPENAI_TEMPERATURE, 0.1, 0, 2, 'OPENAI_TEMPERATURE');
  const maxConcepts = parseIntWithRange(process.env.MAX_CONCEPTS_PER_DISTILLATION, 5, 1, 10, 'MAX_CONCEPTS_PER_DISTILLATION');
  const requestTimeout = parseIntWithRange(process.env.REQUEST_TIMEOUT, 30000, 5000, 120000, 'REQUEST_TIMEOUT');
  const retryAttempts = parseIntWithRange(process.env.RETRY_ATTEMPTS, 3, 0, 10, 'RETRY_ATTEMPTS');
  const retryDelay = parseIntWithRange(process.env.RETRY_DELAY, 1000, 100, 10000, 'RETRY_DELAY');
  const dailyLimit = parseIntWithRange(process.env.DAILY_REQUEST_LIMIT, 1000, 1, 100000, 'DAILY_REQUEST_LIMIT');
  const burstLimit = parseIntWithRange(process.env.BURST_LIMIT, 10, 1, 100, 'BURST_LIMIT');

  return {
    // Core provider settings
    provider: 'openai',
    apiKey,
    
    // Model configuration
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens,
    temperature,
    
    // Performance and reliability
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    requestTimeout,
    retryAttempts,
    retryDelay,
    
    // Multi-concept extraction
    multiConceptEnabled: process.env.MULTI_CONCEPT_ENABLED === 'true',
    maxConceptsPerDistillation: maxConcepts,
    specificityEnforcement: process.env.SPECIFICITY_ENFORCEMENT !== 'false',
    
    // Rate limiting and quota management
    dailyRequestLimit: dailyLimit,
    burstLimit,
    quotaWarningThreshold: parseFloat(process.env.QUOTA_WARNING_THRESHOLD || '0.8'),
    
    // Advanced prompting
    promptVersion: process.env.PROMPT_VERSION || 'v2.0-specificity',
    chainOfThoughtEnabled: process.env.CHAIN_OF_THOUGHT_ENABLED !== 'false',
    fewShotExamplesEnabled: process.env.FEW_SHOT_EXAMPLES_ENABLED !== 'false',
    ocrAwarenessEnabled: process.env.OCR_AWARENESS_ENABLED !== 'false',
    
    // Content filtering
    educationalContentFilter: process.env.EDUCATIONAL_CONTENT_FILTER !== 'false',
    commercialContentFilter: process.env.COMMERCIAL_CONTENT_FILTER !== 'false',
    minContentLength: parseIntWithRange(process.env.MIN_CONTENT_LENGTH, 10, 1, 1000, 'MIN_CONTENT_LENGTH'),
    maxContentLength: parseIntWithRange(process.env.MAX_CONTENT_LENGTH, 50000, 1000, 100000, 'MAX_CONTENT_LENGTH'),
    
    // Fallback behavior
    fallbackEnabled: process.env.FALLBACK_ENABLED !== 'false',
    fallbackStrategy: (process.env.FALLBACK_STRATEGY as 'simple' | 'rule-based' | 'local-model') || 'simple',
    
    // Monitoring and debugging
    debugMode: process.env.DEBUG_MODE === 'true',
    logLevel: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
  };
}

/**
 * Validate OpenAI configuration
 * @param config Configuration to validate
 * @returns true if valid, throws otherwise
 */
export function validateOpenAIConfig(config: DistillationConfig): boolean {
  if (!config.apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (config.apiKey.length < 20) {
    throw new Error('Invalid OpenAI API key format');
  }

  if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 4000)) {
    throw new Error('maxTokens must be between 1 and 4000');
  }

  if (config.temperature && (config.temperature < 0 || config.temperature > 2)) {
    throw new Error('temperature must be between 0 and 2');
  }

  if (config.maxConceptsPerDistillation && 
      (config.maxConceptsPerDistillation < 1 || config.maxConceptsPerDistillation > 10)) {
    throw new Error('maxConceptsPerDistillation must be between 1 and 10');
  }

  return true;
}

/**
 * Get a safe version of the config for logging (without sensitive data)
 * @param config Configuration to sanitize
 * @returns Config with API key masked
 */
export function getSafeConfigForLogging(config: DistillationConfig): Record<string, any> {
  return {
    ...config,
    apiKey: config.apiKey ? `sk-...${config.apiKey.slice(-4)}` : undefined
  };
}