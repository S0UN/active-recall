v# Sprint 1 Design: Data Models & Core Contracts

## Overview

Sprint 1 established the foundational data structures, schemas, and contracts for the Concept Organizer system. This document explains what we built, why we made these design decisions, and how everything fits together.

## What We Built

### 1. **Data Schemas with Zod** (`src/core/contracts/schemas.ts`)

**What it is**: Runtime validation schemas for all data structures in the system.

**Why Zod**: 
- **Runtime Safety**: Validates data at boundaries (API input, file reads, etc.)
- **Type Inference**: Automatically generates TypeScript types from schemas
- **Single Source of Truth**: Schema defines both validation and types
- **Error Messages**: Clear validation error messages for debugging

**Key Schemas**:
```typescript
// Input from capture system
BatchSchema -> Represents captured text from OCR
EntrySchema -> Individual text snippets with timestamps  
SessionMarkerSchema -> Groups entries into sessions

// Processing pipeline
ConceptCandidateSchema -> Normalized text ready for routing
ConceptArtifactSchema -> Final processed concept with metadata
RoutingInfoSchema -> Placement decision with confidence

// Storage structures
FolderManifestSchema -> Folder metadata and statistics
```

**Design Decision**: We use schemas everywhere data crosses boundaries. This catches errors early and ensures data integrity throughout the system.

### 2. **Domain Models** (`src/core/domain/`)

#### ConceptCandidate (`ConceptCandidate.ts`)

**What it is**: Rich domain object that represents a potential concept extracted from captured text.

**Key Design Principles**:
- **Self-Documenting Code**: Method names clearly express intent
- **Abstraction Levels**: Top-level methods hide complex implementation details
- **Pipeline Pattern**: Text normalization uses clear transformation steps
- **Immutable**: Once created, the original text never changes

**Business Logic**:
```typescript
// Pipeline pattern for text normalization
private createNormalizationPipeline(): Array<(text: string) => string> {
  return [
    this.convertToLowercase,      // "HELLO" -> "hello"
    this.trimWhitespace,          // "  text  " -> "text"
    this.collapseMultipleSpaces,  // "a    b" -> "a b" 
    this.removeUIArtifacts,       // "text | Home | About" -> "text"
  ];
}
```

**Why This Design**:
- **Deterministic IDs**: Same content always gets same ID (enables deduplication)
- **Quality Scoring**: Rejects low-quality text (repetitive, too short, etc.)
- **Content Hashing**: Enables exact duplicate detection
- **Normalization**: Consistent format for similarity comparison

#### FolderPath (`FolderPath.ts`) 

**What it is**: Value object representing hierarchical folder paths with validation.

**Key Features**:
- **Immutable**: Cannot be modified after creation
- **Validation**: Enforces naming rules, depth limits, reserved names
- **Path Operations**: parent, child, ancestors, siblings
- **Special Folders**: Unsorted, Provisional with special handling

**Design Constraints**:
```typescript
private static readonly CONSTRAINTS = {
  maxDepth: 4,                    // Prevents infinite nesting
  maxSegmentLength: 50,           // Readable folder names
  reservedNames: ['CON', 'PRN'],  // Windows compatibility
  invalidCharacters: /[<>:"|?*]/, // File system safe
};
```

**Why These Constraints**:
- **Max Depth 4**: Balances organization vs. complexity 
- **Reserved Names**: Prevents Windows file system conflicts
- **Character Restrictions**: Ensures cross-platform compatibility

### 3. **Repository Interfaces** (`src/core/contracts/repositories.ts`)

**What it is**: Abstract interfaces defining how data will be stored and retrieved.

**Key Interfaces**:
```typescript
IConceptArtifactRepository  // Stores final processed concepts
IFolderRepository          // Manages folder hierarchy  
IBatchRepository          // Stores input batches for audit
```

**Why Interfaces First**:
- **Testability**: Can create mock implementations for testing
- **Flexibility**: Can swap implementations (file system, database, etc.)
- **Clear Contracts**: Defines exactly what operations are supported
- **Future-Proof**: Can add new implementations without changing business logic

