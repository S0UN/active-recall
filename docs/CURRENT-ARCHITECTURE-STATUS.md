# Current Architecture Status & Implementation Guide

## System Overview

The Concept Organizer is a sophisticated knowledge management system that processes OCR'd study content into a semantically organized, searchable knowledge base. The architecture follows a clean separation between the existing capture/classification system and the new core processing pipeline.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│  (Future: Review UI, Search Interface, Folder Browser)     │
└─────────────────────────────────────────────────────────────┘
                                 │
┌─────────────────────────────────────────────────────────────┐
│                  EXISTING SERVICES (src/main)              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ BatcherService  │  │  Orchestrator   │  │   OCR/AI    │  │
│  │   (Groups      │  │ (Coordinates)   │  │ (Captures   │  │
│  │   Text Data)   │  │                 │  │  & Classifies) │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────┬─────────────────────────────────────┬─┘
                       │                                       │
                    BRIDGE                                    │
                   (Feature                                   │
                    Flag)                                     │
                       │                                       │
┌─────────────────────┴─────────────────────────────────────┴─┐
│                 CONCEPT ORGANIZER CORE                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                PIPELINE SERVICES                        │ │
│  │  ┌──────────────┐ ┌─────────────┐ ┌─────────────────┐   │ │
│  │  │Session       │ │   Router    │ │   Artifact      │   │ │
│  │  │Assembler     │ │ (Placement) │ │   Builder       │   │ │
│  │  └──────────────┘ └─────────────┘ └─────────────────┘   │ │
│  │           │               │                │             │ │
│  │           ├───────────────┼────────────────┤             │ │
│  │  ┌────────┴────────┐ ┌────┴─────────┐ ┌────┴────────┐   │ │
│  │  │ Concept         │ │   Routing    │ │   Artifact  │   │ │
│  │  │ Extractor       │ │ Arbitrator   │ │   Enhancer  │   │ │
│  │  │ (Future LLM)    │ │ (Future LLM) │ │ (Future AI) │   │ │
│  │  └─────────────────┘ └──────────────┘ └─────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                 │                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                STORAGE SERVICES                         │ │
│  │  ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐   │ │
│  │  │   Artifact      │ │   Folder    │ │    Audit     │   │ │
│  │  │  Repository     │ │ Repository  │ │  Repository  │   │ │
│  │  └─────────────────┘ └─────────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                 │                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                INDEXING SERVICES                        │ │
│  │  ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐   │ │
│  │  │    Vector       │ │  Embedding  │ │    Folder    │   │ │
│  │  │    Index        │ │   Service   │ │    Index     │   │ │
│  │  │   (Qdrant)      │ │             │ │ (Centroids)  │   │ │
│  │  └─────────────────┘ └─────────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                 │
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│   │   Qdrant    │  │   SQLite    │  │    File System      │ │
│   │ (Vectors)   │  │ (Metadata)  │  │   (Artifacts &      │ │
│   │             │  │             │  │   Audit Logs)       │ │
│   └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Status by Component

### ✅ COMPLETED (Sprint 0)

#### Core Foundation
- **Domain Models** (`src/core/domain/`)
  - `ConceptCandidate.ts` - Rich domain object with business logic
  - Text normalization strategies and quality assessment
  - Deterministic ID generation and content hashing

- **Data Contracts** (`src/core/contracts/schemas.ts`)
  - Complete Zod schemas for all data structures
  - 20+ schemas covering entire pipeline: Batch → Candidate → Artifact → Storage
  - Runtime validation with type inference

- **Service Interfaces** (`src/core/services/interfaces.ts`)
  - 17 service interfaces with comprehensive method signatures
  - Clear separation: Pipeline, Storage, Indexing, Quality, LLM, Maintenance
  - Strategy pattern enables swappable implementations

- **Error System** (`src/core/errors/ConceptOrganizerErrors.ts`)
  - Hierarchical error types (8 categories)
  - Structured error context with recovery strategies
  - Error aggregation for batch operations

