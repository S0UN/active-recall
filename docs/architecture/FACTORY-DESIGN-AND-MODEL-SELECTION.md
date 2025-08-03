# Factory Design and Model Selection Strategy

## Overview

The classification system now supports multiple approaches through an extensible factory architecture that implements the **Strategy Pattern** combined with the **Factory Pattern**. This design allows easy addition of new classification techniques while maintaining a consistent interface.

## Architecture Design

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    UniversalModelFactory                    │
├─────────────────────────────────────────────────────────────┤
│  • Strategy Registration & Management                       │
│  • Model Availability Checking                             │
│  • Performance-Based Recommendations                       │
│  • Automatic Model Selection                               │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
┌───▼────┐              ┌────▼─────┐              ┌────▼────┐
│Zero-Shot│              │Embedding │              │ Hybrid  │
│Strategy │              │Strategy  │              │Strategy │
└────────┘              └──────────┘              └─────────┘
    │                         │                         │
┌───▼────┐              ┌────▼─────┐              ┌────▼────┐
│RoBERTa │              │ MiniLM   │              │Multiple │
│BART    │              │ MPNet    │              │Combined │
│DistilBERT│            │ E5       │              │Approaches│
└────────┘              └──────────┘              └─────────┘
```

### Strategy Pattern Implementation

Each classification approach implements the `ClassificationStrategy` interface:

```typescript
interface ClassificationStrategy {
  // Core functionality
  init(): Promise<void>;
  classify(text: string): Promise<string>;
  classifyWithConfidence(text: unknown): Promise<ClassificationResult>;
  
  // Configuration
  setConfig(config: ClassificationConfig): void;
  getConfig(): ClassificationConfig | undefined;
  
  // Metadata and introspection
  getMetadata(): StrategyMetadata;
  isAvailable(): Promise<boolean>;
}
```

## Classification Approaches

### 1. Zero-Shot Classification Strategy

**How it works:**
- Uses pre-trained NLI (Natural Language Inference) models
- Single-label approach: "This text is about {topic}"
- Confidence-based thresholding

**Models Available:**
- **RoBERTa-Large-MNLI** ⭐ **(Best Overall)**
  - 85.4% average accuracy
  - 0.5 recommended threshold
  - 2GB memory requirement
- **DistilBERT-Base-MNLI**
  - 75.0% average accuracy
  - 0.3 recommended threshold
  - 500MB memory requirement
- **BART-Large-MNLI**
  - 66.7% average accuracy
  - 0.7 recommended threshold
  - 1.6GB memory requirement
- **DeBERTa-v3-Large**
  - 81.3% average accuracy
  - 0.5 recommended threshold
  - 2.5GB memory requirement

**Best For:**
- Complex reasoning tasks
- High accuracy requirements
- Any topic without training data

**Implementation:**
```typescript
const strategy = await factory.createStrategy('zero-shot', 'roberta-large-mnli', {
  topic: 'machine learning',
  threshold: 0.5
});
```

### 2. Embedding Similarity Strategy

**How it works:**
- Generates semantic embeddings for topic and text
- Computes cosine similarity between embeddings
- Direct similarity thresholding

**Models Available:**
- **all-MiniLM-L6-v2** ⭐ **(Best Speed/Accuracy Trade-off)**
  - ~78% estimated accuracy
  - 90MB model size
  - Fast inference (50ms avg)
  - 0.65 recommended threshold
- **all-MPNet-Base-v2**
  - ~82% estimated accuracy
  - 420MB model size
  - Medium inference (200ms avg)
  - 0.7 recommended threshold
- **E5-Large-v2**
  - ~85% estimated accuracy
  - 1.2GB model size
  - Slow inference (500ms avg)
  - 0.75 recommended threshold

**Best For:**
- Fast inference requirements
- Resource-constrained environments
- Direct semantic similarity needs

**Implementation:**
```typescript
const strategy = await factory.createStrategy('embedding', 'all-MiniLM-L6-v2', {
  topic: 'JavaScript programming',
  threshold: 0.65
});
```

### 3. Hybrid Classification Strategy

**How it works:**
- Combines three approaches with weighted scores:
  - **Keyword Matching** (30%): Fast initial filtering
  - **Semantic Similarity** (40%): Nuanced understanding
  - **Zero-Shot Classification** (30%): Complex reasoning
- Final score = weighted combination of all three

**Configuration:**
```typescript
const hybridConfig = {
  topic: 'chemistry',
  keywords: ['molecular', 'atoms', 'reactions', 'compounds'],
  keywordWeight: 0.3,    // Keyword matching influence
  semanticWeight: 0.4,   // Embedding similarity influence
  ensembleWeight: 0.3,   // Zero-shot classification influence
  threshold: 0.65        // Final decision threshold
};
```

**Best For:**
- Maximum accuracy requirements
- Production systems with complex needs
- When you need detailed scoring breakdown

**Advantages:**
- **Highest accuracy**: ~90% expected
- **Robust to edge cases**: Multiple approaches catch different patterns
- **Detailed insights**: Shows exactly why classification was made
- **Automatic keyword generation**: Expands topics intelligently

## Factory Design Principles

### 1. Strategy Registration

The factory uses a registration pattern to add new strategies:

```typescript
private registerStrategies(): void {
  this.strategies.set('zero-shot', {
    create: async (model: string) => { /* ... */ },
    getAvailableModels: async () => { /* ... */ },
    getMetadata: (model: string) => { /* ... */ }
  });
  
  this.strategies.set('embedding', { /* ... */ });
  this.strategies.set('hybrid', { /* ... */ });
}
```

### 2. Automatic Model Selection

The factory can automatically recommend the best strategy:

```typescript
const recommendation = await factory.recommendStrategy({
  maxLatency: 100,        // Maximum 100ms per classification
  minAccuracy: 0.8,       // Minimum 80% accuracy
  preferSpeed: true,      // Prioritize speed over accuracy
  requiresOffline: true   // Must work without internet
});