**Key Design Patterns**:
- **Idempotency**: Operations can be safely repeated
- **Atomic Operations**: Either fully succeed or fully fail
- **Error Handling**: Clear error types for different failure modes

### 4. **Contract Tests** 

**What it is**: Test suites that verify any implementation satisfies the interface contract.

**How It Works**:
```typescript
// Any implementation must pass these tests
function testConceptArtifactRepositoryContract(
  createRepository: () => Promise<IConceptArtifactRepository>
) {
  // 37 tests covering all required behaviors
}
```

**Why Contract Tests**:
- **Implementation Verification**: Ensures any storage backend works correctly
- **Regression Prevention**: New implementations can't break existing behavior  
- **Documentation**: Tests serve as executable specification

## Integration & End-to-End Flow

### Data Flow

```
Input Batch (OCR Text)
      ↓
  BatchSchema.parse()  ← Runtime validation
      ↓
ConceptCandidate.create()  ← Domain logic & validation  
      ↓
candidate.normalize()  ← Text processing pipeline
      ↓
ConceptCandidateSchema.parse()  ← Validation again
      ↓
[Future: Routing & Artifact Creation]
      ↓  
FolderPath operations  ← Path validation & manipulation
      ↓
Repository.save()  ← Persistence with contract guarantees
```

### Validation Strategy

**Defense in Depth**: Multiple validation layers catch different types of errors:

1. **Schema Validation**: Catches data structure problems
2. **Domain Validation**: Catches business rule violations  
3. **Repository Validation**: Catches storage constraint violations

### Error Handling

**Structured Errors**: Clear error types with specific recovery strategies:
```typescript
NotFoundError     // Resource doesn't exist
ConflictError     // Resource already exists
IntegrityError    // Data consistency violation
```

## Key Design Decisions Explained

### 1. Why Zod Over Alternatives?

**Decision**: Use Zod for schema validation
**Alternatives Considered**: Joi, Yup, custom validation
**Why Zod**:
- Type inference reduces duplication
- Excellent error messages
- Composable schemas
- Active development and community

### 2. Why Value Objects for Paths?

