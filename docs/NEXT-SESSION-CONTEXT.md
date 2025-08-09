# Next Session Context: Sprint 1 Ready to Start

## Session Objectives
You are about to implement **Sprint 1: Storage Layer & Basic Pipeline** for the Concept Organizer project. Sprint 0 foundation work is complete and all interfaces are ready for implementation.

## Current Project State

### ✅ COMPLETED (Sprint 0)
- **Architecture**: Complete service interface definitions (17 interfaces, 780 lines)
- **Domain Models**: Rich `ConceptCandidate` with business logic (484 lines)
- **Data Contracts**: Complete Zod schemas for all data structures (535 lines)
- **Error System**: Hierarchical error types with recovery strategies (659 lines)
- **Configuration**: Type-safe config system with environment validation (877 lines total)
- **DI Container**: Extended container ready for implementations (287 lines)
- **Dev Environment**: Docker Compose with Qdrant + Redis, automated setup

### 🎯 SPRINT 1 TARGETS
- **Primary Goal**: Implement storage layer and basic pipeline WITHOUT AI
- **Duration**: ~1 week
- **Approach**: TDD with failing tests first
- **Integration**: Bridge existing BatcherService to new core pipeline

## Critical Sprint 1 Components to Implement

### 1. Storage Layer (Priority 1)
**Files to create in `src/core/infrastructure/persistence/`:**

#### `FileSystemArtifactRepository.ts`
```typescript
// Implements: IConceptArtifactRepository
// Features needed:
// - Atomic file writes (temp → rename pattern)
// - Deterministic file paths from artifact IDs  
// - JSON serialization with optional Markdown
// - Idempotent saves (check exists before write)
// - Directory structure: KnowledgeBase/Domain/Subdomain/Topic/artifact-id.json
```

#### `SQLiteFolderRepository.ts` 
```typescript
// Implements: IFolderRepository
// Features needed:
// - Folder manifest storage and retrieval
// - Path-based and ID-based queries
// - Atomic renames with alias tracking
// - Provisional folder management
// - Parent-child relationship queries
```

#### `FileSystemAuditRepository.ts`
```typescript  
// Implements: IAuditRepository
// Features needed:
// - Append-only JSONL format
// - Daily log rotation
// - Never fail on append (critical for system reliability)
// - Query by time range, entity ID, event type
// - Log compression for old entries
```

### 2. Pipeline Components (Priority 2)
**Files to create in `src/core/services/pipeline/`:**

#### `SessionAssemblerService.ts`
```typescript
// Implements: ISessionAssembler  
// Features needed:
// - Convert Batch → ConceptCandidate[]
// - Text normalization using ConceptCandidate factory
// - Quality filtering with configured thresholds
// - Content stitching for adjacent snippets
// - Deterministic candidate ID generation
```

#### `SimpleRouterService.ts` (No AI)
```typescript
// Implements: IRouter
// Features needed:
// - Rule-based routing using keyword matching
// - Topic-based folder assignment (Programming → Programming/, Chemistry → Chemistry/)
// - Default to Unsorted/<topic> for unmatched content
// - Confidence scoring based on keyword matches
// - No vector similarity (that's Sprint 2)
```

#### `ArtifactBuilderService.ts`
```typescript
// Implements: IArtifactBuilder
// Features needed:
// - Convert enhanced candidate + routing → ConceptArtifact
// - Generate deterministic artifact IDs
// - Add provenance, audit info, timestamps
// - Model info tracking (for when AI is added later)
// - Version management
```

#### `PipelineOrchestratorService.ts` 
```typescript
// Implements: IPipelineOrchestrator
// Features needed:
// - Coordinate: assemble → route → build → store → audit
// - Error handling and recovery
// - Session manifest tracking
// - Batch processing with metrics
// - Integration with existing BatcherService
```

### 3. Supporting Services (Priority 3)
**Files to create in `src/core/services/maintenance/`:**

#### `SessionManifestService.ts`
```typescript
// Implements: ISessionManifestService
// Features needed:
// - Track processing sessions for audit/recovery
// - Record batch → candidate → artifact flow
// - Session start/end with summary stats
// - Recovery from incomplete sessions
```

## Integration Strategy with Existing Code

### Phase 1: Bridge Pattern
```typescript
// In existing Orchestrator.ts, add:
async processBatch(batch: Batch): Promise<void> {
  if (config.features.bridgeToCore) {
    // Route to new core pipeline
    const coreOrchestrator = container.resolve<IPipelineOrchestrator>('IPipelineOrchestrator');
    await coreOrchestrator.processBatch(batch);
  } else {
    // Keep existing flow
    // ... existing code
  }
}
```

### Phase 2: Feature Flag Migration
- Start with `BRIDGE_BATCHER_TO_CORE=false` (existing flow)
- Test core pipeline in isolation  
- Flip to `BRIDGE_BATCHER_TO_CORE=true` when ready
- Compare results between old and new systems

## TDD Implementation Order