console.log(recommendation);
// {
//   strategy: 'embedding',
//   model: 'all-MiniLM-L6-v2',
//   expectedAccuracy: 0.78,
//   expectedLatency: 50,
//   rationale: 'Fast inference with good accuracy for speed-critical applications'
// }
```

### 3. Performance Benchmarking

The factory can benchmark all available strategies:

```typescript
const testCases = [
  { text: "React hooks manage component state", expectedMatch: true },
  { text: "This pasta recipe uses tomatoes", expectedMatch: false }
];

const results = await factory.benchmarkStrategies(testCases, 'JavaScript programming');
// Returns Map with performance metrics for each strategy
```

## Model Selection Decision Tree

```
Start: What are your requirements?
│
├─ Need Maximum Accuracy?
│  └─ YES → Hybrid Strategy
│     └─ Expected: 90% accuracy, 500ms latency, 3GB RAM
│
├─ Need Fast Inference (<100ms)?
│  └─ YES → Embedding Strategy (MiniLM)
│     └─ Expected: 78% accuracy, 50ms latency, 500MB RAM
│
├─ Need Offline Operation?
│  └─ YES → Zero-Shot Strategy (RoBERTa)
│     └─ Expected: 85% accuracy, 200ms latency, 2GB RAM
│
├─ Resource Constrained?
│  └─ YES → Zero-Shot Strategy (DistilBERT)
│     └─ Expected: 75% accuracy, 150ms latency, 500MB RAM
│
└─ Default → Auto-Select Best Available
   └─ Factory evaluates requirements and selects optimal strategy
```

## Implementation Examples

### Simple Usage (Auto-Select)

```typescript
const factory = new UniversalModelFactory();

// Factory automatically selects best available strategy
const classifier = await factory.createClassifier();
// Or with legacy model specification
const classifier = await factory.createClassifier('roberta-large-mnli');
```

### Advanced Usage (Explicit Strategy)

```typescript
const factory = new UniversalModelFactory();

// Create specific strategy with configuration
const strategy = await factory.createStrategy('hybrid', 'hybrid-default', {
  topic: 'machine learning',
  keywordWeight: 0.2,   // Less keyword focus
  semanticWeight: 0.5,  // More semantic focus
  ensembleWeight: 0.3,
  threshold: 0.7        // Higher confidence required
});

