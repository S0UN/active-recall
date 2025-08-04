# UniversalModelFactory Configuration Guide

## Overview

The `UniversalModelFactory` is the central component for creating and managing AI classification strategies in the Active Recall system. It provides a unified interface for different classification approaches and supports both full and quantized models.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UniversalModelFactory                    │
├─────────────────────────────────────────────────────────────┤
│  • Strategy Management & Creation                           │
│  • Model Availability Checking                             │
│  • Automatic Model Selection                               │
│  • Model Variant Support (Full/Quantized)                  │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
┌───▼────┐              ┌────▼─────┐              ┌────▼────┐
│Zero-Shot│              │Embedding │              │ Hybrid  │
│Strategy │              │Strategy  │              │Strategy │
│        │              │          │              │         │
│RoBERTa │              │ MiniLM   │              │Combined │
│BART    │              │          │              │Approach │
│DeBERTa │              │          │              │         │
└────────┘              └──────────┘              └─────────┘
```

## Supported Models

### Zero-Shot Classification Models
| Model | Memory | Accuracy | Speed | Best For |
|-------|--------|----------|--------|----------|
| **facebook/bart-large-mnli** | 2GB | Highest | Slow | Maximum accuracy, complex topics |
| **microsoft/deberta-v3-large** | 1.8GB | Highest | Slow | Research content, technical documents |
| **roberta-large-mnli** | 1.5GB | High | Medium | General-purpose, balanced performance |
| **distilbert-base-uncased-mnli** | 512MB | Medium | Fast | Resource-constrained environments |

### Embedding Models
| Model | Memory | Speed | Best For |
|-------|--------|-------|----------|
| **all-MiniLM-L6-v2** | 90MB | Very Fast | Quick similarity matching |

## Configuration Options

### 1. Environment Variables

```bash
# Model Variant Selection
USE_FULL_MODELS=true           # Use full precision models (default: false)

# Model Path Configuration  
MODEL_STORAGE_PATH=./models    # Path to quantized models
FULL_MODEL_PATH=./models-full  # Path to full precision models

# Performance Tuning
NEW_WINDOW_PIPELINE_DELAY_MS=15000  # Tab switching delay
```

### 2. Programmatic Configuration

#### Basic Strategy Creation
```typescript
import { UniversalModelFactory } from './services/analysis/impl/UniversalModelFactory';

const factory = new UniversalModelFactory();

// Create zero-shot strategy with BART Large
const strategy = await factory.createStrategy(
  'zero-shot',
  'facebook/bart-large-mnli',
  {
    topic: 'computer science',
    threshold: 0.5
  }
);

// Create embedding strategy
const embeddingStrategy = await factory.createStrategy(
  'embedding',
  'all-MiniLM-L6-v2',
  {
    topic: 'biology',
    threshold: 0.6
  }
);

// Create hybrid strategy (combines multiple approaches)
const hybridStrategy = await factory.createStrategy(
  'hybrid',
  'hybrid-default',
  {
    topic: 'mathematics',
    threshold: 0.7
  }
);
```

#### Auto-Selection
```typescript
// Let the factory choose the best available strategy
const autoStrategy = await factory.createStrategy('auto', 'roberta-large-mnli');

// Or use the convenience method
const bestClassifier = await factory.createBestAvailableClassifier();
```

#### Legacy Support
```typescript
// Backward compatibility with existing code
const legacyClassifier = await factory.createClassifier('facebook/bart-large-mnli');
```

## Model Variant Selection

### Quantized Models (Default)
- **Location**: `./models/`
- **Benefits**: Faster inference, lower memory usage
- **Trade-off**: Slightly reduced accuracy

### Full Precision Models
- **Location**: `./models-full/`
- **Benefits**: Maximum accuracy
- **Trade-off**: Higher memory usage, slower inference

### Selection Logic
```typescript
// Priority order for model variant selection:
// 1. Constructor parameter
// 2. Environment variable (USE_FULL_MODELS)
// 3. Configuration setting
// 4. Default (quantized)

const service = new TopicClassificationService(
  'facebook/bart-large-mnli',
  true  // Force full precision models
);
```

## Configuration Examples

### 1. High-Accuracy Research Setup
```typescript
// Environment variables
USE_FULL_MODELS=true

// Code configuration
const factory = new UniversalModelFactory();
const strategy = await factory.createStrategy(
  'zero-shot',
  'microsoft/deberta-v3-large',
  {
    topic: 'machine learning research',
    threshold: 0.8  // High confidence required
  }
);
```

### 2. Fast Response Setup
```typescript
// Environment variables
USE_FULL_MODELS=false

// Code configuration
const strategy = await factory.createStrategy(
  'embedding',
  'all-MiniLM-L6-v2',
  {
    topic: 'general programming',
    threshold: 0.4  // Lower threshold for speed
  }
);
```

### 3. Balanced Production Setup
```typescript
// Environment variables
USE_FULL_MODELS=false

