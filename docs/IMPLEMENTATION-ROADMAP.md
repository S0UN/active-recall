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

## Sprint 2: Storage Layer & File Operations (1 week)
**Goal**: Implement atomic, idempotent file operations and storage repositories

### Tasks
1. **File System Storage Implementation**
   ```typescript
   class FileSystemArtifactRepository implements IConceptArtifactRepository {
     constructor(
       private readonly basePath: string,
       private readonly fileOps: IFileOperations
     ) {}

     async save(artifact: ConceptArtifact): Promise<void> {
       // 1. Validate artifact
       // 2. Compute file path
       // 3. Atomic write (temp → rename)
       // 4. Update manifest
       // 5. Append to audit log
     }

     private async atomicWrite(path: string, content: string): Promise<void> {
       const tempPath = `${path}.tmp.${Date.now()}`;
       try {
         await fs.writeFile(tempPath, content, { flag: 'wx' });
         await fs.rename(tempPath, path);
       } catch (error) {
         await fs.unlink(tempPath).catch(() => {});
         throw error;
       }
     }
   }
   ```

2. **Audit Log Service**
   ```typescript
   class AuditLogService implements IAuditLog {
     private currentFile: string;
     private writer: fs.WriteStream;

     async append(event: AuditEvent): Promise<void> {
       // Append-only JSONL
       // Rotate daily
       // Never lose events
     }

     private async rotate(): Promise<void> {
       // Close current, open new with date stamp
     }
   }
   ```

3. **Session Manifest Manager**
   ```typescript
   class SessionManifestManager {
     async startSession(sessionId: string): Promise<void>;
     async recordBatch(batch: Batch): Promise<void>;
     async recordArtifact(artifact: ConceptArtifact): Promise<void>;
     async closeSession(): Promise<SessionManifest>;
   }
   ```

4. **Path Alias Map**
   ```typescript
   class PathAliasMap {
     async addAlias(oldPath: string, newPath: string): Promise<void>;
     async resolve(path: string): Promise<string>;
     async getAllAliases(): Promise<Map<string, string>>;
   }
   ```

### Tests Required
- [ ] Atomic write tests (concurrent writes, failures)
- [ ] Idempotency tests (duplicate saves)
- [ ] Audit log rotation tests
- [ ] Session manifest integrity tests
- [ ] Path alias resolution tests

### Deliverables
- [ ] File system storage working
- [ ] Atomic writes guaranteed
- [ ] Audit logging operational
- [ ] Session manifests recording

---

## Sprint 3: Basic Pipeline Without AI (1 week)
**Goal**: Build core pipeline that processes batches into artifacts using simple rules

### Tasks
1. **Session Assembler**
   ```typescript
   class SessionAssembler {
     constructor(
       private readonly textPreprocessor: ITextPreprocessor,
       private readonly config: AssemblerConfig
     ) {}

     async assembleCandidates(batch: Batch): Promise<ConceptCandidate[]> {
       // 1. Normalize text (whitespace, encoding)
       // 2. Remove boilerplate
       // 3. Stitch adjacent snippets
       // 4. Reject too short/noisy
       // 5. Compute content hashes
       return candidates;
     }
   }
   ```

2. **Simple Router (Rule-Based)**
   ```typescript
   class SimpleRouter implements IRouter {
     async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
       // Start with keyword-based routing
       // Programming keywords → Programming folder
       // Math symbols → Mathematics folder
       // Default → Unsorted/<topic>
       return {
         path: this.determinePathByRules(candidate),
         confidence: 0.5,
         method: 'rule-based'
       };
     }
   }
   ```

3. **Artifact Builder**
   ```typescript
   class ArtifactBuilder {
     build(
       candidate: ConceptCandidate,
       routing: RoutingDecision
     ): ConceptArtifact {
       // Generate deterministic ID
       // Create artifact structure
       // Add metadata and provenance
       return artifact;
     }
   }
   ```

