# Multi-Folder Implementation Plan

## Executive Summary

Based on codebase analysis, the system is already **70% ready** for multi-folder support. The schema supports it, and some logic exists. We need to complete the implementation using the **Hybrid Threshold + LLM approach** for optimal robustness.

## Current State Analysis

### Already Supports Multi-Folder
- `ConceptArtifact.routing.placements[]` - supports primary/secondary
- `RoutingDecisionMaker.determinePlacements()` - logic exists
- `crossLinks` extraction from placements

### 🚧 Needs Updates
- `RoutingDecision` interface - add placements array
- `QdrantVectorIndexManager` - store multiple folder_ids
- `FolderMatchingService` - score ALL folders, not just top K
- `RoutingPipeline` - handle multi-folder decisions

## Implementation Strategy

### Phase 1: Data Model Updates (2-3 hours)

#### 1.1 Update RoutingDecision Interface
```typescript
// src/core/services/ISmartRouter.ts
export interface RoutingDecision {
  action: 'route' | 'unsorted' | 'duplicate' | 'create_folder' | 'review';
  
  // Keep for backward compatibility
  folderId?: string; // Primary folder
  
  // NEW: Full placement information
  placements?: PlacementDecision[];
  
  // Existing fields
  duplicateId?: string;
  suggestedFolderName?: string;
  confidence: number;
  explanation: RoutingExplanation;
  timestamp: Date;
}

export interface PlacementDecision {
  folderId: string;
  folderPath: string;
  confidence: number;
  type: 'primary' | 'reference';
  similarity: number;
  reason?: string;
}
```

#### 1.2 Update Vector Storage Payload
```typescript
// src/core/services/impl/QdrantVectorIndexManager.ts
private createPayload(
  conceptId: string, 
  embeddings: VectorEmbeddings, 
  placements?: PlacementDecision[]
): Record<string, unknown> {
  const primary = placements?.find(p => p.type === 'primary');
  const references = placements?.filter(p => p.type === 'reference') || [];
  
  return {
    concept_id: conceptId,
    
    // Primary folder (backward compatible)
    folder_id: primary?.folderId || null,
    
    // NEW: Multiple folder support
    primary_folder: primary?.folderId || null,
    reference_folders: references.map(r => r.folderId),
    placement_confidences: Object.fromEntries(
      placements?.map(p => [p.folderId, p.confidence]) || []
    ),
    
    // Existing fields
    content_hash: embeddings.contentHash,
    model: embeddings.model,
    embedded_at: embeddings.embeddedAt?.toISOString()
  };
}
```

### Phase 2: Core Routing Logic (4-6 hours)

#### 2.1 Enhanced FolderMatchingService
```typescript
// src/core/services/impl/FolderMatchingService.ts
export class FolderMatchingService {
  // NEW: Score ALL folders for threshold-based routing
  async scoreAllFolders(embeddings: VectorEmbeddings): Promise<FolderScore[]> {
    // Get all unique folders from existing concepts
    const allFolders = await this.getAllUniqueFolders();
    
    // Score each folder based on its centroid or members
    const scores: FolderScore[] = [];
    
    for (const folder of allFolders) {
      const score = await this.scoreFolderSimilarity(embeddings, folder);
      scores.push(score);
    }
    
    return scores.sort((a, b) => b.similarity - a.similarity);
  }
  
  private async getAllUniqueFolders(): Promise<string[]> {
    // Query vector DB for all unique folder_ids
    const concepts = await this.vectorIndex.getAllConcepts();
    const folders = new Set<string>();
    
    concepts.forEach(c => {
      if (c.payload.folder_id) {
        folders.add(c.payload.folder_id);
      }
    });
    
    return Array.from(folders);
  }
  
  private async scoreFolderSimilarity(
    embeddings: VectorEmbeddings,
    folderId: string
  ): Promise<FolderScore> {
    // Get folder centroid or calculate from members
    const members = await this.vectorIndex.getFolderMembers(folderId, 100);
    
    if (members.length === 0) {
      return { folderId, similarity: 0, conceptCount: 0 };
    }
    
    // Calculate centroid
    const centroid = VectorMathOperations.computeCentroid(
      members.map(m => m.vector)
    );
    
    // Calculate similarity
    const similarity = VectorMathOperations.cosineSimilarity(
      embeddings.vector,
      centroid
    );
    
    return {
      folderId,
      similarity,
      conceptCount: members.length,
      averageSimilarity: similarity,
      maximumSimilarity: Math.max(...members.map(m => 
        VectorMathOperations.cosineSimilarity(embeddings.vector, m.vector)
      ))
    };
  }
}
```

