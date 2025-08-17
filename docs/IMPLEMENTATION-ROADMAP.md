# Concept Organizer Implementation Roadmap

## Overview
This roadmap breaks down the Concept Organizer into 10 focused sprints, each delivering production-ready, tested components. We follow TDD principles, build incrementally, and maintain working software at every stage.

## Guiding Principles
1. **Foundation Before Features**: Data models, schemas, and contracts first
2. **Test-Driven Development**: No production code without failing tests
3. **Incremental Delivery**: Each sprint produces working, deployable software
4. **Production Quality**: Observability, error handling, and security from day one
5. **Risk Mitigation**: Technical challenges addressed early
6. **Clear Boundaries**: Well-defined interfaces between components

---

## Sprint 0: Project Setup & Foundation (3 days)
**Goal**: Establish project structure, tooling, and development environment

### Tasks
1. **Repository Structure**
   ```
   src/
     core/
       domain/           # Domain models and types
       contracts/        # Data contracts and schemas
       errors/          # Custom error types
     services/
       pipeline/        # Core pipeline services
       storage/         # Storage abstractions
       indexing/        # Vector/search services
     infrastructure/
       persistence/     # File system, DB implementations
       vectors/         # Vector store implementations
       queues/         # Job queue implementations
     api/
       routes/         # API endpoints
       middleware/     # Auth, validation, etc.
   ```

2. **Dependency Injection Setup**
   - Extend existing container.ts
   - Define service interfaces
   - Configure test containers

3. **Configuration Management**
   - Environment-based configs
   - Feature flags system
   - Threshold configurations

4. **Development Tools**
   - ESLint & Prettier setup
   - Husky pre-commit hooks
   - GitHub Actions CI/CD
   - Docker compose for dependencies

### Deliverables
- [ ] Project structure created
- [ ] DI container configured
- [ ] CI/CD pipeline running
- [ ] Development environment documented

---

## Sprint 1: Data Models & Core Contracts (1 week)
**Goal**: Define all data structures, schemas, and domain models with full validation

### Tasks
1. **Schema Definitions (Zod)**
   ```typescript
   // Core domain schemas
   const BatchSchema = z.object({
     batchId: z.string().uuid(),
     window: z.string().min(1),
     topic: z.string().min(1),
     entries: z.array(EntrySchema),
     sessionMarkers: SessionMarkerSchema.optional(),
     createdAt: z.date(),
   });

   const ConceptCandidateSchema = z.object({
     candidateId: z.string(), // deterministic
     batchId: z.string().uuid(),
     rawText: z.string().min(1),
     normalizedText: z.string().min(1),
     source: SourceInfoSchema,
     contentHash: z.string(),
     metadata: z.record(z.unknown()).optional(),
   });

   const ConceptArtifactSchema = z.object({
     artifactId: z.string(), // deterministic
     candidateId: z.string(),
     title: z.string().min(1).max(100),
     summary: z.string().min(50).max(500),
     content: ContentSchema,
     routing: RoutingInfoSchema,
     provenance: ProvenanceSchema,
     modelInfo: ModelInfoSchema,
     audit: AuditInfoSchema,
     version: z.string(),
   });

   const FolderManifestSchema = z.object({
     folderId: z.string(), // stable ID
     path: z.string(),
     name: z.string(),
     description: z.string().optional(),
     depth: z.number().int().min(0).max(4),
     provisional: z.boolean(),
     stats: FolderStatsSchema,
     centroid: VectorSchema.optional(),
     createdAt: z.date(),
     updatedAt: z.date(),
   });
   ```

2. **Domain Models**
   ```typescript
   class ConceptCandidate {
     constructor(
       private readonly batch: Batch,
       private readonly text: string,
       private readonly index: number
     ) {}

     get id(): string {
       return this.computeDeterministicId();
     }

     normalize(): NormalizedCandidate {
       // Text normalization logic
     }

     private computeDeterministicId(): string {
       // Hash of (batchId, index, normalizedText)
     }
   }
   ```

3. **Value Objects**
   ```typescript
   class FolderPath {
     constructor(private readonly segments: string[]) {
       this.validate();
     }

     get depth(): number {
       return this.segments.length;
     }

     get parent(): FolderPath | null {
       // Return parent path
     }

     toString(): string {
       return this.segments.join('/');
     }

     private validate(): void {
       // Max depth, naming rules
     }
   }
   ```

4. **Repository Interfaces**
   ```typescript
   interface IConceptArtifactRepository {
     save(artifact: ConceptArtifact): Promise<void>;
     findById(id: string): Promise<ConceptArtifact | null>;
     findByPath(path: FolderPath): Promise<ConceptArtifact[]>;
     exists(id: string): Promise<boolean>;
   }

   interface IFolderRepository {
     create(path: FolderPath, manifest: FolderManifest): Promise<void>;
     findByPath(path: FolderPath): Promise<FolderManifest | null>;
     updateManifest(path: FolderPath, updates: Partial<FolderManifest>): Promise<void>;
     listChildren(path: FolderPath): Promise<FolderManifest[]>;
   }
   ```

