# Google Gemini Integration Guide

## Overview

This document provides comprehensive information about integrating Google Gemini AI models with the Active Recall system for educational content distillation and multi-concept extraction.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Model Selection](#model-selection)
- [Architecture](#architecture)
- [API Usage](#api-usage)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Quick Start

### 1. Get API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key for your project
3. Copy the API key for configuration

### 2. Basic Configuration

Add these essential environment variables to your `.env` file:

```bash
# Provider Selection
LLM_PROVIDER=gemini

# API Configuration  
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=flash-lite

# Basic Settings
GEMINI_MAX_TOKENS=200
GEMINI_TEMPERATURE=0.1
BATCH_FLUSH_THRESHOLD=40000
```

### 3. Verify Installation

Run the integration test to verify everything works:

```bash
npm test -- --run src/core/services/impl/GeminiDistillationService.integration.test.ts
```

## Configuration

### Environment Variables

#### Core Configuration
```bash
# Required
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=flash-lite                    # See Model Selection section

# Optional - Google Cloud (for Vertex AI)
GEMINI_PROJECT_ID=your-gcp-project-id
GEMINI_LOCATION=us-central1
```

#### Model Parameters
```bash
GEMINI_MAX_TOKENS=200                      # Output tokens (1-8192)
GEMINI_TEMPERATURE=0.1                     # Creativity (0.0-2.0)
GEMINI_TOP_K=40                           # Token sampling (1-100)
GEMINI_TOP_P=0.95                         # Nucleus sampling (0.0-1.0)
```

#### Performance & Reliability
```bash
GEMINI_REQUEST_TIMEOUT=30000              # Request timeout (ms)
GEMINI_RETRY_ATTEMPTS=3                   # Number of retries
GEMINI_RETRY_DELAY=1000                   # Delay between retries (ms)
```

#### Multi-Concept Extraction
```bash
GEMINI_MULTI_CONCEPT_ENABLED=true         # Enable multi-concept extraction
GEMINI_MAX_CONCEPTS_PER_DISTILLATION=5    # Max concepts per request (1-10)
GEMINI_SPECIFICITY_ENFORCEMENT=true       # Enforce concept specificity
```

#### Rate Limiting & Safety
```bash
GEMINI_DAILY_REQUEST_LIMIT=10000          # Daily API call limit
GEMINI_BURST_LIMIT=10                     # Concurrent request limit
GEMINI_HARM_BLOCK_THRESHOLD=BLOCK_MEDIUM  # Content safety level
```

#### Advanced Features
```bash
GEMINI_CHAIN_OF_THOUGHT_ENABLED=true      # Step-by-step reasoning
GEMINI_FEW_SHOT_EXAMPLES_ENABLED=true     # Include examples in prompts
GEMINI_OCR_AWARENESS_ENABLED=true         # Handle OCR artifacts
```

### Model-Specific Thresholds

Set optimal batch sizes for different models:

```bash
# Cost-optimized (recommended for high volume)
GEMINI_FLASH_LITE_THRESHOLD=40000

# Balanced performance
GEMINI_FLASH_THRESHOLD=60000  

# Maximum capability
GEMINI_PRO_EXPERIMENTAL_THRESHOLD=100000
```

## Model Selection

### Available Models

| Model | Cost (per 1M tokens) | Context Window | Best For |
|-------|---------------------|----------------|----------|
| **flash-lite** | $0.10/$0.40 | 1M | High-volume processing |
| **flash** | $0.30/$1.20 | 1M | Balanced performance |
| **pro-experimental** | $7.00/$21.00 | 2M | Complex reasoning |
| **flash-thinking** | $0.50/$2.00 | 1M | Step-by-step analysis |

### Choosing the Right Model

**For Educational Content Extraction:**
- **High Volume (>1000 requests/day)**: Use `flash-lite` 
- **Balanced Usage**: Use `flash`
- **Complex Academic Content**: Use `pro-experimental`
- **Need Reasoning Steps**: Use `flash-thinking`

**Configuration Example:**
```bash
# For cost-sensitive applications
GEMINI_MODEL=flash-lite
GEMINI_FLASH_LITE_THRESHOLD=40000

# For maximum accuracy
GEMINI_MODEL=pro-experimental
GEMINI_PRO_EXPERIMENTAL_THRESHOLD=100000
```

## Architecture

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   BatcherService │────│ LLM Provider     │────│ GeminiService   │
│   (Text Batching)│    │ Selection        │    │ (API Calls)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                       │                       │
          └─── Provider-aware ────┘                       │
               Thresholds                                  │
                                                          │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Configuration  │────│   Type Safety    │────│   Validation    │
│   Management    │    │   & Validation   │    │   & Error       │
│                 │    │                  │    │   Handling      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Classes

- **`GeminiDistillationService`**: Main service implementing `IDistillationService`
- **`GeminiConfig`**: Type-safe configuration management
- **`BatcherService`**: Provider-aware text batching with optimal thresholds
- **`LLM_PROVIDERS_CONFIG`**: Centralized model specifications

### Design Principles

✅ **SOLID Principles Applied:**
- **Single Responsibility**: Each class has one clear purpose
- **Open/Closed**: Extensible for new models without modification
- **Liskov Substitution**: Interchangeable with other providers
- **Interface Segregation**: Focused, minimal interfaces
- **Dependency Inversion**: Depends on abstractions

✅ **TypeScript 2025 Best Practices:**
- Strict typing with no `any` types
- Readonly properties for immutable config
- Explicit type unions with validation
- Fail-fast error handling
- Template literal types for type safety

## API Usage

### Basic Single Concept Extraction

```typescript
import { GeminiDistillationService } from './core/services/impl/GeminiDistillationService';
import { loadGeminiConfig } from './core/config/GeminiConfig';
import { ConceptCandidate } from './core/domain/ConceptCandidate';

// Initialize service
const config = loadGeminiConfig();
const cache = new MemoryContentCache();
const service = new GeminiDistillationService(config, cache);

// Create candidate
const batch = { /* batch data */ };
const candidate = new ConceptCandidate(batch, 'Neural networks process information through interconnected nodes', 0);

// Extract concept
try {
  const result = await service.distill(candidate);
  console.log('Extracted concept:', result.title);
  console.log('Summary:', result.summary);
} catch (error) {
  console.error('Extraction failed:', error.message);
}
```

### Multi-Concept Extraction

```typescript
// Extract multiple concepts
try {
  const result = await service.distillMultiple(candidate);
  console.log(`Found ${result.totalConcepts} concepts:`);
  
  result.concepts.forEach((concept, index) => {
    console.log(`${index + 1}. ${concept.title}`);
    console.log(`   ${concept.summary}`);
    console.log(`   Relevance: ${concept.relevanceScore}`);
  });
} catch (error) {
  console.error('Multi-concept extraction failed:', error.message);
}
```

### Provider Information

```typescript
console.log('Provider:', service.getProvider()); // "gemini-flash-lite"
console.log('Request count:', service.getRequestCount());
service.resetDailyCounter(); // Reset for new day
```

## Cost Optimization

### 1. Choose the Right Model

```bash
# Cost comparison for 100K characters/day:

# Flash-Lite (recommended)
# ~25 tokens/request × 1000 requests = 25K tokens
# Cost: $2.50/month input + $10/month output = $12.50/month

# Flash 
# Cost: $7.50/month input + $30/month output = $37.50/month

# Pro Experimental
# Cost: $175/month input + $525/month output = $700/month
```

### 2. Optimize Batch Sizes

```bash
# Larger batches = fewer API calls = lower costs
GEMINI_FLASH_LITE_THRESHOLD=40000    # ~10K tokens per batch
BATCH_FLUSH_THRESHOLD=40000          # Override for cost optimization
```

### 3. Enable Caching

```bash
CACHE_ENABLED=true                   # Avoid repeat API calls
CACHE_TTL_DAYS=30                   # Cache results for 30 days
```

### 4. Monitor Usage

```bash
GEMINI_DAILY_REQUEST_LIMIT=1000     # Set conservative limits
GEMINI_QUOTA_WARNING_THRESHOLD=0.8  # Warn at 80% usage
GEMINI_METRICS_ENABLED=true         # Track usage patterns
```

### 5. Rate Limiting

```bash
GEMINI_BURST_LIMIT=5                # Limit concurrent requests
GEMINI_REQUEST_TIMEOUT=15000        # Shorter timeouts
```

## Troubleshooting

### Common Issues

#### 1. **API Key Invalid**
```
Error: Gemini API key is required
```
**Solution:** Verify your API key in Google AI Studio and update `.env`

#### 2. **Rate Limit Exceeded**
```
Error: Gemini API quota exceeded
```
**Solutions:**
- Increase `GEMINI_DAILY_REQUEST_LIMIT`
- Reduce `GEMINI_BURST_LIMIT`
- Enable caching to reduce API calls
- Switch to a lower-cost model

#### 3. **Request Timeout**
```
Error: Gemini API request timed out
```
**Solutions:**
- Increase `GEMINI_REQUEST_TIMEOUT`
- Reduce batch size with lower threshold
- Check network connectivity

#### 4. **Content Filtered**
```
Error: Content blocked by safety filters
```
**Solutions:**
- Adjust `GEMINI_HARM_BLOCK_THRESHOLD` to `BLOCK_LOW` or `BLOCK_NONE`
- Review content for educational vs. harmful patterns
- Enable `GEMINI_EDUCATIONAL_CONTENT_FILTER=false` for testing

#### 5. **Empty or Invalid Response**
```
Error: Failed to parse Gemini response
```
**Solutions:**
- Check input text quality (OCR artifacts)
- Enable `GEMINI_OCR_AWARENESS_ENABLED=true`
- Verify content is educational
- Try different temperature settings

### Debug Mode

Enable detailed logging:

```bash
GEMINI_DEBUG_MODE=true
GEMINI_LOG_LEVEL=debug
LOG_LEVEL=debug
```

### Health Check

Test service functionality:

```bash
# Run integration tests
npm test -- --run src/core/services/impl/GeminiDistillationService.integration.test.ts

# Check build
npm run build

# Verify configuration
node -e "console.log(require('./dist/core/config/GeminiConfig.js').loadGeminiConfig())"
```

## Best Practices

### 1. **Configuration Management**

✅ **Do:**
- Use environment variables for all configuration
- Set appropriate rate limits for your use case
- Enable caching to reduce costs
- Use model-specific thresholds

❌ **Don't:**
- Hard-code API keys in source code
- Use default rate limits in production
- Disable safety filters without consideration

### 2. **Error Handling**

✅ **Do:**
```typescript
try {
  const result = await service.distill(candidate);
  // Process result
} catch (error) {
  if (error instanceof DistillationQuotaError) {
    // Handle quota exceeded
    await waitForQuotaReset();
    return retry();
  } else if (error instanceof DistillationValidationError) {
    // Handle invalid input
    logger.warn('Invalid input:', error.message);
    return null;
  }
  // Handle other errors
  logger.error('Distillation failed:', error);
  throw error;
}
```

### 3. **Performance Optimization**

✅ **Optimal Batch Sizes:**
- Flash-Lite: 40,000 characters (~10K tokens)
- Flash: 60,000 characters (~15K tokens)  
- Pro: 100,000 characters (~25K tokens)

✅ **Caching Strategy:**
- Enable for repeated content
- Use appropriate TTL (30 days recommended)
- Monitor cache hit rates

### 4. **Monitoring & Observability**

✅ **Track Key Metrics:**
- Daily API usage vs. limits
- Cache hit/miss ratios
- Error rates by type
- Average response times
- Cost per concept extracted

✅ **Set Up Alerts:**
- Quota usage > 80%
- Error rate > 5%
- Response time > 30s
- Daily cost exceeds budget

### 5. **Security**

✅ **API Key Security:**
- Store in environment variables only
- Rotate keys regularly
- Use separate keys for dev/staging/prod
- Monitor for unauthorized usage

✅ **Content Safety:**
- Use appropriate harm block thresholds
- Validate input content
- Log safety filter triggers
- Monitor for policy violations

### 6. **Testing Strategy**

✅ **Test Coverage:**
- Unit tests for configuration parsing
- Integration tests with mocked API
- End-to-end tests with real API (sparingly)
- Performance tests with realistic data

✅ **Test Data:**
- Use representative educational content
- Include edge cases (OCR errors, special characters)
- Test with different content lengths
- Validate multi-concept scenarios

## Migration from OpenAI

If migrating from OpenAI to Gemini:

### 1. **Update Configuration**

```bash
# Change provider
LLM_PROVIDER=gemini

# Replace API key
GEMINI_API_KEY=your-gemini-key
# Remove: OPENAI_API_KEY

# Update model
GEMINI_MODEL=flash-lite
# Remove: OPENAI_MODEL

# Adjust thresholds
GEMINI_FLASH_LITE_THRESHOLD=40000
# Remove: OPENAI_GPT_35_TURBO_THRESHOLD
```

### 2. **Service Instantiation**

```typescript
// Old
const openAiService = new OpenAIDistillationService(openAiConfig, cache);

// New  
const geminiService = new GeminiDistillationService(geminiConfig, cache);
```

### 3. **Cost Comparison**

| Aspect | OpenAI GPT-3.5 | Gemini Flash-Lite |
|--------|-----------------|-------------------|
| Input cost | $0.50/1M tokens | $0.10/1M tokens |
| Output cost | $1.50/1M tokens | $0.40/1M tokens |
| Context window | 16K tokens | 1M tokens |
| **Total savings** | **Baseline** | **~75% cheaper** |

---

## Support

For additional help:

1. Check the [troubleshooting section](#troubleshooting)
2. Review [integration tests](../src/core/services/impl/GeminiDistillationService.integration.test.ts)
3. Consult [Google AI documentation](https://ai.google.dev/docs)
4. Open an issue in the project repository

## Changelog

- **v1.0.0** - Initial Gemini integration with multi-concept support
- **v1.1.0** - Added provider-aware batching and cost optimization
- **v1.2.0** - Enhanced type safety and validation