#### 2.2 Enhanced RoutingDecisionMaker with Thresholds
```typescript
// src/core/services/impl/RoutingDecisionMaker.ts
export class RoutingDecisionMaker {
  private readonly thresholds = {
    // Primary placement
    primaryMinimum: 0.5,        // Below this, create new folder
    primaryHighConfidence: 0.85, // Above this, auto-route
    
    // Reference placement
    referenceThreshold: 0.65,   // Minimum for reference
    referenceAutoApply: 0.75,   // Auto-apply without review
    maxReferences: 10,           // Limit reference explosion
    
    // Decision gaps
    clearWinnerGap: 0.15,        // Clear primary winner
    ambiguousGap: 0.05,          // Too close to call
  };
  
  async makeMultiFolderDecision(
    allFolderScores: FolderScore[],
    embeddings: VectorEmbeddings,
    distilled: DistilledContent
  ): Promise<RoutingDecision> {
    const sorted = allFolderScores.sort((a, b) => b.similarity - a.similarity);
    
    // No good matches - need new folder
    if (sorted.length === 0 || sorted[0].similarity < this.thresholds.primaryMinimum) {
      return this.createNewFolderDecision(distilled);
    }
    
    // Determine primary folder (highest score)
    const primary = sorted[0];
    
    // Find reference folders (above threshold, excluding primary)
    const references = sorted.slice(1)
      .filter(s => s.similarity >= this.thresholds.referenceThreshold)
      .slice(0, this.thresholds.maxReferences);
    
    // Check if LLM validation needed
    const needsLLMValidation = this.shouldUseLLM(primary, sorted[1]);
    
    if (needsLLMValidation) {
      // Use LLM for edge cases
      return await this.getLLMValidatedDecision(primary, references, distilled);
    }
    
    // Create placements
    const placements: PlacementDecision[] = [
      {
        folderId: primary.folderId,
        folderPath: primary.folderId, // TODO: Get actual path
        confidence: primary.similarity,
        type: 'primary',
        similarity: primary.similarity
      },
      ...references.map(ref => ({
        folderId: ref.folderId,
        folderPath: ref.folderId,
        confidence: ref.similarity,
        type: 'reference' as const,
        similarity: ref.similarity
      }))
    ];
    
    return {
      action: 'route' as const,
      folderId: primary.folderId, // Backward compatibility
      placements,
      confidence: primary.similarity,
      explanation: this.buildMultiFolderExplanation(placements),
      timestamp: new Date()
    };
  }
  
  private shouldUseLLM(primary: FolderScore, second?: FolderScore): boolean {
    // Use LLM for ambiguous cases
    if (!second) return false;
    
    const gap = primary.similarity - second.similarity;
    return gap < this.thresholds.ambiguousGap;
  }
  
  private async getLLMValidatedDecision(
    primary: FolderScore,
    references: FolderScore[],
    distilled: DistilledContent
  ): Promise<RoutingDecision> {
    // TODO: Implement LLM validation for edge cases
    // For now, return threshold-based decision
    return this.createThresholdDecision(primary, references);
  }
}
```

### Phase 3: Pipeline Integration (3-4 hours)

#### 3.1 Update RoutingPipeline
```typescript
// src/core/services/impl/RoutingPipeline.ts
async execute(candidate: ConceptCandidate): Promise<PipelineResult> {
  const context = this.createPipelineContext(candidate);
  
  try {
    // DISTILL: Extract structured content
    context.distilled = await this.distillContent(candidate);
    
    // EMBED: Generate vector representation
    context.embeddings = await this.generateEmbeddings(context.distilled);
    
    // CHECK: Detect duplicates
    const duplicateCheck = await this.checkForDuplicates(context.embeddings);
    if (duplicateCheck.isDuplicate) {
      return this.createResult(duplicateCheck.decision!, context);
    }
    
    // NEW: Score ALL folders for multi-folder routing
    const allFolderScores = await this.folderMatcher.scoreAllFolders(context.embeddings);
    
    // NEW: Make multi-folder decision with thresholds
    const decision = await this.decisionMaker.makeMultiFolderDecision(
      allFolderScores,
      context.embeddings,
      context.distilled
    );
    
    return this.createResult(decision, context);
    
  } catch (error) {
    throw this.handlePipelineError(error, context);
  }
}
```

### Phase 4: Storage & Retrieval Updates (2-3 hours)