### Tests Required
- [ ] Schema validation tests (100% of validation rules)
- [ ] Domain model behavior tests
- [ ] Value object invariant tests
- [ ] Repository interface contract tests

### Deliverables
- [ ] All schemas defined and exported
- [ ] Domain models with business logic
- [ ] Repository interfaces defined
- [ ] 100% test coverage on models

---

## Sprint 2: AI-Powered Intelligent Routing (2 weeks)
**Goal**: Implement the corrected DISTILL → EMBED → ROUTE pipeline with dependency inversion for swappable AI services

### Architecture Overview - Corrected Pipeline
This sprint implements the intelligent pipeline from the CONCEPT-ORGANIZER-PLAN:

```
ConceptCandidate → DISTILL (LLM) → EMBED (title+summary) → ROUTE (vector search)
```

**Core Components with Dependency Inversion:**
- **IDistillationService**: Swappable LLM implementations (OpenAI, Local, NoOp)
- **IEmbeddingService**: Swappable vector implementations (Transformers.js, OpenAI, Local)
- **IVectorIndexManager**: Qdrant integration with cosine similarity search
- **ISmartRouter**: Hybrid scoring with confidence thresholds and LLM arbitration
- **IFolderManager**: Automatic folder creation with provisional status

### Tasks

#### 1. **DistillationService Implementation (NEW - was missing!)**
```typescript
// Dependency inversion interface
interface IDistillationService {
  distill(candidate: ConceptCandidate): Promise<DistilledContent>;
  isEnabled(): boolean;
}

interface DistilledContent {
  title: string;
  summary: string;
  contentHash: string;  // For caching
}

// OpenAI implementation for API-based distillation
class OpenAIDistillationService implements IDistillationService {
  constructor(
    private readonly apiKey: string,
    private readonly cache: IContentCache
  ) {}
  
  async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    // Check cache first
    const cached = await this.cache.get(candidate.contentHash);
    if (cached) return cached;
    
    // Call OpenAI with tiny prompt
    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system", 
        content: "Extract a concise title (max 100 chars) and 2-5 sentence summary from this text. Return as JSON."
      }, {
        role: "user",
        content: candidate.normalizedText
      }],
      response_format: { type: "json_object" },
      max_tokens: 200
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    const distilled = {
      title: result.title,
      summary: result.summary,
      contentHash: candidate.contentHash
    };
    
    // Cache result
    await this.cache.set(candidate.contentHash, distilled);
    return distilled;
  }
  
  isEnabled(): boolean {
    return true;
  }
}

// No-op implementation for LLM-OFF mode
class NoOpDistillationService implements IDistillationService {
  async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    // Fallback: extract title from first sentence, use full text as summary
    const sentences = candidate.normalizedText.split(/[.!?]+/);
    const title = sentences[0]?.substring(0, 100) || "Concept";
    
    return {
      title: title.trim(),
      summary: candidate.normalizedText.substring(0, 500),
      contentHash: candidate.contentHash
    };
  }
  
  isEnabled(): boolean {
    return false;
  }
}
```

#### 2. **EmbeddingService Implementation (Corrected Input)**
```typescript
// Dependency inversion interface
interface IEmbeddingService {
  generateTitleVector(title: string): Promise<Float32Array>;      // Fast dedup
  generateContextVector(titleAndSummary: string): Promise<Float32Array>; // Routing
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// Local implementation using Transformers.js
class TransformersEmbeddingService implements IEmbeddingService {
  private pipeline: any;
  
  async initialize(): Promise<void> {
    const { pipeline } = await import('@xenova/transformers');
    this.pipeline = await pipeline('feature-extraction', 'all-MiniLM-L6-v2');
  }
  
  async generateTitleVector(title: string): Promise<Float32Array> {
    const output = await this.pipeline(title, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }
  
  async generateContextVector(titleAndSummary: string): Promise<Float32Array> {
    const output = await this.pipeline(titleAndSummary, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const outputs = await this.pipeline(texts, { pooling: 'mean', normalize: true });
    return outputs.map(output => new Float32Array(output.data));
  }
}

// OpenAI implementation for API-based embeddings
class OpenAIEmbeddingService implements IEmbeddingService {
  constructor(private readonly apiKey: string) {}
  
  async generateTitleVector(title: string): Promise<Float32Array> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: title
    });
    return new Float32Array(response.data[0].embedding);
  }
  
  async generateContextVector(titleAndSummary: string): Promise<Float32Array> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small", 
      input: titleAndSummary
    });
    return new Float32Array(response.data[0].embedding);
  }
}
```

