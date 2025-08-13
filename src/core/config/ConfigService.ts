/**
 * Configuration service with environment-based loading and validation
 * 
 * This file provides:
 * - Type-safe configuration loading from multiple sources
 * - Environment variable mapping with validation
 * - Runtime configuration validation with helpful errors
 * - Hot configuration reloading for development
 * 
 * Design principles:
 * - Fail fast on invalid configuration
 * - Support multiple configuration sources (.env, environment, files)
 * - Provide clear error messages for misconfigurations
 * - Enable easy testing with configuration overrides
 */

import { readFileSync, existsSync, watchFile } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { 
  Config, 
  ConfigSchema, 
  DevelopmentConfig, 
  TestConfig, 
  ProductionConfig, 
  Environment 
} from './ConfigSchema';

/**
 * Configuration error class
 */
class ConfigurationError extends Error {
  constructor(
    public readonly code: string,
    public readonly key: string,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Configuration loading options
 */
export interface ConfigLoadOptions {
  environment?: Environment;
  envFile?: string;
  configFile?: string;
  overrides?: Partial<Config>;
  validateOnly?: boolean;
}

/**
 * Configuration service with validation and hot reloading
 */
export class ConfigService {
  private config: Config;
  private watchers: Set<() => void> = new Set();
  private fileWatcher?: () => void;
  
  constructor(options: ConfigLoadOptions = {}) {
    this.config = this.loadConfiguration(options);
  }
  
  /**
   * Load and validate configuration from multiple sources
   */
  private loadConfiguration(options: ConfigLoadOptions): Config {
    try {
      // Step 1: Load environment variables
      this.loadEnvironmentVariables(options.envFile);
      
      // Step 2: Determine environment
      const environment = options.environment || 
        (process.env.NODE_ENV as Environment) || 
        'development';
      
      // Step 3: Get base configuration for environment
      const baseConfig = this.getBaseConfig(environment);
      
      // Step 4: Load from configuration file if specified
      const fileConfig = options.configFile ? 
        this.loadConfigFile(options.configFile) : {};
      
      // Step 5: Load from environment variables
      const envConfig = this.loadFromEnvironment();
      
      // Step 6: Merge configurations in order of precedence
      // File config < Environment variables < Explicit overrides
      const mergedConfig = {
        ...baseConfig,
        ...fileConfig,
        ...envConfig,
        ...options.overrides,
        environment, // Always use determined environment
      };
      
      // Step 7: Validate final configuration
      const validatedConfig = ConfigSchema.parse(mergedConfig);
      
      // Step 8: Set up file watching for development
      if (options.configFile && environment === 'development') {
        this.watchConfigFile(options.configFile);
      }
      
      return validatedConfig;
      
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError(
          'configuration',
          error.message,
          'Failed to load and validate configuration',
          { options, originalError: error.message }
        );
      }
      throw error;
    }
  }
  
  /**
   * Load environment variables from .env file
   */
  private loadEnvironmentVariables(envFile?: string): void {
    // Load from specified file or default locations
    const envPaths = envFile ? [envFile] : [
      '.env.local',
      `.env.${process.env.NODE_ENV}`,
      '.env',
    ];
    
    for (const path of envPaths) {
      if (existsSync(resolve(path))) {
        loadDotenv({ path: resolve(path) });
        break;
      }
    }
  }
  
  /**
   * Get base configuration for environment
   */
  private getBaseConfig(environment: Environment): Partial<Config> {
    switch (environment) {
      case 'development':
        return DevelopmentConfig as Partial<Config>;
      case 'test':
        return TestConfig as Partial<Config>;
      case 'production':
        return ProductionConfig as Partial<Config>;
      default:
        return DevelopmentConfig as Partial<Config>;
    }
  }
  
  /**
   * Load configuration from JSON/YAML file
   */
  private loadConfigFile(filePath: string): Partial<Config> {
    try {
      const fullPath = resolve(filePath);
      if (!existsSync(fullPath)) {
        throw new Error(`Configuration file not found: ${fullPath}`);
      }
      
      const content = readFileSync(fullPath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return JSON.parse(content);
      } else if (filePath.endsWith('.js')) {
        // Dynamic import for JS config files
        delete require.cache[fullPath];
        return require(fullPath);
      } else {
        throw new Error(`Unsupported configuration file format: ${filePath}`);
      }
      
    } catch (error) {
      throw new ConfigurationError(
        'config-file',
        filePath,
        `Failed to load configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { filePath }
      );
    }
  }
  
  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): Partial<Config> {
    const env = process.env;
    
    // Map environment variables to configuration structure
    const envConfig: any = {};
    
    // Database configuration
    if (env.SQLITE_DB_PATH) {
      envConfig.database = { 
        sqlite: { path: env.SQLITE_DB_PATH } 
      };
    }
    
    if (env.REDIS_URL) {
      if (!envConfig.database) envConfig.database = {};
      envConfig.database.redis = { 
        enabled: true, 
        url: env.REDIS_URL 
      };
    }
    
    // Vector database configuration
    if (env.QDRANT_URL) {
      envConfig.vector = {
        qdrant: { url: env.QDRANT_URL }
      };
    }
    
    if (env.QDRANT_API_KEY) {
      if (!envConfig.vector) envConfig.vector = { qdrant: {} };
      envConfig.vector.qdrant.apiKey = env.QDRANT_API_KEY;
    }
    
    // Embedding configuration
    if (env.EMBEDDING_PROVIDER) {
      if (!envConfig.vector) envConfig.vector = {};
      if (!envConfig.vector.embeddings) envConfig.vector.embeddings = {};
      envConfig.vector.embeddings.provider = env.EMBEDDING_PROVIDER;
    }
    
    if (env.OPENAI_API_KEY) {
      if (!envConfig.vector) envConfig.vector = {};
      if (!envConfig.vector.embeddings) envConfig.vector.embeddings = {};
      envConfig.vector.embeddings.openai = { apiKey: env.OPENAI_API_KEY };
    }
    
    // Processing configuration
    if (env.MIN_TEXT_LENGTH) {
      envConfig.processing = {
        assembly: { minTextLength: parseInt(env.MIN_TEXT_LENGTH) }
      };
    }
    
    if (env.HIGH_CONFIDENCE_THRESHOLD) {
      if (!envConfig.processing) envConfig.processing = {};
      if (!envConfig.processing.routing) envConfig.processing.routing = {};
      envConfig.processing.routing.highConfidenceThreshold = 
        parseFloat(env.HIGH_CONFIDENCE_THRESHOLD);
    }
    
    if (env.LOW_CONFIDENCE_THRESHOLD) {
      if (!envConfig.processing) envConfig.processing = {};
      if (!envConfig.processing.routing) envConfig.processing.routing = {};
      envConfig.processing.routing.lowConfidenceThreshold = 
        parseFloat(env.LOW_CONFIDENCE_THRESHOLD);
    }
    
    // LLM configuration
    if (env.ENABLE_LLM === 'true') {
      envConfig.llm = { enabled: true };
    }
    
    if (env.LLM_PROVIDER) {
      if (!envConfig.llm) envConfig.llm = {};
      envConfig.llm.provider = env.LLM_PROVIDER;
    }
    
    if (env.OPENAI_LLM_API_KEY) {
      if (!envConfig.llm) envConfig.llm = {};
      envConfig.llm.openai = { apiKey: env.OPENAI_LLM_API_KEY };
    }
    
    // Feature flags
    const featureFlags: any = {};
    
    if (env.LOCAL_ONLY_MODE === 'true') {
      featureFlags.localOnlyMode = true;
    }
    
    if (env.ENABLE_DEDUPLICATION === 'false') {
      featureFlags.enableDeduplication = false;
    }
    
    if (env.ENABLE_BACKGROUND_JOBS === 'false') {
      featureFlags.enableBackgroundJobs = false;
    }
    
    if (Object.keys(featureFlags).length > 0) {
      envConfig.features = featureFlags;
    }
    
    // Storage configuration
    if (env.KNOWLEDGE_BASE_PATH) {
      envConfig.storage = {
        knowledgeBasePath: env.KNOWLEDGE_BASE_PATH
      };
    }
    
    // Logging configuration
    if (env.LOG_LEVEL) {
      envConfig.observability = {
        logging: { level: env.LOG_LEVEL }
      };
    }
    
    if (env.LOG_FILE) {
      if (!envConfig.observability) envConfig.observability = {};
      if (!envConfig.observability.logging) envConfig.observability.logging = {};
      envConfig.observability.logging.filePath = env.LOG_FILE;
    }
    
    return envConfig;
  }
  
  /**
   * Watch configuration file for changes (development only)
   */
  private watchConfigFile(filePath: string): void {
    if (this.fileWatcher) {
      return; // Already watching
    }
    
    const fullPath = resolve(filePath);
    
    this.fileWatcher = () => {
      try {
        const newConfig = this.loadConfigFile(filePath);
        const mergedConfig = { ...this.config, ...newConfig };
        const validatedConfig = ConfigSchema.parse(mergedConfig);
        
        this.config = validatedConfig;
        this.notifyWatchers();
        
        console.log('Configuration reloaded from file:', filePath);
        
      } catch (error) {
        console.error('Failed to reload configuration:', error);
      }
    };
    
    watchFile(fullPath, { interval: 1000 }, this.fileWatcher);
  }
  
  /**
   * Notify configuration change watchers
   */
  private notifyWatchers(): void {
    this.watchers.forEach(watcher => {
      try {
        watcher();
      } catch (error) {
        console.error('Configuration watcher error:', error);
      }
    });
  }
  
  // =============================================================================
  // PUBLIC API
  // =============================================================================
  
  /**
   * Get complete configuration
   */
  get(): Config {
    return { ...this.config }; // Return copy to prevent mutation
  }
  
  /**
   * Get specific configuration section
   */
  getSection<K extends keyof Config>(section: K): Config[K] {
    const value = this.config[section];
    // Only spread if it's an object, otherwise return as-is
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...value } as Config[K];
    }
    return value;
  }
  
  /**
   * Get configuration value by path
   */
  getValue<T>(path: string, defaultValue?: T): T | undefined {
    const keys = path.split('.');
    let current: any = this.config;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }
    
    return current;
  }
  
  /**
   * Check if a feature flag is enabled
   */
  isFeatureEnabled(feature: keyof Config['features']): boolean {
    return this.config.features[feature] === true;
  }
  
  /**
   * Get environment
   */
  getEnvironment(): Environment {
    return this.config.environment;
  }
  
  /**
   * Check if running in development mode
   */
  isDevelopment(): boolean {
    return this.config.environment === 'development';
  }
  
  /**
   * Check if running in test mode
   */
  isTest(): boolean {
    return this.config.environment === 'test';
  }
  
  /**
   * Check if running in production mode
   */
  isProduction(): boolean {
    return this.config.environment === 'production';
  }
  
  /**
   * Validate current configuration
   */
  validate(): { valid: boolean; errors?: string[] } {
    try {
      ConfigSchema.parse(this.config);
      return { valid: true };
    } catch (error: any) {
      const errors = error.errors?.map((e: any) => 
        `${e.path.join('.')}: ${e.message}`
      ) || [error.message];
      
      return { valid: false, errors };
    }
  }
  
  /**
   * Reload configuration from sources
   */
  reload(options: ConfigLoadOptions = {}): void {
    this.config = this.loadConfiguration(options);
    this.notifyWatchers();
  }
  
  /**
   * Watch for configuration changes
   */
  onChange(callback: () => void): () => void {
    this.watchers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.watchers.delete(callback);
    };
  }
  
  /**
   * Create a test configuration service
   */
  static createForTest(overrides: Partial<Config> = {}): ConfigService {
    return new ConfigService({
      environment: 'test',
      overrides,
    });
  }
  
  /**
   * Validate configuration without loading
   */
  static validateConfig(config: unknown): { valid: boolean; errors?: string[] } {
    try {
      ConfigSchema.parse(config);
      return { valid: true };
    } catch (error: any) {
      const errors = error.errors?.map((e: any) => 
        `${e.path.join('.')}: ${e.message}`
      ) || [error.message];
      
      return { valid: false, errors };
    }
  }
  
  /**
   * Get configuration schema for documentation/validation
   */
  static getSchema() {
    return ConfigSchema;
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.fileWatcher) {
      // TODO: Implement proper file watcher cleanup
      this.fileWatcher = undefined;
    }
    
    this.watchers.clear();
  }
}

/**
 * Global configuration service instance
 * Can be replaced for testing
 */
export let globalConfig: ConfigService;

/**
 * Initialize global configuration
 */
export function initializeConfig(options: ConfigLoadOptions = {}): ConfigService {
  globalConfig = new ConfigService(options);
  return globalConfig;
}

/**
 * Get global configuration (must be initialized first)
 */
export function getConfig(): Config {
  if (!globalConfig) {
    throw new ConfigurationError(
      'global-config',
      'not-initialized',
      'Global configuration not initialized. Call initializeConfig() first.'
    );
  }
  
  return globalConfig.get();
}

/**
 * Get specific configuration section
 */
export function getConfigSection<K extends keyof Config>(section: K): Config[K] {
  return getConfig()[section];
}