#### 4.1 Update Vector Search to Include References
```typescript
// src/core/services/impl/QdrantVectorIndexManager.ts
async searchByFolder(
  folderId: string,
  includeReferences: boolean = true
): Promise<SimilarConcept[]> {
  const filter = includeReferences ? {
    should: [
      { key: 'primary_folder', match: { value: folderId } },
      { key: 'reference_folders', match: { any: [folderId] } }
    ]
  } : {
    must: [
      { key: 'primary_folder', match: { value: folderId } }
    ]
  };
  
  const result = await this.client.search(this.collections.concepts, {
    filter,
    limit: 1000,
    with_payload: true
  });
  
  return result.map(hit => ({
    conceptId: hit.id as string,
    similarity: hit.score,
    folderId: hit.payload?.primary_folder as string,
    isPrimary: hit.payload?.primary_folder === folderId,
    metadata: hit.payload
  }));
}
```

### Phase 5: Testing & Migration (4-6 hours)

#### 5.1 Create Test Suite
```typescript
// src/core/services/impl/__tests__/MultiFolderRouting.test.ts
describe('Multi-Folder Routing', () => {
  it('should place concept in primary and reference folders based on threshold', async () => {
    // Test threshold-based routing
  });
  
  it('should limit references to maxReferences config', async () => {
    // Test reference limiting
  });
  
  it('should use LLM for ambiguous cases', async () => {
    // Test LLM validation
  });
  
  it('should handle backward compatibility', async () => {
    // Test single folderId still works
  });
});
```

#### 5.2 Migration Script
```typescript
// scripts/migrate-to-multi-folder.ts
async function migrateExistingConcepts() {
  const concepts = await getAllConcepts();
  
  for (const concept of concepts) {
    // Re-embed if needed
    const embeddings = concept.embeddings || await embed(concept);
    
    // Score against all folders
    const scores = await scoreAllFolders(embeddings);
    
    // Apply threshold logic
    const primary = scores[0];
    const references = scores.slice(1)
      .filter(s => s.similarity >= 0.65)
      .slice(0, 10);
    
    // Update storage
    await updateConceptPlacements(concept.id, {
      primary: primary.folderId,
      references: references.map(r => r.folderId)
    });
  }
}
```

## Implementation Timeline

### Day 1: Foundation (8 hours)
- [ ] Update interfaces and types (2h)
- [ ] Modify QdrantVectorIndexManager payload (2h)
- [ ] Update FolderMatchingService with scoreAllFolders (4h)

### Day 2: Core Logic (8 hours)
- [ ] Enhance RoutingDecisionMaker with thresholds (3h)
- [ ] Update RoutingPipeline flow (2h)
- [ ] Implement backward compatibility (1h)
- [ ] Initial testing (2h)

### Day 3: Integration & Testing (8 hours)
- [ ] Create comprehensive test suite (3h)
- [ ] Run integration tests (2h)
- [ ] Create migration script (2h)
- [ ] Documentation updates (1h)

### Day 4: Production Readiness (8 hours)
- [ ] Performance optimization (3h)
- [ ] Load testing with 1000+ concepts (2h)
- [ ] UI updates to show primary/references (2h)
- [ ] Final review and deployment prep (1h)

## Configuration

```typescript
// .env
# Multi-folder thresholds
REFERENCE_THRESHOLD=0.65
PRIMARY_MIN_THRESHOLD=0.50
MAX_REFERENCES=10

# LLM usage
USE_LLM_VALIDATION=true
LLM_AMBIGUOUS_GAP=0.05

# Performance
SCORE_ALL_FOLDERS_BATCH_SIZE=100
CACHE_FOLDER_CENTROIDS=true
```

## Benefits

1. **Better Organization**: Concepts appear in all relevant folders
2. **Maintain Simplicity**: Clear primary location, references are secondary
3. **Performance**: Threshold-based is fast, LLM only for edge cases
4. **Backward Compatible**: Existing code still works
5. **Future-Proof**: Easy to adjust thresholds and add features

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation | High | Cache folder centroids, batch operations |
| Reference explosion | Medium | Limit to 10 references, adjustable threshold |
| User confusion | Medium | Clear UI distinction between primary/reference |
| Migration issues | Low | Comprehensive testing, rollback plan |

## Success Metrics

- [ ] 90%+ concepts have at least one reference folder
- [ ] <500ms routing decision time
- [ ] Zero data loss during migration
- [ ] User satisfaction with multi-folder organization

## Next Steps

1. Review this plan with team
2. Set up feature branch
3. Begin Phase 1 implementation
4. Daily progress updates

This implementation leverages the existing codebase structure and adds multi-folder support with minimal disruption while maintaining backward compatibility.