#### 2. **Qdrant Vector Index Integration**
```typescript
class QdrantVectorIndexManager {
  private client: QdrantClient;
  
  async initializeCollections(): Promise<void> {
    // Create concept-artifacts collection (768-dim)
    await this.client.createCollection('concept-artifacts', {
      vectors: { size: 768, distance: 'Cosine' }
    });
    
    // Create folder-centroids collection (768-dim)  
    await this.client.createCollection('folder-centroids', {
      vectors: { size: 768, distance: 'Cosine' }
    });
  }
  
  async addConcept(artifact: ConceptArtifact, embedding: Float32Array): Promise<void> {
    await this.client.upsert('concept-artifacts', {
      points: [{
        id: artifact.artifactId,
        vector: Array.from(embedding),
        payload: {
          path: artifact.routing.path,
          title: artifact.title,
          createdAt: artifact.audit.createdAt,
          contentHash: this.computeHash(artifact.content.normalized)
        }
      }]
    });
  }
  
  async searchSimilarFolders(
    queryEmbedding: Float32Array,
    limit: number = 10
  ): Promise<FolderMatch[]> {
    const results = await this.client.search('folder-centroids', {
      vector: Array.from(queryEmbedding),
      limit,
      with_payload: true
    });
    
    return results.map(r => ({
      path: r.payload.path,
      score: r.score,
      centroid: new Float32Array(r.vector),
      stats: r.payload.stats
    }));
  }
}
```

#### 3. **Smart Router with Corrected Pipeline (DISTILL → EMBED → ROUTE)**
```typescript
interface ISmartRouter {
  route(candidate: ConceptCandidate): Promise<RoutingDecision>;
}

class SmartRouter implements ISmartRouter {
  constructor(
    private readonly distillationService: IDistillationService,
    private readonly embeddingService: IEmbeddingService,
    private readonly vectorIndex: IVectorIndexManager,
    private readonly llmService: ILLMService,
    private readonly thresholds: RoutingThresholds
  ) {}
  
  async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
    // 1. DISTILL: Get title + summary from LLM (or fallback)
    const distilled = await this.distillationService.distill(candidate);
    
    // 2. EMBED: Generate vectors from enriched content
    const titleVector = await this.embeddingService.generateTitleVector(distilled.title);
    const contextVector = await this.embeddingService.generateContextVector(
      `${distilled.title} ${distilled.summary}`
    );
    
    // 3. ROUTE: Find similar folders using context vector
    const folderMatches = await this.vectorIndex.searchSimilarFolders(contextVector, 10);
    
    // 4. Score placement options with hybrid algorithm
    const placementScores = await this.computePlacementScores(
      distilled, 
      folderMatches, 
      contextVector
    );
    
    // 5. Make routing decision based on confidence thresholds
    return this.makeRoutingDecision(placementScores, candidate, distilled);
  }
  
  private async computePlacementScores(
    candidate: ConceptCandidate,
    folders: FolderMatch[],
    embedding: Float32Array
  ): Promise<PlacementScore[]> {
    return folders.map(folder => {
      // Hybrid scoring: centroid + exemplar + lexical + penalties
      const centroidSim = this.cosineSimilarity(embedding, folder.centroid);
      const exemplarSim = this.computeExemplarSimilarity(candidate, folder);
      const lexicalSim = this.computeLexicalOverlap(candidate, folder);
      const depthPenalty = Math.pow(0.95, folder.path.split('/').length);
      
      const score = (centroidSim * 0.5) + (exemplarSim * 0.3) + (lexicalSim * 0.2) * depthPenalty;
      
      return { folder, score, centroidSim, exemplarSim, lexicalSim };
    }).sort((a, b) => b.score - a.score);
  }
  
  private async makeRoutingDecision(
    scores: PlacementScore[],
    candidate: ConceptCandidate
  ): Promise<RoutingDecision> {
    const topScore = scores[0];
    const runnerUpScore = scores[1];
    
    // High confidence: clear winner
    if (topScore.score >= this.thresholds.HIGH_CONFIDENCE) {
      return {
        path: topScore.folder.path,
        confidence: topScore.score,
        method: 'embedding-centroid',
        alternatives: this.buildAlternatives(scores.slice(1, 4))
      };
    }
    
    // Low confidence: send to Unsorted
    if (topScore.score <= this.thresholds.LOW_CONFIDENCE) {
      return {
        path: `Unsorted/${candidate.source.topic}`,
        confidence: topScore.score,
        method: 'unsorted-fallback',
        alternatives: this.buildAlternatives(scores.slice(0, 3))
      };
    }
    
    // Ambiguous: use LLM arbitration
    return this.llmArbitration(candidate, scores.slice(0, 5));
  }
}
```

#### 4. **Intelligent Folder Manager**
```typescript
class FolderManager {
  constructor(
    private readonly folderRepo: IFolderRepository,
    private readonly vectorIndex: QdrantVectorIndexManager
  ) {}
  
  async ensureFolderExists(path: FolderPath): Promise<FolderManifest> {
    let manifest = await this.folderRepo.findByPath(path);
    
    if (!manifest) {
      // Create new folder with provisional status
      manifest = {
        folderId: this.generateFolderId(path),
        path: path.toString(),
        name: path.leaf,
        provisional: true, // Will be renamed by background job
        depth: path.depth,
        stats: { artifactCount: 0, lastUpdated: new Date(), size: 0 },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await this.folderRepo.create(path, manifest);
    }
    
    return manifest;
  }
  
  async updateFolderCentroid(path: FolderPath, newArtifact: ConceptArtifact): Promise<void> {
    // Get all artifacts in folder
    const artifacts = await this.artifactRepo.findByPath(path);
    
    // Compute new centroid from all embeddings
    const embeddings = await Promise.all(
      artifacts.map(a => this.embeddingService.generateContextVector(a.content.normalized))
    );
    
    const centroid = this.computeCentroid(embeddings);
    
    // Update vector index
    await this.vectorIndex.updateFolderCentroid(path, centroid, {
      artifactCount: artifacts.length,
      avgConfidence: this.computeAverageConfidence(artifacts),
      lastUpdated: new Date()
    });
  }
}
```