- **Configuration** (`src/core/config/`)
  - Type-safe configuration with Zod validation
  - Environment-based loading (.env → runtime config)
  - Feature flags for gradual rollout

- **DI Container** (`src/core/container.ts`)
  - Extended existing container pattern
  - Environment-specific service bindings
  - Test container support

#### Development Infrastructure
- **Docker Compose**: Qdrant + Redis with health checks
- **Dependencies**: All packages installed and configured
- **Scripts**: Automated environment setup (`scripts/dev-setup.sh`)
- **Configuration**: Complete .env files with all settings

### 🎯 NEXT SPRINT (Sprint 1: Storage & Pipeline)

#### Storage Layer (Priority 1)
- **IConceptArtifactRepository** → `FileSystemArtifactRepository`
  - Atomic file writes with temp → rename pattern
  - Deterministic file paths: `KnowledgeBase/Domain/Topic/artifact-id.json`
  - Idempotent operations for reliability

- **IFolderRepository** → `SQLiteFolderRepository`
  - Folder manifest storage and hierarchy management
  - Path aliases for renames without breaking references
  - Provisional folder tracking

- **IAuditRepository** → `FileSystemAuditRepository`
  - Append-only JSONL logging
  - Daily rotation with compression
  - Never-fail append for system reliability

#### Pipeline Services (Priority 2)  
- **ISessionAssembler** → `SessionAssemblerService`
  - Batch → ConceptCandidate conversion
  - Text normalization and quality filtering
  - Content stitching for adjacent snippets

- **IRouter** → `SimpleRouterService` (No AI)
  - Rule-based routing using keyword matching
  - Topic-based folder assignment
  - Default to Unsorted/<topic> for unknown content

- **IArtifactBuilder** → `ArtifactBuilderService`
  - Candidate + Routing → ConceptArtifact
  - Deterministic artifact ID generation
  - Provenance and audit metadata

- **IPipelineOrchestrator** → `PipelineOrchestratorService`
  - End-to-end batch processing coordination
  - Error handling and recovery
  - Session manifest tracking

#### Supporting Services (Priority 3)
- **ISessionManifestService** → `SessionManifestService`
  - Processing session tracking for audit/recovery
  - Batch → Artifact lineage
  - Incomplete session recovery

## Data Flow Architecture

### Current State (Existing Services)
```
Screen Capture → OCR → Classification → BatcherService → [No Further Processing]
```

### Target State (After Sprint 1)
```
Screen Capture → OCR → Classification → BatcherService 
                                            │
                                            ▼
                                      [BRIDGE SERVICE]
                                            │
                                            ▼
                             Core Pipeline Orchestrator
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            Session Assembler        Simple Router         Artifact Builder
                    │                       │                       │
                    ▼                       ▼                       ▼  
            Concept Candidates      Routing Decisions       Final Artifacts
                                                                   │
                                                                   ▼
                                                           Storage Repositories
                                                                   │
                                                                   ▼
                                                            Knowledge Base Files
```

### Migration Strategy
1. **Phase 1** (Sprint 1): Build core pipeline, test in isolation
2. **Phase 2** (Sprint 1): Add bridge service with feature flag
3. **Phase 3** (Sprint 1): Enable bridge, compare outputs
4. **Phase 4** (Future): Deprecate old flow, use core only

## Key Design Patterns

### 1. Strategy Pattern
```typescript
// Swappable implementations
interface IRouter {
  route(candidate: ConceptCandidate): Promise<RoutingDecision>;
}

// Sprint 1: Rule-based
class SimpleRouterService implements IRouter { ... }

// Sprint 2: AI-powered  
class SmartRouterService implements IRouter { ... }
```

### 2. Repository Pattern
```typescript
// Abstract data access
interface IConceptArtifactRepository {
  save(artifact: ConceptArtifact): Promise<void>;
  findById(id: string): Promise<ConceptArtifact | null>;
}

// Implementation handles storage details
class FileSystemArtifactRepository implements IConceptArtifactRepository {
  // File operations, atomic writes, directory structure
}
```