### 1. Start with Tests
```bash
# Create test files first:
src/core/infrastructure/persistence/__tests__/
├── FileSystemArtifactRepository.test.ts
├── SQLiteFolderRepository.test.ts  
└── FileSystemAuditRepository.test.ts

src/core/services/pipeline/__tests__/
├── SessionAssemblerService.test.ts
├── SimpleRouterService.test.ts
├── ArtifactBuilderService.test.ts
└── PipelineOrchestratorService.test.ts
```

### 2. Test-First Implementation Pattern
```typescript
// ALWAYS start with failing test:
describe('FileSystemArtifactRepository', () => {
  it('should save artifact atomically', async () => {
    // Arrange: Create test artifact
    // Act: Call save()
    // Assert: File exists and contains expected content
    // Assert: No temp files left behind
  });
  
  it('should be idempotent on duplicate saves', async () => {
    // Test that saving same artifact twice is safe
  });
});

// THEN implement minimal code to make test pass
```

## Key Implementation Patterns

### 1. Atomic File Operations
```typescript
async atomicWrite(path: string, content: string): Promise<void> {
  const tempPath = `${path}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, content, { flag: 'wx' });
    await fs.rename(tempPath, path);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}
```

### 2. Deterministic IDs
```typescript
// Already implemented in ConceptCandidate.ts, use consistently:
const candidateId = generateDeterministicId(batchId, index, normalizedText);
const artifactId = generateDeterministicId(candidateId, finalPath);
```

### 3. Error Handling
```typescript
// Use error hierarchy from ConceptOrganizerErrors.ts:
try {
  await repository.save(artifact);
} catch (error) {
  if (error instanceof ConcurrentModificationError) {
    // Retry logic
  } else if (error instanceof FileSystemError) {
    // Fallback strategy  
  }
  throw error;
}
```

## Configuration Usage

### Access Configuration in Services
```typescript
import { getConfigSection } from '../config/ConfigService';

class FileSystemArtifactRepository {
  constructor() {
    this.config = getConfigSection('storage');
    this.basePath = this.config.knowledgeBasePath;
  }
}
```

### Feature Flag Checks
```typescript
import { getConfig } from '../config/ConfigService';

if (getConfig().features.enableDeduplication) {
  // Check for duplicates
}
```

## Testing Strategy

### Unit Tests (Isolated)
- Mock all dependencies using service interfaces
- Test business logic and edge cases
- Use `createTestContainer()` for DI

### Integration Tests (Real Dependencies)  
- Use Docker Compose services (Qdrant, Redis, SQLite)
- Test end-to-end pipeline with real data
- Use separate test database paths

### Property Tests (Data Integrity)
- Same input → same output (determinism)
- Idempotency: operation can be repeated safely
- Recovery: system handles partial failures

## Development Environment

### Services Already Running
```bash
# After running ./scripts/dev-setup.sh:
# - Qdrant: http://localhost:6333
# - Redis: redis://localhost:6379
# - SQLite: ./data/sqlite/concept-organizer.db
# - Collections: concept-artifacts, folder-centroids
```

### Container Access
```typescript
import { conceptOrganizerContainer } from '../core/container';

// Get services (will throw NotImplementedYet until Sprint 1)
const repository = conceptOrganizerContainer.resolve<IConceptArtifactRepository>('IConceptArtifactRepository');
```

## Success Criteria for Sprint 1

### Must Have ✅
- [ ] All storage repositories implemented with atomic operations
- [ ] Basic pipeline processes batches from assembly → storage  
- [ ] Session manifests track all processing for recovery
- [ ] Bridge to existing BatcherService working
- [ ] All operations are idempotent (can be repeated safely)

### Should Have ✅
- [ ] Simple router with keyword-based placement
- [ ] Audit logging captures all operations
- [ ] Error handling with recovery strategies
- [ ] Basic metrics (processing time, success rates)

### Nice to Have ✅
- [ ] Performance benchmarks for storage operations
- [ ] Development UI for inspecting artifacts
- [ ] Automated data integrity checks

## File Structure After Sprint 1

```
src/core/
├── infrastructure/persistence/
│   ├── FileSystemArtifactRepository.ts ✅
│   ├── SQLiteFolderRepository.ts ✅  
│   └── FileSystemAuditRepository.ts ✅
└── services/
    ├── pipeline/
    │   ├── SessionAssemblerService.ts ✅
    │   ├── SimpleRouterService.ts ✅
    │   ├── ArtifactBuilderService.ts ✅  
    │   └── PipelineOrchestratorService.ts ✅
    └── maintenance/
        └── SessionManifestService.ts ✅
```

---

**READY TO START SPRINT 1** 🚀  
**Current Date**: 2025-08-09  
**Session Type**: Implementation Sprint (TDD)  
**Duration**: ~1 week  
**Blocking Issues**: None

### First Steps:
1. Create test directory structure
2. Write failing tests for FileSystemArtifactRepository
3. Implement minimal passing code
4. Repeat TDD cycle for all components

### Key Reminders:
- Always write tests first (TDD)
- Use existing error types from ConceptOrganizerErrors.ts  
- Follow atomic operation patterns
- Check feature flags before enabling new functionality
- Update container.ts registrations as implementations are created