#### 5. **Content Deduplication & Cross-Links**
```typescript
class DeduplicationService {
  async checkForDuplicates(
    candidate: ConceptCandidate,
    embedding: Float32Array
  ): Promise<DeduplicationResult> {
    // 1. Fast exact match check using content hash
    const exactMatch = await this.artifactRepo.findByContentHash(
      candidate.contentHash
    );
    if (exactMatch.length > 0) {
      return { isDuplicate: true, type: 'exact', existing: exactMatch[0] };
    }
    
    // 2. Semantic similarity check using title vector
    const titleEmbedding = await this.embeddingService.generateTitleVector(
      candidate.titleHint || candidate.normalizedText.substring(0, 100)
    );
    
    const similar = await this.vectorIndex.searchSimilarConcepts(
      titleEmbedding, 
      5,
      0.95 // High threshold for near-duplicates
    );
    
    if (similar.length > 0) {
      return { 
        isDuplicate: true, 
        type: 'semantic', 
        existing: similar[0],
        similarity: similar[0].score 
      };
    }
    
    return { isDuplicate: false };
  }
  
  async generateCrossLinks(
    artifact: ConceptArtifact,
    routingScores: PlacementScore[]
  ): Promise<CrossLink[]> {
    const crossLinks: CrossLink[] = [];
    const primaryScore = routingScores[0].score;
    
    // Add cross-links for strong runner-ups
    for (let i = 1; i < routingScores.length; i++) {
      const score = routingScores[i];
      const delta = primaryScore - score.score;
      
      if (delta <= this.thresholds.CROSS_LINK_DELTA && 
          score.score >= this.thresholds.CROSS_LINK_MIN_ABSOLUTE) {
        crossLinks.push({
          targetPath: score.folder.path,
          score: score.score,
          reason: 'strong-alternative-placement'
        });
      }
    }
    
    return crossLinks;
  }
}
```

### Tests Required
- [ ] **EmbeddingService**: Vector generation, batch processing, local model loading
- [ ] **VectorIndexManager**: CRUD operations, centroid updates, search accuracy
- [ ] **SmartRouter**: Placement scoring, threshold logic, LLM arbitration
- [ ] **FolderManager**: Automatic folder creation, centroid computation
- [ ] **Deduplication**: Exact/semantic duplicate detection, cross-link generation
- [ ] **Integration**: End-to-end intelligent pipeline flow

### Deliverables
- [ ] Local embedding generation using Transformers.js
- [ ] Qdrant vector search for folder matching
- [ ] Intelligent routing with 70%+ high-confidence placements
- [ ] Automatic folder structure creation and maintenance
- [ ] Content deduplication with cross-linking
- [ ] LLM arbitration for ambiguous cases

---

## Sprint 3: LLM Enhancement & Summarization (1 week)
**Goal**: Add LLM-powered summarization, arbitration, and concept extraction

### Tasks
1. **LLM Service Abstraction**
   ```typescript
   interface ILLMService {
     generateSummary(text: string): Promise<Summary>;
     arbitrateRouting(
       candidate: ConceptCandidate,
       topFolders: ScoredFolder[]
     ): Promise<RoutingArbitration>;
     extractConcepts(text: string): Promise<ExtractedConcepts>;
   }

   class LLMService implements ILLMService {
     private readonly providers: Map<string, ILLMProvider>;
     private readonly rateLimiter: IRateLimiter;
     private readonly cache: ICache;
     
     async generateSummary(text: string): Promise<Summary> {
       // Check cache first
       const cached = await this.cache.get(hash(text));
       if (cached) return cached;
       
       // Check rate limits
       await this.rateLimiter.acquire();
       
       // Generate with retry logic
       const prompt = this.buildSummaryPrompt(text);
       const response = await this.callWithRetry(prompt);
       
       // Parse and validate
       const summary = this.parseSummaryResponse(response);
       
       // Cache result
       await this.cache.set(hash(text), summary);
       
       return summary;
     }
   }
   ```

2. **Enhanced Concept Extractor**
   ```typescript
   class EnhancedConceptExtractor {
     async extract(
       candidate: ConceptCandidate
     ): Promise<EnhancedCanceptCandidate> {
       // Generate title if missing
       if (!candidate.title) {
         const extraction = await this.llm.extractConcepts(
           candidate.normalizedText
         );
         candidate.title = extraction.title;
         candidate.keyTerms = extraction.keyTerms;
       }
       
       // Generate summary
       const summary = await this.llm.generateSummary(
         candidate.normalizedText
       );
       
       return {
         ...candidate,
         summary: summary.text,
         quizSeeds: summary.quizSeeds
       };
     }
   }
   ```

