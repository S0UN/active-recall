/**
 * Centralized configuration for all LLM providers and their models.
 * This provides a single source of truth for model capabilities, limits, and pricing.
 */

export interface ModelConfig {
  name: string;
  flushThreshold: number;  // Characters before auto-flush in BatcherService
  maxTokens: number;       // Maximum output tokens
  contextWindow: number;   // Total context window in tokens
  pricing?: {
    input: number;   // Cost per 1M input tokens
    output: number;  // Cost per 1M output tokens
  };
  description?: string;
}

export interface ProviderConfig {
  models: Record<string, ModelConfig>;
  defaultModel?: string;
}

export const LLM_PROVIDERS_CONFIG: Record<string, ProviderConfig> = {
  OPENAI: {
    defaultModel: 'GPT_35_TURBO',
    models: {
      GPT_35_TURBO: {
        name: 'gpt-3.5-turbo',
        flushThreshold: 10000,
        maxTokens: 4096,
        contextWindow: 16385,
        pricing: {
          input: 0.50,
          output: 1.50
        },
        description: 'Fast, cost-effective model for simple tasks'
      },
      GPT_4: {
        name: 'gpt-4',
        flushThreshold: 80000,
        maxTokens: 8192,
        contextWindow: 128000,
        pricing: {
          input: 30.00,
          output: 60.00
        },
        description: 'Advanced reasoning and complex task handling'
      },
      GPT_4O: {
        name: 'gpt-4o',
        flushThreshold: 80000,
        maxTokens: 4096,
        contextWindow: 128000,
        pricing: {
          input: 5.00,
          output: 15.00
        },
        description: 'Optimized GPT-4 with better performance'
      },
      GPT_4O_MINI: {
        name: 'gpt-4o-mini',
        flushThreshold: 40000,
        maxTokens: 16384,
        contextWindow: 128000,
        pricing: {
          input: 0.15,
          output: 0.60
        },
        description: 'Cost-effective model with GPT-4 capabilities'
      }
    }
  },
  GEMINI: {
    defaultModel: 'FLASH_LITE',
    models: {
      FLASH_LITE: {
        name: 'gemini-2.5-flash-lite',
        flushThreshold: 40000,
        maxTokens: 8192,
        contextWindow: 1000000,
        pricing: {
          input: 0.10,
          output: 0.40
        },
        description: 'Most cost-efficient model for high-volume processing'
      },
      FLASH: {
        name: 'gemini-2.0-flash',
        flushThreshold: 60000,
        maxTokens: 8192,
        contextWindow: 1000000,
        pricing: {
          input: 0.30,
          output: 1.20
        },
        description: 'Balanced performance and cost, ideal for multi-concept extraction'
      },
      PRO_EXPERIMENTAL: {
        name: 'gemini-2.0-pro-experimental',
        flushThreshold: 100000,
        maxTokens: 8192,
        contextWindow: 2000000,
        pricing: {
          input: 7.00,
          output: 21.00
        },
        description: 'Maximum context window for complex, long-form content'
      },
      FLASH_THINKING: {
        name: 'gemini-2.5-flash',
        flushThreshold: 80000,
        maxTokens: 8192,
        contextWindow: 1000000,
        pricing: {
          input: 0.50,
          output: 2.00
        },
        description: 'Flash model with thinking capabilities for complex reasoning'
      }
    }
  },
  ANTHROPIC: {
    defaultModel: 'SONNET_35',
    models: {
      HAIKU_3: {
        name: 'claude-3-haiku-20240307',
        flushThreshold: 40000,
        maxTokens: 4096,
        contextWindow: 200000,
        pricing: {
          input: 0.25,
          output: 1.25
        },
        description: 'Fast and cost-effective for simple tasks'
      },
      SONNET_35: {
        name: 'claude-3-5-sonnet-20241022',
        flushThreshold: 60000,
        maxTokens: 8192,
        contextWindow: 200000,
        pricing: {
          input: 3.00,
          output: 15.00
        },
        description: 'Balanced performance for most use cases'
      },
      OPUS_3: {
        name: 'claude-3-opus-20240229',
        flushThreshold: 80000,
        maxTokens: 4096,
        contextWindow: 200000,
        pricing: {
          input: 15.00,
          output: 75.00
        },
        description: 'Most capable model for complex reasoning'
      }
    }
  }
};

/**
 * Helper function to get model configuration by provider and model key
 */
export function getModelConfig(provider: string, modelKey: string): ModelConfig | undefined {
  return LLM_PROVIDERS_CONFIG[provider]?.models[modelKey];
}

/**
 * Helper function to get the default model for a provider
 */
export function getDefaultModel(provider: string): ModelConfig | undefined {
  const providerConfig = LLM_PROVIDERS_CONFIG[provider];
  if (!providerConfig || !providerConfig.defaultModel) {
    return undefined;
  }
  return providerConfig.models[providerConfig.defaultModel];
}

/**
 * Helper function to get flush threshold for a specific model
 */
export function getFlushThreshold(provider: string, modelKey: string): number {
  const modelConfig = getModelConfig(provider, modelKey);
  return modelConfig?.flushThreshold || 60000; // Default to 60k characters
}

/**
 * Estimate tokens from character count (rough approximation)
 * Generally, 1 token ≈ 4 characters in English text
 */
export function estimateTokensFromCharacters(characters: number): number {
  return Math.ceil(characters / 4);
}

/**
 * Check if content fits within model's context window
 */
export function fitsInContext(
  provider: string, 
  modelKey: string, 
  characters: number,
  outputTokens: number = 0
): boolean {
  const modelConfig = getModelConfig(provider, modelKey);
  if (!modelConfig) return false;
  
  const estimatedInputTokens = estimateTokensFromCharacters(characters);
  const totalTokens = estimatedInputTokens + outputTokens;
  
  return totalTokens <= modelConfig.contextWindow;
}