/**
 * Core service interfaces for the Concept Organizer system
 * 
 * This file defines:
 * - Strategy interfaces for swappable implementations
 * - Clear separation of concerns between layers
 * - Testable contracts with minimal dependencies
 * - Repository patterns for data access
 * 
 * Design principles:
 * - Interface segregation - focused, single-purpose interfaces
 * - Dependency inversion - depend on abstractions, not concretions  
 * - Strategy pattern - swappable algorithms and implementations
 * - Repository pattern - abstract data access details
 */

import {
  Batch,
  ConceptCandidate,
  EnhancedCandidate,
  ConceptArtifact,
  FolderManifest,
  RoutingDecision,
  ReviewItem,
  AuditEvent,
  SessionManifest,
  Vector,
  PlacementScore,
  CrossLink
} from '../contracts/schemas';

// =============================================================================
// PIPELINE SERVICES - Core processing chain
// =============================================================================

/**
 * Converts raw batches into concept candidates
 * Handles text normalization, stitching, and validation
 */
export interface ISessionAssembler {
  /**
   * Process a batch of OCR text into validated candidates
   * Rejects insufficient content, normalizes text, computes hashes
   */
  assembleCandidates(batch: Batch): Promise<ConceptCandidate[]>;
  
  /**
   * Configure text normalization and quality thresholds
   */
  configure(config: AssemblerConfig): void;
}

export interface AssemblerConfig {
  minTextLength: number;
  minWordCount: number;
  minQualityScore: number;
  enableStitching: boolean;
  maxStitchDistance: number;
}

/**
 * Extracts concepts and generates summaries from candidates
 * Optional LLM enhancement for title/key terms
 */
export interface IConceptExtractor {
  /**
   * Extract concepts from candidates, optionally using LLM
   * Returns enhanced candidates with titles and summaries
   */
  extract(candidates: ConceptCandidate[]): Promise<EnhancedCandidate[]>;
  
  /**
   * Check if LLM enhancement is available and within budget
   */
  canEnhance(): Promise<boolean>;
}

/**
 * Routes concepts to appropriate folders based on similarity
 * Core intelligence of the system
 */
export interface IRouter {
  /**
   * Determine the best folder placement for a candidate
   * Uses vector similarity, lexical matching, and heuristics
   */
  route(candidate: ConceptCandidate): Promise<RoutingDecision>;
  
  /**
   * Batch route multiple candidates efficiently
   */
  routeBatch(candidates: ConceptCandidate[]): Promise<RoutingDecision[]>;
  
  /**
   * Update routing thresholds based on performance feedback
   */
  updateThresholds(thresholds: RoutingThresholds): void;
}

export interface RoutingThresholds {
  highConfidence: number;    // Auto-place threshold
  lowConfidence: number;     // Send to Unsorted threshold  
  crossLinkDelta: number;    // Runner-up margin for cross-links
  crossLinkMinScore: number; // Minimum score for cross-link
}

/**
 * Builds final artifacts from enhanced candidates and routing decisions
 * Generates deterministic IDs and metadata
 */
export interface IArtifactBuilder {
  /**
   * Build a complete concept artifact from candidate and routing
   * Includes provenance, model info, and audit data
   */
  build(
    candidate: EnhancedCandidate,
    routing: RoutingDecision
  ): Promise<ConceptArtifact>;
  
  /**
   * Rebuild artifact with updated routing (for moves/corrections)
   */
  rebuild(
    existing: ConceptArtifact,
    newRouting: RoutingDecision
  ): Promise<ConceptArtifact>;
}

/**
 * Orchestrates the complete pipeline from batch to artifacts
 * Coordinates all processing steps with error handling
 */
export interface IPipelineOrchestrator {
  /**
   * Process a complete batch through the pipeline
   * Returns processing results with metrics and errors
   */
  processBatch(batch: Batch): Promise<ProcessingResult>;
  
  /**
   * Process multiple batches concurrently
   */
  processBatches(batches: Batch[]): Promise<ProcessingResult[]>;
  
  /**
   * Get current processing status and metrics
   */
  getStatus(): ProcessingStatus;
}

export interface ProcessingResult {
  batchId: string;
  candidatesGenerated: number;
  artifactsCreated: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  unsortedCount: number;
  crossLinksAdded: number;
  processingTimeMs: number;
  errors: ProcessingError[];
}

