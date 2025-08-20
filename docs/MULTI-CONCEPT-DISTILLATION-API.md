# Multi-Concept Distillation API Documentation

## Overview

The Multi-Concept Distillation API provides production-grade educational content extraction capabilities. It can extract either a single specific concept or multiple individual concepts from educational text, with each concept being specific enough to generate targeted practice questions.

## Key Features

- **Single & Multi-Concept Extraction**: Extract one primary concept or multiple individual concepts
- **Extreme Specificity Enforcement**: Ensures concepts are specific enough for individual flashcards
- **Advanced Chain-of-Thought Prompting**: Uses few-shot examples and structured reasoning
- **OCR-Aware Processing**: Handles messy text from scanned documents and images
- **Production-Grade Error Handling**: Comprehensive error classification and fallback mechanisms
- **Intelligent Caching**: Reduces API costs and improves performance
- **Content Validation**: Filters out non-educational content automatically

## Core Interface

### IDistillationService

```typescript
interface IDistillationService {
  distill(candidate: ConceptCandidate): Promise<DistilledContent>;
  distillMultiple?(candidate: ConceptCandidate): Promise<MultiConceptDistillation>;
  getProvider(): string;
  getRequestCount?(): number;
  resetDailyCounter?(): void;
}
```

## Data Schemas

### ExtractedConcept

Represents a single, specific educational concept:

```typescript
interface ExtractedConcept {
  title: string;              // 1-100 chars, specific concept name
  summary: string;            // 50-500 chars, educational explanation
  relevanceScore?: number;    // 0-1, educational importance
  startOffset?: number;       // Character position in source text
  endOffset?: number;         // Character position in source text
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  category?: string;          // Subject area classification
}
```

**Title Requirements:**
- Must be specific enough for individual flashcard
- Cannot use broad terms like "Algorithms", "Programming", "Data Structures"
- Examples of good titles:
  - "QuickSort Pivot Selection Strategy"
  - "Stack LIFO Push Operation"
  - "Mitosis Prophase Chromosome Condensation"

### MultiConceptDistillation

Contains multiple extracted concepts with metadata:

```typescript
interface MultiConceptDistillation {
  concepts: ExtractedConcept[];        // 1-5 concepts max
  sourceContentHash: string;           // Hexadecimal hash of source
  totalConcepts: number;               // Must match concepts.length
  processingTime?: number;             // Processing time in ms
  cached: boolean;                     // Whether result was cached
  distilledAt: Date;                   // Extraction timestamp
  modelInfo?: {
    model: string;                     // AI model used
    promptVersion: string;             // Prompt version identifier
    tokensUsed?: number;               // Token consumption
  };
  metadata?: {
    ocrText: boolean;                  // Whether text came from OCR
    sourceType?: 'pdf' | 'image' | 'text' | 'web';
    confidence?: number;               // Overall confidence score
  };
}
```

## API Methods

### Single Concept Extraction

```typescript
async distill(candidate: ConceptCandidate): Promise<DistilledContent>
```

Extracts the most specific primary concept from educational content.

**Parameters:**
- `candidate`: ConceptCandidate - The text content to process

**Returns:**
- `DistilledContent` - Single concept with title and summary

**Throws:**
- `DistillationError` - General processing failures
- `DistillationTimeoutError` - Request timeout
- `DistillationQuotaError` - API quota exceeded
- `DistillationValidationError` - Input validation failed
- `DistillationContentError` - Non-educational content
- `DistillationProviderError` - Provider-specific errors

**Example:**
```typescript
const service = new OpenAIDistillationService(config, cache);
const candidate = new ConceptCandidate(batch, text, 0);

try {
  const result = await service.distill(candidate.normalize());
  console.log('Title:', result.title);
  console.log('Summary:', result.summary);
} catch (error) {
  if (error instanceof DistillationContentError) {
    console.log('Content is not educational');
  }
}
```

### Multi-Concept Extraction

```typescript
async distillMultiple(candidate: ConceptCandidate): Promise<MultiConceptDistillation>
```

Extracts multiple specific concepts from educational content.