3. **Routing Arbitrator**
   ```typescript
   class RoutingArbitrator {
     async arbitrate(
       candidate: ConceptCandidate,
       routingScores: PlacementScore[]
     ): Promise<RoutingDecision> {
       // Check if arbitration needed
       const topScore = routingScores[0];
       if (topScore.score >= this.thresholds.highConfidence) {
         return { path: topScore.folder.path, confidence: topScore.score };
       }
       
       if (topScore.score <= this.thresholds.lowConfidence) {
         return { path: 'Unsorted', confidence: topScore.score };
       }
       
       // LLM arbitration for ambiguous band
       const arbitration = await this.llm.arbitrateRouting(
         candidate,
         routingScores.slice(0, 5).map(s => s.folder)
       );
       
       return {
         path: arbitration.chosenPath,
         confidence: arbitration.confidence,
         rationale: arbitration.reasoning
       };
     }
   }
   ```

4. **Token Budget Manager**
   ```typescript
   class TokenBudgetManager {
     private dailyUsage: Map<string, number>;
     private readonly limits: TokenLimits;
     
     async canUse(
       operation: string,
       estimatedTokens: number
     ): Promise<boolean> {
       const today = this.getToday();
       const current = this.dailyUsage.get(today) || 0;
       
       return (current + estimatedTokens) <= this.limits.daily;
     }
     
     async recordUsage(
       operation: string,
       tokens: number
     ): Promise<void> {
       // Update usage
       // Log to audit
       // Alert if approaching limits
     }
   }
   ```

### Tests Required
- [ ] LLM prompt generation tests
- [ ] Response parsing tests
- [ ] Cache hit/miss tests
- [ ] Rate limiting tests
- [ ] Token budget tests
- [ ] Arbitration logic tests

### Deliverables
- [ ] Summaries generated for concepts
- [ ] LLM arbitration for ambiguous routing
- [ ] Token usage tracked and capped
- [ ] Caching reducing API calls

---

## Sprint 7: Background Jobs & Maintenance (1 week)
**Goal**: Implement rename, tidy, and maintenance operations

### Tasks
1. **Job Scheduler**
   ```typescript
   class JobScheduler {
     private readonly jobs: Map<string, ScheduledJob>;
     
     register(job: ScheduledJob): void {
       this.jobs.set(job.id, job);
       this.scheduleNext(job);
     }
     
     private scheduleNext(job: ScheduledJob): void {
       const delay = this.calculateDelay(job.schedule);
       setTimeout(async () => {
         await this.execute(job);
         this.scheduleNext(job);
       }, delay);
     }
   }
   ```

2. **Rename Job**
   ```typescript
   class RenameJob implements IJob {
     async execute(): Promise<void> {
       // 1. Find provisional folders
       const provisional = await this.folderRepo.findProvisional();
       
       for (const folder of provisional) {
         // 2. Collect member artifacts
         const artifacts = await this.artifactRepo.findByPath(folder.path);
         
         if (artifacts.length < this.config.minArtifactsForRename) {
           continue;
         }
         
         // 3. Generate rename proposal
         const proposal = await this.llm.proposeRename(
           folder,
           artifacts.slice(0, 10) // Sample
         );
         
         // 4. Apply rename
         await this.applyRename(folder, proposal);
       }
     }
     
     private async applyRename(
       folder: FolderManifest,
       proposal: RenameProposal
     ): Promise<void> {
       const oldPath = folder.path;
       const newPath = this.buildNewPath(oldPath, proposal.name);
       
       // Update folder
       await this.folderRepo.rename(oldPath, newPath);
       
       // Update artifacts
       await this.artifactRepo.updatePath(oldPath, newPath);
       
       // Add to alias map
       await this.aliasMap.add(oldPath, newPath);
       
       // Update indices
       await this.vectorIndex.updateFolderPath(oldPath, newPath);
       
       // Audit
       await this.audit.log({
         type: 'folder-rename',
         oldPath,
         newPath,
         reason: proposal.reasoning
       });
     }
   }
   ```

3. **Tidy Job**
   ```typescript
   class TidyJob implements IJob {
     async execute(): Promise<void> {
       // Find merge candidates
       const mergeCandidates = await this.findMergeCandidates();
       for (const [folder1, folder2] of mergeCandidates) {
         await this.mergeFolders(folder1, folder2);
       }
       
       // Find split candidates
       const splitCandidates = await this.findSplitCandidates();
       for (const folder of splitCandidates) {
         await this.splitFolder(folder);
       }
       
       // Reprocess unsorted
       await this.reprocessUnsorted();
     }
     
     private async findMergeCandidates(): Promise<[Folder, Folder][]> {
       // Find small folders with high similarity
       const smallFolders = await this.folderRepo.findSmall(
         this.config.smallFolderThreshold
       );
       
       const candidates: [Folder, Folder][] = [];
       for (let i = 0; i < smallFolders.length; i++) {
         for (let j = i + 1; j < smallFolders.length; j++) {
           const similarity = await this.computeSimilarity(
             smallFolders[i],
             smallFolders[j]
           );
           
           if (similarity > this.thresholds.mergeSimilarity) {
             candidates.push([smallFolders[i], smallFolders[j]]);
           }
         }
       }
       
       return candidates;
     }
   }
   ```