export interface ProcessingError {
  stage: string;
  candidateId?: string;
  error: string;
  recoverable: boolean;
}

export interface ProcessingStatus {
  isProcessing: boolean;
  queuedBatches: number;
  totalProcessed: number;
  averageProcessingTimeMs: number;
  errorRate: number;
}

// =============================================================================
// STORAGE SERVICES - Data persistence abstractions  
// =============================================================================

/**
 * Repository for concept artifacts
 * Handles atomic writes and idempotent operations
 */
export interface IConceptArtifactRepository {
  /**
   * Save artifact atomically with integrity checks
   */
  save(artifact: ConceptArtifact): Promise<void>;
  
  /**
   * Find artifact by deterministic ID
   */
  findById(id: string): Promise<ConceptArtifact | null>;
  
  /**
   * Find all artifacts in a folder path
   */
  findByPath(path: string): Promise<ConceptArtifact[]>;
  
  /**
   * Check if artifact already exists (for idempotency)
   */
  exists(id: string): Promise<boolean>;
  
  /**
   * Update artifact routing (for moves/corrections)
   */
  updateRouting(id: string, routing: RoutingDecision): Promise<void>;
  
  /**
   * Delete artifact and clean up references
   */
  delete(id: string): Promise<void>;
  
  /**
   * Search artifacts by content similarity
   */
  searchSimilar(
    embedding: Vector,
    limit: number,
    excludePaths?: string[]
  ): Promise<SimilarArtifact[]>;
}

export interface SimilarArtifact {
  artifact: ConceptArtifact;
  similarity: number;
  matchType: 'exact' | 'semantic';
}

/**
 * Repository for folder manifests and hierarchy
 * Manages folder metadata and poly-hierarchy relationships
 */
export interface IFolderRepository {
  /**
   * Create new folder with manifest
   */
  create(path: string, manifest: Partial<FolderManifest>): Promise<FolderManifest>;
  
  /**
   * Find folder manifest by path
   */
  findByPath(path: string): Promise<FolderManifest | null>;
  
  /**
   * Find folder manifest by stable ID
   */
  findById(id: string): Promise<FolderManifest | null>;
  
  /**
   * Update folder manifest
   */
  update(id: string, updates: Partial<FolderManifest>): Promise<void>;
  
  /**
   * List all child folders
   */
  listChildren(parentPath: string): Promise<FolderManifest[]>;
  
  /**
   * Rename folder and update all references
   */
  rename(oldPath: string, newPath: string): Promise<void>;
  
  /**
   * Find provisional folders needing review
   */
  findProvisional(): Promise<FolderManifest[]>;
  
  /**
   * Find small folders for potential merging
   */
  findSmallFolders(threshold: number): Promise<FolderManifest[]>;
}

/**
 * Repository for audit logs and traceability
 * Append-only log of all system events
 */
export interface IAuditRepository {
  /**
   * Append event to audit log (never fails)
   */
  log(event: AuditEvent): Promise<void>;
  
  /**
   * Query audit events by criteria
   */
  query(criteria: AuditQuery): Promise<AuditEvent[]>;
  
  /**
   * Get events for specific entity
   */
  getEntityHistory(entityId: string): Promise<AuditEvent[]>;
  
  /**
   * Rotate log files and maintain retention
   */
  rotate(): Promise<void>;
}

export interface AuditQuery {
  startTime?: Date;
  endTime?: Date;
  eventTypes?: string[];
  entityIds?: string[];
  limit?: number;
}

// =============================================================================
// INDEXING SERVICES - Vector and lexical search
// =============================================================================

/**
 * Vector database operations
 * Handles embeddings, similarity search, and index management
 */
export interface IVectorIndex {
  /**
   * Add or update vector with metadata
   */
  upsert(
    id: string,
    vectors: { label: Vector; context: Vector },
    metadata: Record<string, unknown>
  ): Promise<void>;
  
  /**
   * Search for similar vectors
   */
  search(
    query: Vector,
    limit: number,
    filter?: VectorFilter
  ): Promise<VectorSearchResult[]>;
  
  /**
   * Delete vector by ID
   */
  delete(id: string): Promise<void>;
  
  /**
   * Update vector metadata without changing vector
   */
  updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<void>;
  