4. **Pipeline Orchestrator**
   ```typescript
   class PipelineOrchestrator {
     async processBatch(batch: Batch): Promise<ProcessingResult> {
       // 1. Assemble candidates
       const candidates = await this.assembler.assembleCandidates(batch);
       
       // 2. Route each candidate
       const routingDecisions = await Promise.all(
         candidates.map(c => this.router.route(c))
       );
       
       // 3. Build artifacts
       const artifacts = candidates.map((c, i) => 
         this.builder.build(c, routingDecisions[i])
       );
       
       // 4. Save artifacts
       await Promise.all(
         artifacts.map(a => this.repository.save(a))
       );
       
       // 5. Update audit log
       await this.auditLog.recordBatch(batch, artifacts);
       
       return { processed: artifacts.length, errors: [] };
     }
   }
   ```

### Tests Required
- [ ] End-to-end pipeline tests
- [ ] Assembler normalization tests
- [ ] Router rule tests
- [ ] Builder determinism tests
- [ ] Orchestrator error handling tests

### Deliverables
- [ ] Basic pipeline processing batches
- [ ] Artifacts being created and saved
- [ ] Simple routing working
- [ ] Audit trail complete

---

## Sprint 4: Vector Search & Intelligent Routing (1 week)
**Goal**: Add embeddings, vector search, and similarity-based routing

### Tasks
1. **Embedding Service**
   ```typescript
   interface IEmbeddingService {
     embed(text: string): Promise<Float32Array>;
     embedBatch(texts: string[]): Promise<Float32Array[]>;
   }

   class LocalEmbeddingService implements IEmbeddingService {
     private model: any; // Transformers.js model
     
     async initialize(): Promise<void> {
       // Load local model
     }
     
     async embed(text: string): Promise<Float32Array> {
       // Generate embedding
       // Normalize vector
       return normalized;
     }
   }
   ```

2. **Vector Index Manager**
   ```typescript
   class VectorIndexManager {
     private conceptIndex: IVectorIndex;
     private folderIndex: IVectorIndex;
     
     async addConcept(
       artifact: ConceptArtifact,
       embedding: Float32Array
     ): Promise<void> {
       // Add to concept index with metadata
     }
     
     async updateFolderCentroid(
       path: FolderPath,
       artifacts: ConceptArtifact[]
     ): Promise<void> {
       // Compute mean of member embeddings
       // Update folder index
     }
     
     async searchFolders(
       query: Float32Array,
       k: number
     ): Promise<ScoredFolder[]> {
       // ANN search on folder index
       return topK;
     }
   }
   ```

3. **Qdrant Integration**
   ```typescript
   class QdrantVectorIndex implements IVectorIndex {
     private client: QdrantClient;
     
     async initialize(): Promise<void> {
       // Create collection if not exists
       // Configure HNSW parameters
     }
     
     async upsert(
       id: string,
       vector: Float32Array,
       payload: Record<string, any>
     ): Promise<void> {
       // Add or update vector
     }
     
     async search(
       query: Float32Array,
       limit: number,
       filter?: Filter
     ): Promise<SearchResult[]> {
       // Perform ANN search
     }
   }
   ```

4. **Smart Router**
   ```typescript
   class SmartRouter implements IRouter {
     constructor(
       private readonly embeddingService: IEmbeddingService,
       private readonly vectorIndex: VectorIndexManager,
       private readonly thresholds: RoutingThresholds
     ) {}
     
     async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
       // 1. Generate embedding for candidate
       const embedding = await this.embeddingService.embed(
         `${candidate.title} ${candidate.summary}`
       );
       
       // 2. Search for similar folders
       const topFolders = await this.vectorIndex.searchFolders(
         embedding,
         10
       );
       
       // 3. Apply scoring algorithm
       const scores = this.computePlacementScores(
         candidate,
         topFolders,
         embedding
       );
       
       // 4. Make routing decision
       return this.makeDecision(scores);
     }
     
     private computePlacementScores(
       candidate: ConceptCandidate,
       folders: ScoredFolder[],
       embedding: Float32Array
     ): PlacementScore[] {
       // Centroid similarity
       // Exemplar similarity
       // Lexical overlap
       // Depth/variance penalties
     }
   }
   ```