const result = await strategy.classifyWithConfidence(text);
console.log(result.confidence); // Final combined score
```

### Performance-Based Selection

```typescript
const factory = new UniversalModelFactory();

// Get recommendation based on requirements
const recommendation = await factory.recommendStrategy({
  minAccuracy: 0.85,      // Need at least 85% accuracy
  maxLatency: 200,        // Maximum 200ms per classification
  maxMemoryUsage: 1500,   // Maximum 1.5GB RAM
  supportedTopics: ['programming', 'science']
});

const strategy = await factory.createStrategy(
  recommendation.strategy,
  recommendation.model,
  { topic: 'JavaScript programming' }
);
```

## Extension Points

### Adding New Strategies

To add a new classification approach:

1. **Implement the Strategy Interface:**
```typescript
class KeywordClassificationStrategy implements ClassificationStrategy {
  // Implement all required methods
}
```

2. **Register with Factory:**
```typescript
factory.strategies.set('keyword', {
  create: async (model: string) => new KeywordClassificationStrategy(model),
  getAvailableModels: async () => ['tfidf', 'bm25'],
  getMetadata: (model: string) => ({ /* metadata */ })
});
```

### Adding New Models

To add new models to existing strategies:

1. **Update Model Specifications:**
```typescript
export const NEW_MODEL_SPECS = {
  'new-embedding-model': {
    name: 'new-embedding-model',
    size: '200MB',
    speed: 'fast',
    quality: 'better',
    localPath: './models/new-embedding-model',
    recommendedThreshold: 0.68
  }
};
```

2. **Update Factory Registration:**
The factory will automatically discover new models through the `getAvailableModels()` method.

## Performance Characteristics

| Strategy | Accuracy | Latency | Memory | Best Use Case |
|----------|----------|---------|---------|---------------|
| **Hybrid** | **90%** | 500ms | 3GB | Production, Maximum Accuracy |
| **Zero-Shot (RoBERTa)** | **85%** | 200ms | 2GB | **Balanced Production Use** |
| **Embedding (MiniLM)** | 78% | **50ms** | **500MB** | **Fast Inference, Mobile** |
| Zero-Shot (DistilBERT) | 75% | 150ms | 500MB | Resource Constrained |
| Zero-Shot (BART) | 67% | 300ms | 1.6GB | Research, Experimentation |

## Monitoring and Observability

The factory provides built-in monitoring:

```typescript
// Get available strategies and their status
const strategies = await factory.getAvailableStrategies();
strategies.forEach(s => {
  console.log(`${s.type}: ${s.models.length} models available`);
  console.log(`Expected accuracy: ${s.metadata.performance.accuracy}`);
});

// Benchmark against your specific use case
const benchmark = await factory.benchmarkStrategies(testCases, topic);
benchmark.forEach((metrics, strategy) => {
  console.log(`${strategy}: ${metrics.accuracy}% accuracy, ${metrics.avgLatency}ms avg`);
});
```

## Future Enhancements

1. **Model Caching**: Cache loaded models to avoid reinitialization
2. **Dynamic Loading**: Load models on-demand based on usage patterns
3. **A/B Testing**: Built-in A/B testing framework for strategy comparison
4. **Custom Ensembles**: Allow users to create custom ensemble strategies
5. **Fine-Tuning Support**: Add support for fine-tuned models
6. **Multi-Language**: Extend support beyond English
7. **Streaming Classification**: Support for real-time streaming classification

## Conclusion

The extensible factory architecture provides a robust foundation for topic classification that can adapt to different requirements and easily incorporate new approaches. The automatic model selection ensures optimal performance while the strategy pattern allows for easy extension and customization.

**Key Benefits:**
- ✅ **Flexibility**: Multiple strategies for different use cases
- ✅ **Performance**: Automatic optimization based on requirements
- ✅ **Extensibility**: Easy to add new models and approaches
- ✅ **Observability**: Built-in monitoring and benchmarking
- ✅ **Compatibility**: Maintains backward compatibility with existing code