4. **Index Maintenance Job**
   ```typescript
   class IndexMaintenanceJob implements IJob {
     async execute(): Promise<void> {
       // Recompute folder centroids
       await this.recomputeCentroids();
       
       // Update exemplar sets
       await this.updateExemplars();
       
       // Optimize vector indices
       await this.optimizeIndices();
       
       // Clean orphaned entries
       await this.cleanOrphans();
     }
   }
   ```

### Tests Required
- [ ] Job scheduling tests
- [ ] Rename operation tests
- [ ] Merge operation tests
- [ ] Split operation tests
- [ ] Alias map update tests
- [ ] Index maintenance tests

### Deliverables
- [ ] Background jobs running on schedule
- [ ] Provisional folders being renamed
- [ ] Similar folders being merged
- [ ] Large folders being split
- [ ] Indices staying optimized

---

## Sprint 8: UI & Review Interface (1 week)
**Goal**: Build user interface for reviewing and managing concepts

### Tasks
1. **Review Queue API**
   ```typescript
   class ReviewQueueAPI {
     @Get('/review/next')
     async getNext(): Promise<ReviewItem> {
       return this.reviewQueue.getNext();
     }
     
     @Post('/review/:id/approve')
     async approve(
       @Param('id') id: string,
       @Body() decision: ApprovalDecision
     ): Promise<void> {
       await this.reviewQueue.resolve(id, decision);
     }
     
     @Post('/review/:id/move')
     async move(
       @Param('id') id: string,
       @Body() move: MoveDecision
     ): Promise<void> {
       await this.reviewQueue.move(id, move.targetPath);
     }
     
     @Get('/review/stats')
     async getStats(): Promise<ReviewStats> {
       return this.reviewQueue.getStats();
     }
   }
   ```

2. **Search API**
   ```typescript
   class SearchAPI {
     @Post('/search')
     async search(@Body() query: SearchQuery): Promise<SearchResults> {
       // Generate embedding for query
       const embedding = await this.embedder.embed(query.text);
       
       // Search concepts
       const concepts = await this.vectorIndex.searchConcepts(
         embedding,
         query.limit || 20
       );
       
       // Deduplicate results
       const deduped = this.deduplicateResults(concepts);
       
       // Enhance with cross-links
       const enhanced = await this.enhanceWithCrossLinks(deduped);
       
       return { results: enhanced, total: enhanced.length };
     }
   }
   ```

3. **React UI Components**
   ```typescript
   // ReviewQueue.tsx
   const ReviewQueue: React.FC = () => {
     const [currentItem, setCurrentItem] = useState<ReviewItem | null>(null);
     
     const loadNext = async () => {
       const item = await api.getNextReview();
       setCurrentItem(item);
     };
     
     const handleApprove = async () => {
       await api.approveReview(currentItem.id);
       loadNext();
     };
     
     const handleMove = async (targetPath: string) => {
       await api.moveReview(currentItem.id, targetPath);
       loadNext();
     };
     
     return (
       <div className="review-container">
         <ConceptDisplay concept={currentItem?.artifact} />
         <RoutingSuggestions suggestions={currentItem?.suggestions} />
         <ActionButtons
           onApprove={handleApprove}
           onMove={handleMove}
           onSkip={loadNext}
         />
       </div>
     );
   };
   ```

4. **Folder Browser**
   ```typescript
   const FolderBrowser: React.FC = () => {
     const [tree, setTree] = useState<FolderTree>(null);
     const [selected, setSelected] = useState<string>(null);
     
     return (
       <div className="folder-browser">
         <TreeView
           data={tree}
           onSelect={setSelected}
           renderNode={(node) => (
             <FolderNode
               folder={node}
               stats={node.stats}
               provisional={node.provisional}
             />
           )}
         />
         <FolderContents path={selected} />
       </div>
     );
   };
   ```

### Tests Required
- [ ] API endpoint tests
- [ ] Search deduplication tests
- [ ] UI component tests
- [ ] Integration tests (UI + API)
- [ ] Accessibility tests

### Deliverables
- [ ] Review queue UI functional
- [ ] Search interface working
- [ ] Folder browser operational
- [ ] Stats dashboard available

---

## Sprint 9: Production Hardening (1 week)
**Goal**: Add monitoring, resilience, and operational excellence

### Tasks
1. **Observability Layer**
   ```typescript
   class MetricsCollector {
     private readonly meters: Map<string, Meter>;
     
     recordRoutingDecision(decision: RoutingDecision): void {
       this.meters.get('routing.confidence').record(decision.confidence);
       this.meters.get('routing.method').increment(decision.method);
       
       if (decision.path === 'Unsorted') {
         this.meters.get('routing.unsorted').increment();
       }
     }
     
     recordProcessingTime(operation: string, duration: number): void {
       this.meters.get(`processing.${operation}`).record(duration);
     }
     
     recordError(error: Error, context: Record<string, any>): void {
       this.meters.get('errors').increment({
         type: error.constructor.name,
         ...context
       });
     }
   }
   ```

