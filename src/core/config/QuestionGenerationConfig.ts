/**
 * Production-grade Question Generation Configuration Loader
 * 
 * Provides comprehensive configuration management for OpenAI-based question generation
 * with advanced features, security, and production-ready defaults.
 * 
 * Features:
 * - Secure environment variable loading with validation
 * - Advanced prompting configuration options for question types
 * - Spaced repetition integration settings
 * - Rate limiting and quota management
 * - Fallback and reliability options
 * - Debug and monitoring configuration
 */

import { config } from 'dotenv';
import { QuestionGenerationConfig } from '../services/IQuestionGenerationService';

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
 * Load comprehensive question generation configuration from environment variables
 * 
 * Provides production-ready defaults while allowing fine-grained customization
 * through environment variables.
 * 
 * @returns Complete QuestionGenerationConfig with all settings
 * @throws Error if required configuration is missing or invalid
 */
export function loadQuestionGenerationConfig(): QuestionGenerationConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    throw new Error(
      'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.\n' +
      'Get your API key from: https://platform.openai.com/api-keys'
    );
  }

  // Parse numeric environment variables with validation
  const maxTokens = parseIntWithRange(process.env.QUESTION_GEN_MAX_TOKENS, 800, 100, 4000, 'QUESTION_GEN_MAX_TOKENS');
  const temperature = parseFloatWithRange(process.env.QUESTION_GEN_TEMPERATURE, 0.3, 0, 2, 'QUESTION_GEN_TEMPERATURE');
  const questionsPerConcept = parseIntWithRange(process.env.QUESTIONS_PER_CONCEPT, 5, 1, 20, 'QUESTIONS_PER_CONCEPT');
  const requestTimeout = parseIntWithRange(process.env.QUESTION_GEN_REQUEST_TIMEOUT, 45000, 5000, 120000, 'QUESTION_GEN_REQUEST_TIMEOUT');
  const retryAttempts = parseIntWithRange(process.env.QUESTION_GEN_RETRY_ATTEMPTS, 3, 0, 10, 'QUESTION_GEN_RETRY_ATTEMPTS');
  const retryDelay = parseIntWithRange(process.env.QUESTION_GEN_RETRY_DELAY, 2000, 100, 10000, 'QUESTION_GEN_RETRY_DELAY');
  const dailyLimit = parseIntWithRange(process.env.QUESTION_GEN_DAILY_LIMIT, 500, 1, 10000, 'QUESTION_GEN_DAILY_LIMIT');
  const burstLimit = parseIntWithRange(process.env.QUESTION_GEN_BURST_LIMIT, 10, 1, 100, 'QUESTION_GEN_BURST_LIMIT');
  const qualityThreshold = parseFloatWithRange(process.env.QUESTION_QUALITY_THRESHOLD, 0.7, 0, 1, 'QUESTION_QUALITY_THRESHOLD');

  return {
    // Core provider settings
    provider: 'openai',
    apiKey,
    
    // Model configuration
    model: process.env.QUESTION_GEN_MODEL || 'gpt-3.5-turbo',
    maxTokens,
    temperature,
    
    // Question generation preferences
    defaultQuestionTypes: process.env.DEFAULT_QUESTION_TYPES?.split(',').map(t => t.trim()) as any[] || [
      'flashcard', 'multiple_choice', 'short_answer'
    ],
    defaultDifficulty: (process.env.DEFAULT_QUESTION_DIFFICULTY as any) || 'intermediate',
    questionsPerConcept,
    
    // Quality control
    qualityThreshold,
    enableValidation: process.env.ENABLE_QUESTION_VALIDATION !== 'false',
    regenerateOnLowQuality: process.env.REGENERATE_ON_LOW_QUALITY !== 'false',
    
    // Performance settings
    cacheEnabled: process.env.QUESTION_CACHE_ENABLED !== 'false',
    requestTimeout,
    retryAttempts,
    retryDelay,
    
    // Rate limiting
    dailyRequestLimit: dailyLimit,
    burstLimit,
    
    // Integration settings
    spacedRepetitionIntegration: process.env.SPACED_REPETITION_INTEGRATION !== 'false',
    adaptiveDifficulty: process.env.ADAPTIVE_DIFFICULTY !== 'false',
    contextPreservation: process.env.CONTEXT_PRESERVATION !== 'false',
    
    // Advanced features
    batchProcessing: process.env.BATCH_PROCESSING !== 'false',
    questionPooling: process.env.QUESTION_POOLING === 'true',
    duplicateDetection: process.env.DUPLICATE_DETECTION !== 'false',
    
    // Monitoring and debugging
    debugMode: process.env.QUESTION_GEN_DEBUG_MODE === 'true',
    logLevel: (process.env.QUESTION_GEN_LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
    metricsEnabled: process.env.QUESTION_GEN_METRICS_ENABLED !== 'false',
  };
}

/**
 * Validate question generation configuration
 * @param config Configuration to validate
 * @returns true if valid, throws otherwise
 */
export function validateQuestionGenerationConfig(config: QuestionGenerationConfig): boolean {
  if (!config.apiKey) {
    throw new Error('OpenAI API key is required for question generation');
  }

  if (config.apiKey.length < 20) {
    throw new Error('Invalid OpenAI API key format');
  }

  if (config.maxTokens && (config.maxTokens < 100 || config.maxTokens > 4000)) {
    throw new Error('maxTokens must be between 100 and 4000 for question generation');
  }

  if (config.temperature && (config.temperature < 0 || config.temperature > 2)) {
    throw new Error('temperature must be between 0 and 2');
  }

  if (config.questionsPerConcept && 
      (config.questionsPerConcept < 1 || config.questionsPerConcept > 20)) {
    throw new Error('questionsPerConcept must be between 1 and 20');
  }

  if (config.qualityThreshold && 
      (config.qualityThreshold < 0 || config.qualityThreshold > 1)) {
    throw new Error('qualityThreshold must be between 0 and 1');
  }

  return true;
}

/**
 * Get a safe version of the config for logging (without sensitive data)
 * @param config Configuration to sanitize
 * @returns Config with API key masked
 */
export function getSafeConfigForLogging(config: QuestionGenerationConfig): Record<string, any> {
  return {
    ...config,
    apiKey: config.apiKey ? `sk-...${config.apiKey.slice(-4)}` : undefined
  };
}

/**
 * Get default question generation configuration for testing
 * @returns Basic config suitable for testing environments
 */
export function getTestQuestionGenerationConfig(): QuestionGenerationConfig {
  return {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    model: 'gpt-3.5-turbo',
    maxTokens: 400,
    temperature: 0.3,
    defaultQuestionTypes: ['flashcard', 'multiple_choice'],
    defaultDifficulty: 'intermediate',
    questionsPerConcept: 3,
    qualityThreshold: 0.6,
    enableValidation: true,
    regenerateOnLowQuality: false,
    cacheEnabled: false,
    requestTimeout: 30000,
    retryAttempts: 1,
    retryDelay: 1000,
    dailyRequestLimit: 100,
    burstLimit: 5,
    spacedRepetitionIntegration: true,
    adaptiveDifficulty: true,
    contextPreservation: true,
    batchProcessing: false,
    questionPooling: false,
    duplicateDetection: true,
    debugMode: true,
    logLevel: 'debug',
    metricsEnabled: false,
  };
}