  /**
   * Get collection statistics
   */
  getStats(): Promise<IndexStats>;
  
  /**
   * Optimize index for better performance
   */
  optimize(): Promise<void>;
}

export interface VectorFilter {
  path?: string;
  pathPrefix?: string;
  excludePaths?: string[];
  minScore?: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IndexStats {
  totalVectors: number;
  dimensions: number;
  indexSize: string;
  lastOptimized?: Date;
}

/**
 * Embedding generation service
 * Converts text to vectors for similarity search
 */
export interface IEmbeddingService {
  /**
   * Generate embedding for single text
   */
  embed(text: string): Promise<Vector>;
  
  /**
   * Generate embeddings for batch of texts
   */
  embedBatch(texts: string[]): Promise<Vector[]>;
  
  /**
   * Get embedding model information
   */
  getModelInfo(): EmbeddingModelInfo;
  
  /**
   * Check if service is available
   */
  isAvailable(): Promise<boolean>;
}

export interface EmbeddingModelInfo {
  name: string;
  version: string;
  dimensions: number;
  maxTokens: number;
  costPerToken?: number;
}

/**
 * Folder centroid management
 * Maintains aggregate embeddings for folders
 */
export interface IFolderIndex {
  /**
   * Update folder centroid after adding/removing artifacts
   */
  updateCentroid(
    folderId: string,
    artifactEmbeddings: Vector[]
  ): Promise<void>;
  
  /**
   * Search for most similar folders
   */
  searchFolders(
    query: Vector,
    limit: number
  ): Promise<FolderSearchResult[]>;
  
  /**
   * Get folder exemplars for display
   */
  getExemplars(folderId: string): Promise<ConceptArtifact[]>;
  
  /**
   * Recompute all centroids (maintenance operation)
   */
  recomputeAllCentroids(): Promise<void>;
}

export interface FolderSearchResult {
  folderId: string;
  path: string;
  similarity: number;
  artifactCount: number;
  centroidAge: Date;
}

// =============================================================================
// QUALITY SERVICES - Deduplication and review
// =============================================================================

/**
 * Duplicate detection and cross-linking
 * Prevents duplicate content and establishes relationships
 */
export interface IDeduplicationService {
  /**
   * Check if candidate is duplicate of existing artifact
   */
  checkDuplicate(
    candidate: ConceptCandidate
  ): Promise<DuplicateCheckResult>;
  
  /**
   * Find potential cross-links for artifact
   */
  findCrossLinks(
    artifact: ConceptArtifact,
    routingScores: PlacementScore[]
  ): Promise<CrossLink[]>;
  
  /**
   * Apply cross-links to artifact
   */
  applyCrossLinks(
    artifactId: string,
    crossLinks: CrossLink[]
  ): Promise<void>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: 'exact' | 'semantic';
  existingArtifact?: ConceptArtifact;
  similarity?: number;
}

/**
 * Review queue for human oversight
 * Manages low-confidence and conflicting decisions
 */
export interface IReviewQueueService {
  /**
   * Add item to review queue
   */
  addForReview(
    artifact: ConceptArtifact,
    reason: ReviewReason,
    suggestedActions?: ReviewAction[]
  ): Promise<void>;
  
  /**
   * Get next item for review
   */
  getNext(): Promise<ReviewItem | null>;
  
  /**
   * Resolve review item with decision
   */
  resolve(
    itemId: string,
    decision: ReviewDecision
  ): Promise<void>;
  
  /**
   * Get queue statistics
   */
  getStats(): Promise<ReviewQueueStats>;
  
  /**
   * Mark item as skipped
   */
  skip(itemId: string, reason: string): Promise<void>;
}

export type ReviewReason = 
  | 'low-confidence' 
  | 'cross-path-duplicate' 
  | 'ambiguous-routing' 
  | 'llm-failure'
  | 'manual-review';

export interface ReviewAction {
  action: 'approve' | 'move' | 'merge' | 'delete';
  targetPath?: string;
  confidence: number;
  reasoning?: string;
}

export interface ReviewDecision {
  action: ReviewAction['action'];
  targetPath?: string;
  reasoning?: string;
  userId?: string;
}

export interface ReviewQueueStats {
  pendingCount: number;
  avgWaitTime: number;
  resolvedToday: number;
  backlogGrowthRate: number;
}

// =============================================================================
// LLM SERVICES - AI enhancement and arbitration
// =============================================================================

/**
 * LLM service for concept enhancement and routing arbitration
 * Handles prompts, rate limiting, and error recovery
 */
export interface ILLMService {
  /**
   * Generate summary and title for concept
   */
  generateSummary(text: string): Promise<ConceptSummary>;
  