### Tests Required
- [ ] Embedding generation tests
- [ ] Vector index CRUD tests
- [ ] Centroid computation tests
- [ ] Routing threshold tests
- [ ] Search accuracy tests

### Deliverables
- [ ] Embeddings generated for all content
- [ ] Vector search operational
- [ ] Smart routing based on similarity
- [ ] Folder centroids maintained

---

## Sprint 5: Deduplication & Cross-Links (1 week)
**Goal**: Prevent duplicates and establish cross-references

### Tasks
1. **Deduplication Service**
   ```typescript
   class DeduplicationService {
     constructor(
       private readonly vectorIndex: IVectorIndex,
       private readonly thresholds: DedupThresholds
     ) {}
     
     async checkDuplicate(
       candidate: ConceptCandidate,
       embedding: Float32Array
     ): Promise<DuplicateCheckResult> {
       // 1. Search for similar concepts
       const similar = await this.vectorIndex.searchConcepts(
         embedding,
         5
       );
       
       // 2. Check content hash first (exact match)
       const exactMatch = similar.find(
         s => s.contentHash === candidate.contentHash
       );
       if (exactMatch) {
         return { isDuplicate: true, type: 'exact', existing: exactMatch };
       }
       
       // 3. Check semantic similarity
       const nearDuplicate = similar.find(
         s => s.score > this.thresholds.nearDuplicate
       );
       if (nearDuplicate) {
         return { isDuplicate: true, type: 'semantic', existing: nearDuplicate };
       }
       
       return { isDuplicate: false };
     }
   }
   ```

2. **Cross-Link Manager**
   ```typescript
   class CrossLinkManager {
     async evaluateCrossLinks(
       artifact: ConceptArtifact,
       routingScores: PlacementScore[]
     ): Promise<CrossLink[]> {
       const crossLinks: CrossLink[] = [];
       
       // Check runner-up scores
       for (let i = 1; i < routingScores.length; i++) {
         const score = routingScores[i];
         const delta = routingScores[0].score - score.score;
         
         if (delta <= this.thresholds.crossLinkDelta &&
             score.score >= this.thresholds.crossLinkMinScore) {
           crossLinks.push({
             targetPath: score.folder.path,
             score: score.score,
             reason: 'strong-secondary-match'
           });
         }
       }
       
       return crossLinks.slice(0, this.config.maxCrossLinks);
     }
     
     async applyCrossLinks(
       artifact: ConceptArtifact,
       crossLinks: CrossLink[]
     ): Promise<void> {
       // Update artifact with cross-links
       // Create symlinks or references
       // Update indices
     }
   }
   ```

3. **Review Queue Service**
   ```typescript
   class ReviewQueueService {
     async addForReview(
       artifact: ConceptArtifact,
       reason: ReviewReason
     ): Promise<void> {
       const reviewItem: ReviewItem = {
         id: uuid(),
         artifactId: artifact.artifactId,
         artifact,
         reason,
         suggestedActions: this.generateSuggestions(artifact, reason),
         createdAt: new Date(),
         status: 'pending'
       };
       
       await this.queue.add(reviewItem);
     }
     
     async getNextForReview(): Promise<ReviewItem | null> {
       return this.queue.getNext({ status: 'pending' });
     }
     
     async resolveReview(
       itemId: string,
       action: ReviewAction
     ): Promise<void> {
       // Apply the review decision
       // Update artifact if needed
       // Mark as resolved
     }
   }
   ```

### Tests Required
- [ ] Exact duplicate detection tests
- [ ] Semantic duplicate detection tests
- [ ] Cross-link evaluation tests
- [ ] Review queue operations tests
- [ ] Concurrent dedup tests

### Deliverables
- [ ] No duplicate artifacts created
- [ ] Cross-links established
- [ ] Review queue operational
- [ ] Dedup metrics tracked

---

## Sprint 6: LLM Enhancement Layer (1 week)
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