**Decision**: FolderPath as immutable value object
**Alternatives Considered**: Plain strings, path utilities
**Why Value Objects**:
- Encapsulates validation logic
- Prevents invalid path construction
- Clear operations (parent, child, etc.)
- Type safety (can't accidentally use string where path expected)

### 3. Why Repository Pattern?

**Decision**: Abstract repository interfaces
**Alternatives Considered**: Direct database/file access
**Why Repository Pattern**:
- Testability with mock implementations
- Flexibility to change storage backends
- Clear separation of concerns
- Consistent error handling

### 4. Why Deterministic IDs?

**Decision**: Generate IDs from content hash + metadata
**Alternatives Considered**: UUIDs, auto-increment, timestamps
**Why Deterministic**:
- Enables deduplication (same content = same ID)
- Idempotent operations (can retry safely)
- Debugging (same input always produces same ID)
- Offline capability (no need for central ID generation)

### 5. Why Text Normalization Pipeline?

**Decision**: Multi-step text transformation pipeline
**Alternatives Considered**: Single normalization function
**Why Pipeline**:
- Each step has single responsibility
- Easy to add/remove/reorder steps
- Clear transformation sequence
- Testable individual components

## Testing Strategy

### Test Coverage by Component

- **ConceptCandidate**: 19 tests covering validation, normalization, ID generation
- **FolderPath**: 38 tests covering path operations, validation, relationships  
- **Schemas**: 18 tests covering validation rules and edge cases
- **Repository Contracts**: 37 tests covering all interface requirements
- **Integration**: 5 tests covering end-to-end data flow

### Testing Principles

1. **Test Behavior, Not Implementation**: Tests verify what the code does, not how
2. **Clear Test Names**: Each test describes a specific scenario
3. **Realistic Test Data**: Use meaningful examples that could occur in practice
4. **Edge Case Coverage**: Test boundaries, invalid inputs, error conditions

## Performance Considerations

### Current Performance Features

- **Caching**: Normalized text and content hashes are cached
- **Lazy Computation**: IDs computed only when needed
- **Efficient Validation**: Zod schemas compiled for performance
- **Minimal Dependencies**: Core domain logic has no external dependencies

### Future Optimizations

- **Batch Processing**: Process multiple candidates together
- **Incremental Validation**: Skip validation for trusted internal data
- **Memory Management**: Stream large batches instead of loading everything

## Security & Privacy

### Current Protections

- **Input Validation**: All external data validated before processing
- **Path Traversal Prevention**: FolderPath prevents ".." and absolute paths
- **No External Calls**: Sprint 1 code is completely local
- **Audit Trail**: All operations will be logged (when repositories implemented)

### Privacy by Design

- **Local Processing**: No data sent to external services
- **Minimal Data**: Only store what's needed for functionality
- **Clear Boundaries**: Validation at all data entry points

## What's Next: Sprint 2

Sprint 1 established the data foundation. Sprint 2 will implement:

1. **Storage Layer**: File system and database repositories
2. **Basic Pipeline**: Simple rule-based processing without AI
3. **Integration Bridge**: Connect to existing capture system

The foundation we built in Sprint 1 makes Sprint 2 implementation straightforward because:
- Clear interfaces define exactly what to build
- Contract tests verify implementations work correctly  
- Domain models handle all business logic
- Schemas ensure data integrity throughout

## Files Created/Modified

### New Files
- `src/core/contracts/schemas.ts` - All data schemas
- `src/core/contracts/repositories.ts` - Repository interfaces  
- `src/core/domain/ConceptCandidate.ts` - Core domain model
- `src/core/domain/FolderPath.ts` - Path value object
- `src/core/contracts/integration.test.ts` - End-to-end tests

### Test Files
- `src/core/domain/ConceptCandidate.test.ts` - 19 tests
- `src/core/domain/FolderPath.test.ts` - 38 tests  
- `src/core/contracts/schemas.test.ts` - 18 tests

### Removed Files
- Cleaned up Sprint 0 skeleton code (empty directories, unused interfaces)
- Removed demo/example files not needed in production

**Total**: 117 passing tests, 5 schemas, 2 domain models, 3 repository interfaces

This foundation enables rapid, test-driven implementation of Sprint 2 storage and pipeline services.

## Infrastructure & Configuration

### Docker Compose Setup (`docker-compose.yml`)

**What it provides**: Development environment with required external services.

#### Qdrant Vector Database
```yaml
qdrant:
  image: qdrant/qdrant:v1.7.4
  ports:
    - "6333:6333"  # REST API
    - "6334:6334"  # gRPC API
```

**Purpose**: 
- **Vector Storage**: Stores embeddings for semantic search
- **Similarity Search**: Finds similar concepts and folders
- **Future Use**: Sprint 4+ will use for intelligent routing

**Configuration**:
- **Development Optimized**: Smaller segments, CORS enabled
- **Health Checks**: Ensures service is ready before app starts
- **Persistent Storage**: Data survives container restarts

#### Redis Cache (Optional)
```yaml
redis:
  image: redis:7.2-alpine
  command: >
    redis-server 
    --appendonly yes 
    --maxmemory 256mb
    --maxmemory-policy allkeys-lru
```

**Purpose**:
- **Caching**: Frequently accessed data (embeddings, routing decisions)
- **Session Storage**: User review sessions
- **Performance**: Reduces database/computation load

**Configuration**:
- **Persistent**: Append-only file survives restarts
- **Memory Limited**: 256MB max to prevent runaway usage
- **LRU Eviction**: Removes least-recently-used data when full

#### Volume Strategy
```yaml
volumes:
  qdrant_data:
    driver_opts:
      type: none
      o: bind
      device: ./data/qdrant
```

**Why Bind Mounts**: 
- **Easy Access**: Can inspect data files directly
- **Backup**: Simple to backup ./data directory
- **Development**: Can reset data by deleting folder

### Environment Configuration (`.env`)

**Configuration Philosophy**: 
- **Default to Local**: No external API calls by default
- **Feature Flags**: Gradual rollout of new features
- **Performance Tuning**: Configurable thresholds for different use cases

#### Core Processing Settings
```env
# Text Quality Thresholds
MIN_TEXT_LENGTH=10          # Reject very short snippets
MIN_WORD_COUNT=3           # Needs multiple words to be meaningful
MIN_QUALITY_SCORE=0.3      # From ConceptCandidate quality algorithm

# Routing Confidence Levels  
HIGH_CONFIDENCE_THRESHOLD=0.82  # Auto-place without review
LOW_CONFIDENCE_THRESHOLD=0.65   # Send to Unsorted if below
```

**Why These Values**:
- **MIN_TEXT_LENGTH=10**: Prevents single words or fragments
- **MIN_QUALITY_SCORE=0.3**: Balanced to catch repetitive text while allowing valid content
- **ROUTING_THRESHOLDS**: Based on typical confidence distributions in semantic search

#### Feature Flags Strategy
```env
# Current Sprint 1 State
LOCAL_ONLY_MODE=true           # No external API calls
ENABLE_LLM=false              # No AI features yet
BRIDGE_BATCHER_TO_CORE=true   # Connect to existing system
USE_CORE_ROUTER=false         # Still using legacy routing
```

**Migration Strategy**:
1. **Sprint 1**: LOCAL_ONLY=true, everything disabled
2. **Sprint 2**: Enable basic features, still local-only
3. **Sprint 4**: Enable LLM features with careful rollout
4. **Sprint 6**: Full feature set enabled

#### Database Configuration
```env
# SQLite for Metadata
SQLITE_DB_PATH=./data/sqlite/concept-organizer.db

# Vector Search
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_CONCEPTS=concept-artifacts
QDRANT_COLLECTION_FOLDERS=folder-centroids
```

**Storage Strategy**:
- **SQLite**: Simple, reliable, good for development
- **File System**: Artifacts stored as JSON files for easy inspection
- **Qdrant**: Vector search when semantic features enabled

#### Integration with Existing System
```env
# Bridge Configuration
BRIDGE_BATCHER_TO_CORE=true   # Send batches to new pipeline
USE_CORE_ROUTER=false         # Keep using existing classification

# Polling Settings (from existing system)
WINDOW_POLL_MS=1000           # Window change detection
STUDYING_OCR_POLL_MS=30000    # OCR capture frequency
```

**Integration Approach**:
- **Gradual Migration**: Feature flags control which parts use new system
- **Parallel Processing**: Can run old and new systems side-by-side
- **Safe Rollback**: Can disable new features if issues occur

### Development Workflow

#### Starting the Environment
```bash
# Start infrastructure
docker-compose up -d

# Verify services are healthy
docker-compose ps
curl http://localhost:6333/health  # Qdrant health check

# Start the application
npm run dev
```

#### Data Inspection
```bash
# View Qdrant collections
curl http://localhost:6333/collections

# Check Redis cache
docker exec -it concept-organizer-redis redis-cli info memory

# Inspect file storage
ls -la ./data/knowledge-base/
```

#### Configuration Changes
```bash
# Modify .env file
echo "ENABLE_LLM=true" >> .env

# Restart to pick up changes
npm run dev
```

### Why This Configuration Design?

#### 1. **Development-First**
- Easy to set up (docker-compose up)
- Clear error messages when services unavailable
- All data stored locally for inspection

#### 2. **Production-Ready Foundation**
- Health checks for reliability
- Proper volume management
- Environment-based configuration

#### 3. **Gradual Complexity**
- Start simple (local-only, no AI)
- Add features incrementally with flags
- Can disable features if problems occur

#### 4. **Observability**
- Structured logging configuration
- Health check endpoints
- Clear service boundaries

This infrastructure setup supports the entire development process from Sprint 1 through production deployment, scaling complexity gradually as features are added.