  /**
   * Arbitrate routing decision for ambiguous cases
   */
  arbitrateRouting(
    candidate: ConceptCandidate,
    topFolders: FolderSearchResult[]
  ): Promise<RoutingArbitration>;
  
  /**
   * Propose folder rename and description
   */
  proposeRename(
    folder: FolderManifest,
    examples: ConceptArtifact[]
  ): Promise<RenameProposal>;
  
  /**
   * Check if service is available and within budget
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get current usage stats
   */
  getUsageStats(): Promise<LLMUsageStats>;
}

export interface ConceptSummary {
  title: string;
  summary: string;
  quizSeeds?: string[];
  confidence: number;
}

export interface RoutingArbitration {
  chosenPath: string;
  confidence: number;
  reasoning: string;
  alternativePaths?: string[];
}

export interface RenameProposal {
  name: string;
  description?: string;
  reasoning: string;
  confidence: number;
}

export interface LLMUsageStats {
  tokensUsedToday: number;
  tokensRemaining: number;
  requestsToday: number;
  averageLatency: number;
  errorRate: number;
}

/**
 * Token budget management for cost control
 * Prevents runaway LLM costs
 */
export interface ITokenBudgetManager {
  /**
   * Check if operation is within budget
   */
  canUse(operation: string, estimatedTokens: number): Promise<boolean>;
  
  /**
   * Record actual token usage
   */
  recordUsage(
    operation: string,
    actualTokens: number,
    cost?: number
  ): Promise<void>;
  
  /**
   * Get current budget status
   */
  getBudgetStatus(): Promise<BudgetStatus>;
  
  /**
   * Reset daily budget (called by scheduler)
   */
  resetDailyBudget(): Promise<void>;
}

export interface BudgetStatus {
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  monthlyUsed: number;
  estimatedMonthlyCost: number;
}

// =============================================================================
// MAINTENANCE SERVICES - Background jobs and optimization
// =============================================================================

/**
 * Background job scheduler
 * Runs maintenance tasks periodically
 */
export interface IJobScheduler {
  /**
   * Schedule a recurring job
   */
  schedule(job: ScheduledJob): void;
  
  /**
   * Run job immediately
   */
  runNow(jobId: string): Promise<JobResult>;
  
  /**
   * Cancel scheduled job
   */
  cancel(jobId: string): void;
  
  /**
   * Get job status and history
   */
  getJobStatus(jobId: string): Promise<JobStatus>;
  
  /**
   * List all scheduled jobs
   */
  listJobs(): Promise<JobInfo[]>;
}

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // Cron expression
  handler: () => Promise<void>;
  enabled: boolean;
}

export interface JobResult {
  success: boolean;
  duration: number;
  message?: string;
  error?: string;
}

export interface JobStatus {
  lastRun?: Date;
  nextRun?: Date;
  lastResult?: JobResult;
  runCount: number;
  failureCount: number;
}

export interface JobInfo {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: JobStatus;
}

/**
 * Session manifest tracking for recovery
 * Tracks processing sessions for audit and recovery
 */
export interface ISessionManifestService {
  /**
   * Start a new processing session
   */
  startSession(): Promise<string>; // Returns session ID
  
  /**
   * Record batch processing in session
   */
  recordBatch(sessionId: string, batch: Batch): Promise<void>;
  
  /**
   * Record artifact creation in session
   */
  recordArtifact(
    sessionId: string,
    artifact: ConceptArtifact
  ): Promise<void>;
  
  /**
   * End processing session with summary
   */
  endSession(
    sessionId: string,
    result: ProcessingResult
  ): Promise<void>;
  
  /**
   * Get session manifest for recovery
   */
  getSession(sessionId: string): Promise<SessionManifest | null>;
  
  /**
   * List incomplete sessions
   */
  getIncompleteSessions(): Promise<SessionManifest[]>;
}