**Parameters:**
- `candidate`: ConceptCandidate - The text content to process

**Returns:**
- `MultiConceptDistillation` - Multiple concepts with metadata

**Throws:**
- Same error types as `distill()` method

**Example:**
```typescript
const service = new OpenAIDistillationService(config, cache);
const candidate = new ConceptCandidate(batch, text, 0);

try {
  const result = await service.distillMultiple(candidate.normalize());
  console.log(`Found ${result.totalConcepts} concepts:`);
  
  result.concepts.forEach((concept, i) => {
    console.log(`${i + 1}. ${concept.title}`);
    console.log(`   ${concept.summary.substring(0, 80)}...`);
    console.log(`   Relevance: ${concept.relevanceScore}`);
  });
} catch (error) {
  console.error('Extraction failed:', error.message);
}
```

## Configuration

### DistillationConfig

Comprehensive configuration interface:

```typescript
interface DistillationConfig {
  // Core settings
  provider: 'openai' | 'local' | 'anthropic' | 'google';
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  
  // Performance
  cacheEnabled?: boolean;
  requestTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  
  // Multi-concept features
  multiConceptEnabled?: boolean;
  maxConceptsPerDistillation?: number;
  specificityEnforcement?: boolean;
  
  // Rate limiting
  dailyRequestLimit?: number;
  burstLimit?: number;
  quotaWarningThreshold?: number;
  
  // Advanced prompting
  promptVersion?: string;
  chainOfThoughtEnabled?: boolean;
  fewShotExamplesEnabled?: boolean;
  ocrAwarenessEnabled?: boolean;
  
  // Content filtering
  educationalContentFilter?: boolean;
  commercialContentFilter?: boolean;
  minContentLength?: number;
  maxContentLength?: number;
  
  // Fallback behavior
  fallbackEnabled?: boolean;
  fallbackStrategy?: 'simple' | 'rule-based' | 'local-model';
  
  // Monitoring
  debugMode?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  metricsEnabled?: boolean;
}
```

### Environment Variables

The OpenAI implementation supports these environment variables:

```bash
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Core model settings
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=200
OPENAI_TEMPERATURE=0.1

# Performance settings
CACHE_ENABLED=true
REQUEST_TIMEOUT=30000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000

# Multi-concept settings
MULTI_CONCEPT_ENABLED=true
MAX_CONCEPTS_PER_DISTILLATION=5
SPECIFICITY_ENFORCEMENT=true

# Rate limiting
DAILY_REQUEST_LIMIT=1000
BURST_LIMIT=10
QUOTA_WARNING_THRESHOLD=0.8

# Advanced prompting
PROMPT_VERSION=v2.0-specificity
CHAIN_OF_THOUGHT_ENABLED=true
FEW_SHOT_EXAMPLES_ENABLED=true
OCR_AWARENESS_ENABLED=true

# Content filtering
EDUCATIONAL_CONTENT_FILTER=true
COMMERCIAL_CONTENT_FILTER=true
MIN_CONTENT_LENGTH=10
MAX_CONTENT_LENGTH=50000

# Fallback behavior
FALLBACK_ENABLED=true
FALLBACK_STRATEGY=simple

# Monitoring
DEBUG_MODE=false
LOG_LEVEL=info
METRICS_ENABLED=true
```

## Error Handling

### Error Hierarchy

```
DistillationError (base)
├── DistillationTimeoutError
├── DistillationQuotaError
├── DistillationValidationError
├── DistillationContentError
└── DistillationProviderError
```

### Error Context

All errors include detailed context for debugging:

```typescript
try {
  const result = await service.distill(candidate);
} catch (error) {
  if (error instanceof DistillationError) {
    console.log('Error context:', error.context);
    console.log('Original cause:', error.cause);
  }
}
```

### Error Recovery

The service includes automatic fallback mechanisms:

1. **Caching**: Avoids re-processing identical content
2. **Retry Logic**: Automatic retry with exponential backoff
3. **Fallback Extraction**: Rule-based extraction when LLM fails
4. **Graceful Degradation**: Continues processing when possible

## Performance Considerations

### Caching Strategy