2. **Circuit Breaker Pattern**
   ```typescript
   class CircuitBreaker {
     private state: 'closed' | 'open' | 'half-open' = 'closed';
     private failures = 0;
     private lastFailure: Date | null = null;
     
     async execute<T>(
       operation: () => Promise<T>
     ): Promise<T> {
       if (this.state === 'open') {
         if (this.shouldAttemptReset()) {
           this.state = 'half-open';
         } else {
           throw new CircuitOpenError();
         }
       }
       
       try {
         const result = await operation();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
   }
   ```

3. **Graceful Degradation**
   ```typescript
   class DegradationManager {
     async routeWithFallback(
       candidate: ConceptCandidate
     ): Promise<RoutingDecision> {
       try {
         // Try smart routing
         return await this.smartRouter.route(candidate);
       } catch (error) {
         this.logger.warn('Smart routing failed, using rules', error);
         
         try {
           // Fall back to rule-based
           return await this.ruleRouter.route(candidate);
         } catch (error2) {
           this.logger.error('Rule routing failed, using default', error2);
           
           // Last resort - Unsorted
           return {
             path: `Unsorted/${candidate.topic}`,
             confidence: 0,
             method: 'fallback'
           };
         }
       }
     }
   }
   ```

4. **Health Checks**
   ```typescript
   class HealthCheckService {
     @Get('/health')
     async check(): Promise<HealthStatus> {
       const checks = await Promise.allSettled([
         this.checkDatabase(),
         this.checkVectorStore(),
         this.checkFileSystem(),
         this.checkLLMService()
       ]);
       
       return {
         status: this.aggregateStatus(checks),
         checks: this.formatChecks(checks),
         timestamp: new Date()
       };
     }
     
     private async checkVectorStore(): Promise<ComponentHealth> {
       const start = Date.now();
       await this.vectorStore.ping();
       
       return {
         component: 'vector-store',
         status: 'healthy',
         latency: Date.now() - start
       };
     }
   }
   ```

5. **Backup & Recovery**
   ```typescript
   class BackupService {
     async performBackup(): Promise<BackupResult> {
       const backupId = uuid();
       
       // Snapshot vector stores
       await this.vectorStore.createSnapshot(backupId);
       
       // Backup artifacts
       await this.backupArtifacts(backupId);
       
       // Backup metadata DB
       await this.backupDatabase(backupId);
       
       // Verify backup integrity
       await this.verifyBackup(backupId);
       
       return { backupId, timestamp: new Date() };
     }
     
     async restore(backupId: string): Promise<void> {
       // Restore in correct order
       await this.restoreDatabase(backupId);
       await this.restoreArtifacts(backupId);
       await this.restoreVectorStore(backupId);
       
       // Rebuild derived data
       await this.rebuildIndices();
     }
   }
   ```

### Tests Required
- [ ] Metrics collection tests
- [ ] Circuit breaker tests
- [ ] Fallback mechanism tests
- [ ] Health check tests
- [ ] Backup/restore tests
- [ ] Chaos engineering tests

### Deliverables
- [ ] Metrics dashboard operational
- [ ] Circuit breakers protecting services
- [ ] Graceful degradation working
- [ ] Health checks comprehensive
- [ ] Backup/restore tested

---

## Sprint 10: Performance & Scale (1 week)
**Goal**: Optimize performance and ensure scalability

### Tasks
1. **Performance Profiling**
   ```typescript
   class PerformanceProfiler {
     async profilePipeline(): Promise<ProfilingReport> {
       const traces: Trace[] = [];
       
       // Profile each stage
       traces.push(await this.profileAssembly());
       traces.push(await this.profileEmbedding());
       traces.push(await this.profileRouting());
       traces.push(await this.profileStorage());
       
       return {
         traces,
         bottlenecks: this.identifyBottlenecks(traces),
         recommendations: this.generateRecommendations(traces)
       };
     }
   }
   ```

2. **Batching Optimizations**
   ```typescript
   class BatchProcessor {
     private queue: ConceptCandidate[] = [];
     private timer: NodeJS.Timeout | null = null;
     
     async add(candidate: ConceptCandidate): Promise<void> {
       this.queue.push(candidate);
       
       if (this.queue.length >= this.config.batchSize) {
         await this.flush();
       } else if (!this.timer) {
         this.timer = setTimeout(
           () => this.flush(),
           this.config.batchTimeout
         );
       }
     }
     
     private async flush(): Promise<void> {
       if (this.queue.length === 0) return;
       
       const batch = this.queue.splice(0, this.config.batchSize);
       clearTimeout(this.timer);
       this.timer = null;
       
       // Process batch in parallel
       const embeddings = await this.embedder.embedBatch(
         batch.map(c => c.text)
       );
       
       await Promise.all(
         batch.map((c, i) => this.process(c, embeddings[i]))
       );
     }
   }
   ```

