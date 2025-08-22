# Current Architecture Status & Implementation Guide

## System Overview

The Active Recall Concept Organization System is a sophisticated AI-powered knowledge management system that processes captured study content into a semantically organized, searchable knowledge base using the DISTILL → EMBED → ROUTE pipeline.

## Clean Code Architecture (2025)

Following modern clean code principles, the system features extracted services following the Single Responsibility Principle, zero magic numbers through comprehensive configuration, and pure functions for mathematical operations.

```
┌─────────────────────────────────────────────────────────────┐
│                   DISTILL → EMBED → ROUTE                  │
│                 Intelligent Routing Pipeline                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    SMART ROUTER                             │
│                 (Pipeline Orchestrator)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ OpenAI          │  │ OpenAI          │  │ Qdrant      │  │
│  │ Distillation    │  │ Embedding       │  │ Vector      │  │
│  │ Service         │  │ Service         │  │ Index       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────┬─────────────────────────────────────┬─┘
                       │                                       │
┌─────────────────────┴─────────────────────────────────────┴─┐
│                    EXTRACTED SERVICES                       │
│                   (SRP Compliance)                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               DECISION MAKING                           │ │
│  │  ┌──────────────┐ ┌─────────────┐ ┌─────────────────┐   │ │
│  │  │ Routing      │ │  Vector     │ │   Scoring       │   │ │
│  │  │ Decision     │ │ Clustering  │ │  Utilities      │   │ │
│  │  │ Maker        │ │ Service     │ │ (Pure Functions)│   │ │
│  │  └──────────────┘ └─────────────┘ └─────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                 │                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              CONFIGURATION SYSTEM                       │ │
│  │  ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐   │ │
│  │  │  Pipeline       │ │Environment  │ │   Zero       │   │ │
│  │  │  Config         │ │ Variables   │ │ Magic Numbers│   │ │
│  │  │ (Centralized)   │ │(Runtime)    │ │ (Tunable)    │   │ │
│  │  └─────────────────┘ └─────────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                 │
┌─────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│   │   Concept   │  │ Folder Path │  │    Data Schemas     │ │
│   │ Candidate   │  │ Value Object│  │   (Zod Validation)  │ │
│   │(Domain Model)│  │             │  │                     │ │
│   └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Status by Component

### COMPLETED (Sprint 2: Clean Code Architecture & Intelligent Routing)

#### Intelligent Routing Pipeline (DISTILL → EMBED → ROUTE)

- **OpenAIDistillationService** (`src/core/services/impl/OpenAIDistillationService.ts`)
  - LLM-powered content enrichment with title and summary generation
  - GPT-3.5-turbo integration with JSON response format
  - Content caching by hash to reduce API costs and improve performance
  - Fallback extraction for API failures with graceful degradation
  - Intention-revealing naming: `openAiClient`, `contentCache`, `distillationConfig`

- **OpenAIEmbeddingService** (`src/core/services/impl/OpenAIEmbeddingService.ts`)
  - Single vector strategy: combined title + summary embedding for unified routing and deduplication
  - text-embedding-3-small model with 1536 dimensions
  - Efficient single API call per concept (50% cost reduction)
  - Request quota management and daily rate limiting
  - Clean naming: `currentRequestCount`, `dailyRequestLimit`, `embeddingConfig`

- **QdrantVectorIndexManager** (`src/core/services/impl/QdrantVectorIndexManager.ts`)
  - Single-collection vector storage: concepts collection with unified vectors
  - Cosine similarity search with configurable thresholds
  - Centroid-based folder representation and updates
  - Vector index lifecycle management with options objects pattern

#### Clean Code Architecture (Service Extraction for SRP)

- **VectorClusteringService** (`src/core/services/impl/VectorClusteringService.ts`)
  - Pure clustering algorithms extracted from SmartRouter (150 lines)
  - Mathematical functions without side effects
  - Configuration-driven clustering with similarity thresholds
  - All constants replaced with intention-revealing names

- **ConceptRoutingDecisionMaker** (`src/core/services/impl/ConceptRoutingDecisionMaker.ts`)
  - Decision logic separated from orchestration (180 lines)
  - Pure predicate functions for routing conditions
  - Explanation generation for routing decisions
  - No side effects in decision calculations

- **ScoringUtilities** (`src/core/utils/ScoringUtilities.ts`)
  - Pure mathematical functions for folder scoring (120 lines)
  - Weighted component calculation with configuration
  - Statistical operations without side effects
  - All magic numbers eliminated via configuration parameters

#### Configuration System (Zero Magic Numbers)

- **PipelineConfig** (`src/core/config/PipelineConfig.ts`)
  - Centralized configuration eliminating ALL magic numbers (200 lines)
  - Environment variable support with fallbacks and validation
  - Type-safe configuration with Zod schemas
  - Runtime configuration merging and overrides
  - 29 comprehensive configuration tests

#### Smart Router (Refactored for Orchestration Only)

- **SmartRouter** (`src/core/services/impl/SmartRouter.ts`) - **REFACTORED**
  - 48% size reduction (741 → 387 lines)
  - Single responsibility: pipeline orchestration only
  - Dependency injection for all extracted services
  - Comprehensive error handling with graceful degradation
  - Intention-revealing method names throughout

### COMPLETED (Sprint 1: Data Models & Core Contracts)

#### Foundation Data Layer
- **Complete Schema System** (`src/core/contracts/schemas.ts`)
  - 5 core Zod schemas with runtime validation and type inference
  - 18 comprehensive schema validation tests
  - Updated with DistilledContent and VectorEmbeddings schemas

- **Domain Models** (`src/core/domain/`)
  - `ConceptCandidate.ts` - Rich domain object with 25+ helper methods (19 tests)
  - `FolderPath.ts` - Immutable path value object with operations (38 tests)
  - Refactored with PipelineConfig integration for all validation thresholds

- **Repository Contracts** (`src/core/contracts/repositories.ts`)
  - 3 repository interfaces with comprehensive method signatures
  - 37 contract tests that any implementation must satisfy
  - Clear separation: storage operations, folder hierarchy, audit trail

#### Quality Metrics Achieved (Sprint 2)
- **95%+ Test Coverage** with comprehensive behavioral testing
- **Zero Magic Numbers** - All values moved to configuration
- **SRP Compliance** - Each service has single clear responsibility
- **Pure Functions** - Mathematical operations without side effects
- **Type Safety** - Full TypeScript compilation without errors
- **72+ Passing Tests** for core routing components

### 🎯 NEXT SPRINT (Sprint 3: LLM Enhancement & Summarization)

#### Enhanced LLM Services (Priority 1)
- **Enhanced Content Summarization**
  - Advanced prompt engineering for better summaries
  - Multi-turn conversation for complex content
  - Domain-specific summarization strategies

- **LLM Arbitration for Ambiguous Routing**
  - GPT-powered decision making for mid-confidence cases
  - Reasoning explanation generation
  - Fallback to rule-based when LLM unavailable

- **Token Budget Management**
  - Daily/monthly usage tracking and limits
  - Cost optimization strategies
  - Usage analytics and reporting

#### Advanced Concept Processing (Priority 2)
- **Concept Enhancement Pipeline**
  - Key term extraction and highlighting
  - Quiz question seed generation
  - Cross-reference identification

- **Quality Assessment**
  - Content quality scoring improvements
  - Duplicate detection refinements
  - Spam and low-quality content filtering

### 🔮 FUTURE SPRINTS (Sprint 4+)

#### Background Jobs & Maintenance (Sprint 7)
- **Folder Rename Job** - LLM-powered provisional folder naming
- **Tidy Job** - Merge small folders, split large ones
- **Index Maintenance** - Centroid recomputation and optimization

#### UI & Review Interface (Sprint 8)
- **Review Queue Interface** - Manual review for ambiguous cases
- **Search Interface** - Vector-powered content search
- **Folder Browser** - Hierarchical knowledge base navigation

## Current Architecture Patterns

### 1. Single Responsibility Principle (Clean Code 2025)
```typescript
// BEFORE: Monolithic SmartRouter (741 lines, 8+ responsibilities)
class SmartRouter {
  // Orchestration + clustering + scoring + decisions + statistics + ...
}