### 3. Domain-Driven Design
```typescript
// Rich domain objects with business logic
class ConceptCandidate {
  // Factory methods with validation
  static create(batch: Batch, normalizer: ITextNormalizer): ConceptCandidate;
  
  // Business operations
  enhance(title: string, keyTerms: string[]): ConceptCandidate;
  hasSameContent(other: ConceptCandidate): boolean;
  getTextForEmbedding(): string;
}
```

### 4. Error Handling Strategy
```typescript
// Structured errors with recovery
try {
  await repository.save(artifact);
} catch (error) {
  if (error instanceof ConcurrentModificationError) {
    // Retry with exponential backoff
  } else if (error instanceof FileSystemError) {
    // Fallback to alternative storage
  }
  // Log structured error context
  auditLogger.logError(error.toJSON());
}
```

## Configuration & Feature Flags

### Environment Configuration
```typescript
// Type-safe configuration access
const config = getConfig();
const storageConfig = getConfigSection('storage');

// Feature flag checks
if (config.features.bridgeToCore) {
  // Use new core pipeline
} else {
  // Keep existing flow
}
```

### Key Configuration Sections
- **Database**: SQLite paths, Redis connection
- **Vector**: Qdrant settings, embedding providers
- **Processing**: Text thresholds, routing confidence levels
- **LLM**: API keys, token budgets (disabled in Sprint 1)
- **Storage**: File paths, backup settings
- **Features**: Gradual rollout flags

## Integration Points

### Existing Services Integration
```typescript
// In existing Orchestrator.ts
async processBatch(batch: Batch): Promise<void> {
  if (this.config.features.bridgeToCore) {
    const coreOrchestrator = this.container.resolve<IPipelineOrchestrator>('IPipelineOrchestrator');
    await coreOrchestrator.processBatch(batch);
  } else {
    // Keep existing processing
    await this.existingProcessingFlow(batch);
  }
}
```

### Container Integration
```typescript
// Core services registered in extended container
const coreContainer = createConceptOrganizerContainer({
  environment: 'development',
  useLocalOnly: true,
  enableLLM: false,
});

// Resolve services for implementation
const repository = coreContainer.resolve<IConceptArtifactRepository>('IConceptArtifactRepository');
```

## Quality Assurance

### Testing Strategy
- **TDD Approach**: Tests first for all implementations
- **Unit Tests**: Isolated with mocked dependencies
- **Integration Tests**: Real databases and file system
- **Property Tests**: Determinism and idempotency verification

### Key Properties to Test
1. **Idempotency**: Same input → same output, can repeat operations
2. **Atomicity**: Operations complete fully or not at all  
3. **Determinism**: Same content → same IDs and file paths
4. **Recovery**: System handles partial failures gracefully

## Performance Considerations

### Sprint 1 Focus
- Atomic file operations for data integrity
- Efficient SQLite queries with proper indexes
- Batch processing to reduce overhead
- Structured logging without performance impact

### Future Optimizations (Sprint 2+)
- Vector search performance tuning
- Embedding generation batching  
- Cache layers for frequently accessed data
- Background job scheduling for maintenance

## Security & Privacy

### Current Protections
- Local-only processing by default
- No external API calls in Sprint 1
- Structured audit logging for compliance
- Atomic operations prevent data corruption

### Future Enhancements (Sprint 4+)
- PII detection and routing
- Encryption at rest for sensitive content
- Token budget limits for LLM usage
- User consent and data deletion capabilities

---

**Architecture Status**: ✅ **FOUNDATION COMPLETE**  
**Next Implementation**: **Sprint 1 - Storage & Pipeline Services**  
**Current Focus**: **Test-Driven Development of Core Services**  
**Integration Strategy**: **Gradual Bridge with Feature Flags**  

**Last Updated**: 2025-08-09  
**Architecture Version**: 1.0 (Post-Sprint 0)