3. **Caching Layer**
   ```typescript
   class MultiLevelCache {
     private l1: Map<string, any> = new Map(); // Memory
     private l2: IRedisClient; // Redis
     
     async get<T>(key: string): Promise<T | null> {
       // Check L1
       if (this.l1.has(key)) {
         return this.l1.get(key);
       }
       
       // Check L2
       const value = await this.l2.get(key);
       if (value) {
         // Promote to L1
         this.l1.set(key, value);
         this.evictLRU();
         return value;
       }
       
       return null;
     }
     
     async set<T>(key: string, value: T, ttl?: number): Promise<void> {
       this.l1.set(key, value);
       await this.l2.set(key, value, ttl);
       this.evictLRU();
     }
   }
   ```

4. **Database Query Optimization**
   ```typescript
   class OptimizedFolderRepository {
     async findByPathBatch(paths: string[]): Promise<Map<string, Folder>> {
       // Single query for multiple paths
       const folders = await this.db.query(
         'SELECT * FROM folders WHERE path = ANY($1)',
         [paths]
       );
       
       return new Map(folders.map(f => [f.path, f]));
     }
     
     async getTreeStructure(): Promise<FolderTree> {
       // Use recursive CTE for efficient tree query
       const tree = await this.db.query(`
         WITH RECURSIVE folder_tree AS (
           SELECT * FROM folders WHERE parent_id IS NULL
           UNION ALL
           SELECT f.* FROM folders f
           JOIN folder_tree ft ON f.parent_id = ft.id
         )
         SELECT * FROM folder_tree
       `);
       
       return this.buildTree(tree);
     }
   }
   ```

5. **Load Testing**
   ```typescript
   class LoadTestSuite {
     async runConcurrentBatchTest(): Promise<TestResult> {
       const batches = this.generateTestBatches(100);
       
       const start = Date.now();
       const results = await Promise.all(
         batches.map(b => this.pipeline.processBatch(b))
       );
       const duration = Date.now() - start;
       
       return {
         totalBatches: batches.length,
         totalConcepts: results.reduce((sum, r) => sum + r.processed, 0),
         duration,
         throughput: this.calculateThroughput(results, duration),
         errors: this.collectErrors(results)
       };
     }
   }
   ```

### Tests Required
- [ ] Performance benchmark tests
- [ ] Load tests (100+ concurrent batches)
- [ ] Memory leak tests
- [ ] Cache hit ratio tests
- [ ] Query optimization tests

### Deliverables
- [ ] Batching optimized
- [ ] Caching effective
- [ ] Database queries optimized
- [ ] 100+ batches/second throughput
- [ ] P99 latency < 500ms

---

## Final Integration & Deployment (1 week)

### Tasks
1. **End-to-End Testing**
   - Full pipeline integration tests
   - Multi-day simulation tests
   - Recovery scenario tests
   - Data migration tests

2. **Documentation**
   - API documentation
   - Deployment guide
   - Operations runbook
   - Architecture diagrams

3. **Deployment Automation**
   - Docker containers
   - Kubernetes manifests
   - CI/CD pipelines
   - Infrastructure as code

4. **Production Readiness**
   - Security audit
   - Performance baseline
   - Monitoring alerts
   - Runbook verification

### Deliverables
- [ ] All integration tests passing
- [ ] Documentation complete
- [ ] Deployment automated
- [ ] Production environment ready

---

## Success Metrics

### Technical Metrics
- **Routing Accuracy**: >70% high-confidence placements
- **Processing Speed**: <100ms per concept
- **Dedup Effectiveness**: <1% duplicate rate
- **System Uptime**: >99.9%
- **P99 Latency**: <500ms

### Business Metrics
- **Concepts Processed**: 1000+ per day
- **Review Queue Size**: <100 items
- **Folder Quality**: <20% provisional after 1 week
- **User Satisfaction**: Concepts landing where expected

### Quality Metrics
- **Test Coverage**: >90%
- **Code Quality**: A-grade from static analysis
- **Documentation**: 100% public APIs documented
- **Security**: Zero critical vulnerabilities

---

## Risk Mitigation

### Technical Risks
1. **Vector Search Performance**
   - Mitigation: Start with small indices, optimize incrementally
   - Fallback: Rule-based routing

2. **LLM API Failures**
   - Mitigation: Multiple providers, caching, rate limiting
   - Fallback: Unsorted folder

3. **Data Loss**
   - Mitigation: Atomic writes, backups, audit logs
   - Recovery: Rebuild from artifacts

### Operational Risks
1. **Scaling Issues**
   - Mitigation: Load testing, horizontal scaling design
   - Solution: Queue-based processing

2. **Cost Overruns**
   - Mitigation: Token caps, local models, caching
   - Monitoring: Daily usage reports

---

## Notes

- Each sprint should have a retrospective
- Adjust timeline based on actual velocity
- Keep stakeholders updated weekly
- Demo working software after each sprint
- Maintain changelog for all changes
- Follow TDD throughout - no production code without tests
- Use feature flags for gradual rollout