- Content is cached by `contentHash` to avoid duplicate processing
- Cache TTL is 30 days for distilled content
- Multi-concept results are cached separately from single-concept

### Rate Limiting

- Daily request limits prevent quota exhaustion
- Burst limits prevent rapid-fire requests
- Warning thresholds allow proactive monitoring

### Token Optimization

- Prompts are optimized for minimal token usage
- Multi-concept extraction uses proportional token allocation
- Caching reduces redundant API calls significantly

## Best Practices

### Input Preparation

1. **Normalize text** before processing:
   ```typescript
   const candidate = new ConceptCandidate(batch, text, 0);
   const normalized = candidate.normalize();
   ```

2. **Validate content length**:
   - Minimum 10 characters for meaningful extraction
   - Maximum 50,000 characters to avoid token limits

3. **Filter non-educational content** early:
   - Remove navigation elements
   - Filter out commercial content
   - Focus on substantive educational text

### Error Handling

1. **Use specific error types**:
   ```typescript
   catch (error) {
     if (error instanceof DistillationContentError) {
       // Handle non-educational content
     } else if (error instanceof DistillationQuotaError) {
       // Handle quota issues
     }
   }
   ```

2. **Implement retry logic** for transient failures
3. **Log errors with context** for debugging

### Performance Optimization

1. **Enable caching** for repeated content
2. **Batch process** multiple candidates when possible
3. **Monitor usage** to stay within quotas
4. **Use fallback strategies** for reliability

## Testing

### Unit Testing

```typescript
describe('Multi-concept extraction', () => {
  it('should extract specific concepts from computer science content', async () => {
    const text = `
      Object-Oriented Programming principles include encapsulation, 
      inheritance, and polymorphism. Encapsulation bundles data 
      and methods within a class...
    `;
    
    const result = await service.distillMultiple(candidate);
    
    expect(result.concepts.length).toBeGreaterThan(1);
    expect(result.concepts[0].title).toContain('Encapsulation');
    expect(result.concepts[0].title).not.toBe('Object-Oriented Programming');
  });
});
```

### Integration Testing

```typescript
describe('Real API integration', () => {
  it('should handle actual OpenAI API calls', async () => {
    const config = loadOpenAIConfig();
    const service = new OpenAIDistillationService(config, cache);
    
    const result = await service.distillMultiple(candidate);
    
    expect(result.concepts).toBeDefined();
    expect(service.getRequestCount()).toBeGreaterThan(0);
  });
});
```

## Migration Guide

### From Single to Multi-Concept

If you're upgrading from single-concept extraction:

1. **Update your imports**:
   ```typescript
   import { MultiConceptDistillation } from '../contracts/schemas';
   ```

2. **Modify your service calls**:
   ```typescript
   // Old
   const result = await service.distill(candidate);
   
   // New
   const multiResult = await service.distillMultiple(candidate);
   const primaryConcept = multiResult.concepts[0];
   ```

3. **Update error handling** to include new error types

4. **Adjust caching logic** for multi-concept results

### Configuration Updates

Update your `.env` file to include new options:

```bash
# Add these new variables
MULTI_CONCEPT_ENABLED=true
SPECIFICITY_ENFORCEMENT=true
CHAIN_OF_THOUGHT_ENABLED=true
```

## Troubleshooting

### Common Issues

1. **"Title is too broad" validation errors**:
   - Check that titles are specific enough for individual flashcards
   - Avoid generic terms like "Programming" or "Algorithms"

2. **API quota exceeded**:
   - Check daily usage limits
   - Enable caching to reduce API calls
   - Implement usage monitoring

3. **Non-educational content filtered**:
   - Ensure input text contains actual educational material
   - Remove navigation and UI elements
   - Focus on substantive content

### Debug Mode

Enable debug mode for detailed logging:

```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

This provides detailed information about:
- Prompt generation
- API requests and responses
- Caching behavior
- Error contexts

## Support

For additional help:

1. Check the error context and logs
2. Verify configuration settings
3. Test with known educational content
4. Review the comprehensive test suite for examples
5. Consult the architectural documentation for deeper understanding