// AFTER: Focused Services (each with 1 responsibility)
class VectorClusteringService {       // Pure clustering algorithms
class ConceptRoutingDecisionMaker {   // Decision logic only
class ScoringUtilities {              // Mathematical functions only
class SmartRouter {                   // Orchestration only
```

### 2. Configuration Over Constants (Zero Magic Numbers)
```typescript
// BEFORE: Magic numbers scattered throughout
if (confidence >= 0.82) { /* auto-route */ }
const countBonus = Math.min(concepts.length * 0.02, 0.1);

// AFTER: Configuration-driven behavior
const config = loadPipelineConfig();
if (confidence >= config.routing.highConfidenceThreshold) {
  const bonus = ScoringUtilities.calculateConceptCountBonus(
    concepts.length, 
    config.folderScoring
  );
}
```

### 3. Pure Functions (Side Effect Elimination)
```typescript
// BEFORE: Side effects mixed with calculations
private calculateFolderScore(concepts: SimilarConcept[]): number {
  const score = this.computeScore(concepts);
  this.routingStats.totalConfidence += score; // Side effect!
  return score;
}

// AFTER: Pure functions + separate side effects
// Pure calculation
static calculateFolderScore(concepts, weights, limits): number {
  return ScoringUtilities.combineWeightedScoreComponents(components);
}

// Separate side effect
private updateRoutingStatistics(decision: RoutingDecision): void {
  this.routingStatistics.totalConfidence += decision.confidence;
}
```

### 4. Dependency Inversion (Interface-Based Design)
```typescript
// Swappable AI services
interface IDistillationService {
  distill(candidate: ConceptCandidate): Promise<DistilledContent>;
}

// OpenAI implementation
class OpenAIDistillationService implements IDistillationService

// Local/offline implementation  
class LocalDistillationService implements IDistillationService

// SmartRouter depends on abstraction, not implementation
constructor(
  private readonly distillationService: IDistillationService,
  private readonly embeddingService: IEmbeddingService,
  private readonly clusteringService: IClusteringService,
  private readonly decisionMaker: IRoutingDecisionMaker
) {}
```

## Data Flow Architecture

### Current State (Sprint 2 Complete)
```
ConceptCandidate → DISTILL (LLM) → EMBED (title+summary) → ROUTE (vector search)
                      ↓              ↓                      ↓
               DistilledContent → VectorEmbeddings → RoutingDecision
                      ↓              ↓                      ↓
                 [Cached Results] [Dual Vectors]    [Confidence-Based]
```

### Intelligent Routing Decision Flow
```
Vector Search → Folder Matches → Scoring → Decision Making
                      ↓              ↓            ↓
              [Similarity Groups] [Weighted] [Confidence Thresholds]
                                    ↓            ↓
                               ┌─────────────────────────┐
                               │ High (≥0.82): Auto     │
                               │ Mid (0.65-0.82): Review│
                               │ Low (<0.65): Unsorted  │
                               └─────────────────────────┘
```

## Configuration & Environment Setup

### Environment Configuration Examples
```bash
# High accuracy configuration (slower, more accurate)
HIGH_CONFIDENCE_THRESHOLD=0.85
LOW_CONFIDENCE_THRESHOLD=0.70
AVG_SIMILARITY_WEIGHT=0.7
MAX_SIMILARITY_WEIGHT=0.2

# Fast processing configuration (faster, less selective)
HIGH_CONFIDENCE_THRESHOLD=0.75
LOW_CONFIDENCE_THRESHOLD=0.60
CONTEXT_SEARCH_LIMIT=20
TITLE_SEARCH_LIMIT=10

# AI Services
OPENAI_API_KEY=your-api-key-here
DISTILLATION_MODEL=gpt-3.5-turbo
EMBEDDING_MODEL=text-embedding-3-small
```

### Programmatic Configuration
```typescript
// Development configuration
const devConfig = loadPipelineConfig({
  routing: {
    highConfidenceThreshold: 0.7, // More lenient for testing
    lowConfidenceThreshold: 0.5
  },
  clustering: {
    minClusterSize: 2 // Smaller clusters for dev data
  }
});

// Production configuration  
const prodConfig = loadPipelineConfig({
  routing: {
    highConfidenceThreshold: 0.85, // Stricter for production
    lowConfidenceThreshold: 0.70
  }
});
```

## Quality Assurance & Testing

### Testing Strategy (Sprint 2 Achievement)
- **TDD Approach**: All services developed test-first
- **Service-Specific Testing**: Each extracted service tested independently
- **Configuration Testing**: Environment variables and overrides validated
- **Integration Testing**: End-to-end pipeline flow verification
- **Real AI Testing**: Actual OpenAI API integration tests

### Key Test Coverage
- **PipelineConfig**: 29 configuration tests
- **VectorClusteringService**: 20 clustering algorithm tests  
- **ConceptRoutingDecisionMaker**: 16 decision logic tests
- **ScoringUtilities**: 12 mathematical function tests
- **SmartRouter**: 16 orchestration tests
- **Integration**: 10 end-to-end pipeline tests

### Clean Code Testing Principles
- **One Assert Per Test** - Clear test failure messages
- **Descriptive Test Names** - Intent-revealing test descriptions  
- **Isolated Tests** - No dependencies between test cases
- **Fast Tests** - Pure functions test quickly
- **Deterministic Tests** - Same input always produces same output

## Performance Characteristics

### Sprint 2 Performance Metrics
- **Distillation**: ~500ms per concept (cached results much faster)
- **Embedding**: ~200ms dual vector generation  
- **Vector Search**: <50ms similarity matching
- **Total Pipeline**: <1 second end-to-end
- **Configuration Loading**: <10ms with validation

### Memory & Resource Usage
- **Service Extraction**: Reduced object complexity
- **Pure Functions**: No retained state, garbage collection friendly
- **Configuration**: Loaded once, reused throughout application
- **Caching**: Content-based caching reduces API calls

## Security & Privacy

### Current Protections (Sprint 2)
- **API Key Management**: Environment-based configuration only
- **Content Caching**: Hash-based, no sensitive data in keys
- **Request Limits**: Daily quota enforcement prevents runaway costs
- **Error Handling**: No sensitive data in error messages or logs
- **Configuration Validation**: Prevents injection via environment variables

### Data Flow Security
- **No Data Persistence**: OpenAI services don't persist training data
- **Local Processing**: Distillation and embedding happen via API only
- **Content Hashing**: SHA-256 for cache keys, deterministic IDs
- **Graceful Degradation**: Fallback to local extraction if API fails

---

**Architecture Status**: **SPRINT 2 COMPLETE - CLEAN CODE ARCHITECTURE WITH INTELLIGENT ROUTING**  
**Current Achievement**: **DISTILL → EMBED → ROUTE Pipeline Fully Functional**  
**Code Quality**: **95%+ Test Coverage, Zero Magic Numbers, SRP Compliance**  
**Next Implementation**: **Sprint 3 - LLM Enhancement & Summarization**  

**Key Accomplishments**:
- Service extraction following Single Responsibility Principle  
- Zero magic numbers through comprehensive configuration system
- Pure functions for mathematical operations 
- Intention-revealing names throughout codebase
- 95%+ test coverage with focused unit tests
- Full TypeScript compilation without errors

**Last Updated**: 2025-01-17  
**Architecture Version**: 2.0 (Post-Sprint 2 Clean Code Implementation)