// Code configuration
const strategy = await factory.createStrategy(
  'zero-shot',
  'roberta-large-mnli',
  {
    topic: 'computer science',
    threshold: 0.5  // Balanced threshold
  }
);
```

### 4. Maximum Accuracy Setup (Hybrid)
```typescript
const hybridStrategy = await factory.createStrategy(
  'hybrid',
  'hybrid-default',
  {
    topic: 'complex technical documentation',
    threshold: 0.6,
    hybridConfig: {
      keywordWeight: 0.2,
      embeddingWeight: 0.3,
      zeroShotWeight: 0.5
    }
  }
);
```

## Service-Specific Configuration

### SegmentedClassificationService
```typescript
// Default configuration (now uses BART Large)
const segmentedService = new SegmentedClassificationService(
  textSegmenter,
  textPreprocessor,
  modelFactory
);

// Custom configuration
await segmentedService.updateConfiguration({
  strategyType: 'zero-shot',
  modelName: 'facebook/bart-large-mnli',  // Now the default
  topic: 'biology',
  studyingThreshold: 0.65,
  confidenceThreshold: 0.5
});
```

### TopicClassificationService
```typescript
// Using full precision BART Large
const topicService = new TopicClassificationService(
  'facebook/bart-large-mnli',
  true  // Use full models
);

await topicService.init();
topicService.setTopicConfig('computer science', 0.5);
```

## Best Practices

### 1. Model Selection Guidelines

**For Maximum Accuracy:**
- Use `microsoft/deberta-v3-large` or `facebook/bart-large-mnli`
- Enable full precision models (`USE_FULL_MODELS=true`)
- Set higher confidence thresholds (0.7-0.8)

**For Speed:**
- Use `all-MiniLM-L6-v2` (embedding strategy)
- Keep quantized models (default)
- Lower confidence thresholds (0.3-0.5)

**For Balanced Performance:**
- Use `roberta-large-mnli`
- Quantized models (default)
- Standard threshold (0.5)

### 2. Topic Configuration

```typescript
// Specific topics work better than generic ones
// ✅ Good
topicService.setTopicConfig('machine learning algorithms', 0.5);
topicService.setTopicConfig('organic chemistry reactions', 0.5);

// ❌ Less effective
topicService.setTopicConfig('studying', 0.5);
topicService.setTopicConfig('learning', 0.5);
```

### 3. Threshold Tuning

```typescript
// Conservative (fewer false positives)
const conservativeConfig = { threshold: 0.7 };

// Balanced (recommended starting point)
const balancedConfig = { threshold: 0.5 };

// Aggressive (catches more content, may have false positives)
const aggressiveConfig = { threshold: 0.3 };
```

### 4. Memory Management

```typescript
// For resource-constrained environments
const lightweightStrategy = await factory.createStrategy(
  'embedding',
  'all-MiniLM-L6-v2',
  { topic: 'programming', threshold: 0.4 }
);

// For high-memory environments
const powerfulStrategy = await factory.createStrategy(
  'hybrid',
  'hybrid-default',
  { topic: 'research', threshold: 0.6 }
);
```

## Troubleshooting

### Common Issues

1. **Model Not Found**
   ```
   Error: Model files not found at ./models/bart-large-mnli
   ```
   - **Solution**: Ensure model files are downloaded to correct directory
   - **Check**: Verify `USE_FULL_MODELS` environment variable

2. **Memory Issues**
   ```
   Error: Out of memory when loading model
   ```
   - **Solution**: Use quantized models or lighter models
   - **Alternative**: Increase system memory or use embedding strategy

3. **Slow Performance**
   ```
   Warning: Classification taking >5 seconds
   ```
   - **Solution**: Switch to quantized models or embedding strategy
   - **Check**: System resources and model size

### Performance Monitoring

```typescript
// Add logging to monitor performance
Logger.info('Classification performance', {
  model: 'facebook/bart-large-mnli',
  strategy: 'zero-shot',
  processingTime: Date.now() - startTime,
  confidence: result.confidence
});
```

## Integration Examples

### With Dependency Injection
```typescript
// container.ts
container.register('ModelFactory', {
  useClass: UniversalModelFactory
});

// In your service
constructor(
  @inject('ModelFactory') private readonly modelFactory: UniversalModelFactory
) {}
```

### With Configuration Service
```typescript
// Configure based on environment
const isProduction = process.env.NODE_ENV === 'production';
const modelConfig = {
  strategyType: isProduction ? 'zero-shot' : 'embedding',
  modelName: isProduction ? 'facebook/bart-large-mnli' : 'all-MiniLM-L6-v2',
  useFullModels: isProduction
};
```

This configuration guide should help you optimize the UniversalModelFactory for your specific use case, whether you prioritize accuracy, speed, or resource efficiency.