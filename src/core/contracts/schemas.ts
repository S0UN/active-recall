/**
 * Core data schemas for the Concept Organizer system using Zod for runtime validation.
 * 
 * This file defines:
 * - All input/output data structures
 * - Validation rules and constraints 
 * - Type inference for TypeScript
 * - Schema composition patterns
 * 
 * Design principles:
 * - Schema-first development: define schemas before implementations
 * - Runtime validation at system boundaries
 * - Deterministic IDs for idempotency
 * - Immutable data structures
 */

import { z } from 'zod';

// =============================================================================
// BASIC TYPES & UTILITIES
// =============================================================================

/**
 * Base schema for entities with deterministic IDs
 * All entities must have stable, reproducible identifiers
 */
const BaseEntitySchema = z.object({
  id: z.string().min(1), // deterministic ID, not UUID
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Vector representation for embeddings
 * Normalized to unit length for cosine similarity
 */
const VectorSchema = z.object({
  dimensions: z.number().int().positive(),
  values: z.array(z.number()).min(1),
  norm: z.number().positive(), // for validation
});

/**
 * Content hash for duplicate detection and caching
 * SHA-256 of normalized content
 */
const ContentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

// =============================================================================
// SESSION & BATCH SCHEMAS
// =============================================================================

/**
 * Individual text entry from OCR/capture
 * Raw data from the capture system
 */
const EntrySchema = z.object({
  text: z.string().min(1),
  timestamp: z.date().optional(),
  confidence: z.number().min(0).max(1).optional(), // OCR confidence
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Session markers for grouping related captures
 * Used to identify study session boundaries
 */
const SessionMarkerSchema = z.object({
  start: z.date().optional(),
  end: z.date().optional(),
  sessionId: z.string().uuid().optional(),
});

/**
 * Source information for provenance tracking
 * Tracks where the content came from
 */
const SourceInfoSchema = z.object({
  window: z.string().min(1),
  topic: z.string().min(1), // broad category like "programming", "chemistry"
  batchId: z.string().uuid(),
  entryCount: z.number().int().positive(),
  uri: z.string().url().optional(), // if from web source
});

/**
 * Input batch from BatcherService
 * Groups related text entries for processing
 */
export const BatchSchema = z.object({
  batchId: z.string().uuid(),
  window: z.string().min(1),
  topic: z.string().min(1),
  entries: z.array(EntrySchema).min(1),
  sessionMarkers: SessionMarkerSchema.optional(),
  createdAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// CONCEPT PIPELINE SCHEMAS
// =============================================================================

/**
 * Intermediate candidate after assembly
 * Normalized and prepared for routing
 */
export const ConceptCandidateSchema = z.object({
  candidateId: z.string().min(1), // deterministic: hash(batchId, index, normalizedText)
  batchId: z.string().uuid(),
  index: z.number().int().min(0), // position in batch
  rawText: z.string().min(1),
  normalizedText: z.string().min(1), // cleaned, stitched text
  contentHash: ContentHashSchema,
  source: SourceInfoSchema,
  
  // Optional LLM-extracted fields
  titleHint: z.string().max(100).optional(),
  keyTerms: z.array(z.string()).optional(),
  
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

/**
 * Enhanced candidate with LLM-generated summary
 * Result of concept extraction phase
 */
export const EnhancedCandidateSchema = ConceptCandidateSchema.extend({
  title: z.string().min(1).max(100),
  summary: z.string().min(50).max(500), // 2-5 sentences
  quizSeeds: z.array(z.string()).max(5).optional(),
});

/**
 * Vector representation of a candidate/artifact
 * Two-view approach: label (title) + context (title + summary)
 */
const EmbeddingInfoSchema = z.object({
  labelVector: VectorSchema,    // title only - for dedup
  contextVector: VectorSchema,  // title + summary - for routing/search
  modelInfo: z.object({
    name: z.string(),
    version: z.string(),
    dimensions: z.number().int().positive(),
  }),
});

// =============================================================================
// ROUTING & PLACEMENT SCHEMAS
// =============================================================================

/**
 * Folder path with validation rules
 * Represents location in the knowledge hierarchy
 */
export const FolderPathSchema = z.object({
  segments: z.array(z.string().min(1)).min(1).max(4), // max depth 4
  depth: z.number().int().min(1).max(4),
})
.refine(data => data.segments.length === data.depth, {
  message: "Segments length must match depth"
});

/**
 * Placement score for routing decisions
 * Combines multiple similarity metrics
 */
const PlacementScoreSchema = z.object({
  folderId: z.string(),
  path: z.string(),
  score: z.number().min(0).max(1),
  
  // Component scores
  centroidSimilarity: z.number().min(0).max(1),
  exemplarSimilarity: z.number().min(0).max(1),
  lexicalOverlap: z.number().min(0).max(1),
  
  // Penalties
  depthPenalty: z.number().min(0),
  variancePenalty: z.number().min(0),
  
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Cross-link to related folders
 * Represents secondary placement options
 */
const CrossLinkSchema = z.object({
  targetPath: z.string(),
  targetFolderId: z.string(),
  score: z.number().min(0).max(1),
  reason: z.enum(['strong-secondary-match', 'semantic-overlap', 'user-defined']),
  confidence: z.number().min(0).max(1),
});

/**
 * Final routing decision
 * Result of routing algorithm with rationale
 */
export const RoutingDecisionSchema = z.object({
  path: z.string(),
  folderId: z.string(),
  confidence: z.number().min(0).max(1),
  method: z.enum(['rule-based', 'vector-similarity', 'llm-arbitration', 'fallback']),
  
  scores: z.array(PlacementScoreSchema).optional(),
  crossLinks: z.array(CrossLinkSchema).optional(),
  rationale: z.string().optional(), // LLM reasoning
  
  provisional: z.boolean().default(false), // needs human review
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// ARTIFACT SCHEMAS
// =============================================================================

/**
 * Content of a concept artifact
 * Distilled knowledge with provenance
 */
const ContentSchema = z.object({
  distilled: z.string().min(10), // main concept explanation
  rawExcerpt: z.string().optional(), // original text for reference
  quizSeeds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Provenance information
 * Tracks the journey from capture to artifact
 */
const ProvenanceSchema = z.object({
  batchId: z.string().uuid(),
  candidateId: z.string(),
  window: z.string(),
  topic: z.string(),
  sourceUri: z.string().url().optional(),
  sessionId: z.string().uuid().optional(),
  captureTime: z.date(),
  processingTime: z.date(),
});

/**
 * Model information for reproducibility
 * Tracks which AI models were used
 */
const ModelInfoSchema = z.object({
  embeddings: z.object({
    name: z.string(),
    version: z.string(),
    dimensions: z.number().int().positive(),
  }).optional(),
  
  llm: z.object({
    name: z.string(),
    version: z.string(),
    temperature: z.number().min(0).max(2).optional(),
  }).optional(),
  
  reranker: z.object({
    name: z.string(),
    version: z.string(),
  }).optional(),
});

/**
 * Audit information for traceability
 * Links to detailed audit logs
 */
const AuditInfoSchema = z.object({
  createdAt: z.date(),
  processVersion: z.string(), // software version
  decisionLogId: z.string(), // pointer to detailed audit log
  checksum: z.string(), // integrity verification
});

/**
 * Complete concept artifact
 * Final output of the processing pipeline
 */
export const ConceptArtifactSchema = z.object({
  artifactId: z.string().min(1), // deterministic: hash(candidateId, finalPath)
  candidateId: z.string(),
  
  // Core content
  title: z.string().min(1).max(100),
  summary: z.string().min(50).max(500),
  content: ContentSchema,
  
  // Placement
  routing: RoutingDecisionSchema,
  embedding: EmbeddingInfoSchema.optional(),
  
  // Metadata
  provenance: ProvenanceSchema,
  modelInfo: ModelInfoSchema,
  audit: AuditInfoSchema,
  
  version: z.string().default('1.0'),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

// =============================================================================
// FOLDER & HIERARCHY SCHEMAS
// =============================================================================

/**
 * Statistics about folder contents
 * Used for maintenance and UI display
 */
const FolderStatsSchema = z.object({
  artifactCount: z.number().int().min(0),
  lastUpdated: z.date(),
  avgConfidence: z.number().min(0).max(1).optional(),
  variance: z.number().min(0).optional(), // semantic variance of contents
  size: z.number().int().min(0), // total content size
});

/**
 * Exemplar artifacts for folder representation
 * Small set of representative items
 */
const ExemplarSetSchema = z.object({
  artifacts: z.array(z.object({
    artifactId: z.string(),
    title: z.string(),
    score: z.number().min(0).max(1), // representativeness score
  })).max(10),
  lastUpdated: z.date(),
});

/**
 * Lexical fingerprint for hybrid search
 * Key terms and phrases that characterize the folder
 */
const LexicalFootprintSchema = z.object({
  terms: z.array(z.object({
    term: z.string(),
    weight: z.number().min(0).max(1),
    frequency: z.number().int().min(1),
  })).max(50),
  lastUpdated: z.date(),
});

/**
 * Folder manifest with metadata
 * Stable identity and cached derived data
 */
export const FolderManifestSchema = z.object({
  folderId: z.string().min(1), // stable ID, independent of path
  path: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  
  // Hierarchy
  parentIds: z.array(z.string()).optional(), // poly-hierarchy support
  depth: z.number().int().min(0).max(4),
  
  // Status
  provisional: z.boolean().default(false), // needs renaming
  archived: z.boolean().default(false),
  
  // Cached data for performance
  stats: FolderStatsSchema,
  centroid: VectorSchema.optional(), // mean of member vectors
  exemplars: ExemplarSetSchema.optional(),
  lexicalFootprint: LexicalFootprintSchema.optional(),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.string().default('1.0'),
});

// =============================================================================
// MAINTENANCE & OPERATIONS SCHEMAS
// =============================================================================

/**
 * Path alias for renames and moves
 * Maintains backward compatibility
 */
export const PathAliasSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  createdAt: z.date(),
  reason: z.enum(['rename', 'merge', 'split', 'reorganization']),
  automatic: z.boolean(), // vs human-initiated
});

/**
 * Review queue item for human oversight
 * Low confidence or conflicting decisions
 */
export const ReviewItemSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string(),
  artifact: ConceptArtifactSchema,
  
  reason: z.enum([
    'low-confidence',
    'cross-path-duplicate', 
    'ambiguous-routing',
    'llm-failure',
    'manual-review'
  ]),
  
  suggestedActions: z.array(z.object({
    action: z.enum(['approve', 'move', 'merge', 'delete']),
    targetPath: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
  })),
  
  status: z.enum(['pending', 'in-progress', 'resolved', 'skipped']),
  assignedTo: z.string().optional(),
  
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().optional(),
});

/**
 * Audit event for traceability
 * Append-only log of all system actions
 */
export const AuditEventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.date(),
  
  // Event classification
  type: z.enum([
    'batch-processed',
    'artifact-created',
    'artifact-updated',
    'folder-created',
    'folder-renamed',
    'folder-merged',
    'cross-link-added',
    'review-resolved',
    'system-error'
  ]),
  
  // Context
  userId: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  
  // Event data
  entityId: z.string(), // artifact, folder, or batch ID
  entityType: z.enum(['batch', 'candidate', 'artifact', 'folder', 'review']),
  
  // Details
  action: z.string(),
  changes: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  
  // Error information
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    stack: z.string().optional(),
  }).optional(),
});

/**
 * Session manifest for batch processing
 * Tracks processing sessions for recovery and audit
 */
export const SessionManifestSchema = z.object({
  sessionId: z.string().uuid(),
  startTime: z.date(),
  endTime: z.date().optional(),
  
  // Input tracking
  batchesProcessed: z.array(z.string().uuid()),
  candidatesGenerated: z.number().int().min(0),
  
  // Output tracking
  artifactsCreated: z.array(z.string()),
  foldersCreated: z.array(z.string()),
  reviewItemsAdded: z.array(z.string().uuid()),
  
  // Status
  status: z.enum(['active', 'completed', 'failed', 'cancelled']),
  
  // Results
  summary: z.object({
    totalProcessed: z.number().int().min(0),
    successCount: z.number().int().min(0),
    errorCount: z.number().int().min(0),
    highConfidenceCount: z.number().int().min(0),
    unsortedCount: z.number().int().min(0),
  }).optional(),
  
  // Error information
  errors: z.array(z.object({
    stage: z.string(),
    error: z.string(),
    entityId: z.string().optional(),
  })).optional(),
  
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Infer TypeScript types from schemas
export type Batch = z.infer<typeof BatchSchema>;
export type ConceptCandidate = z.infer<typeof ConceptCandidateSchema>;
export type EnhancedCandidate = z.infer<typeof EnhancedCandidateSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type ConceptArtifact = z.infer<typeof ConceptArtifactSchema>;
export type FolderManifest = z.infer<typeof FolderManifestSchema>;
export type PathAlias = z.infer<typeof PathAliasSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type SessionManifest = z.infer<typeof SessionManifestSchema>;
export type FolderPath = z.infer<typeof FolderPathSchema>;

// Component types
export type Vector = z.infer<typeof VectorSchema>;
export type PlacementScore = z.infer<typeof PlacementScoreSchema>;
export type CrossLink = z.infer<typeof CrossLinkSchema>;
export type SourceInfo = z.infer<typeof SourceInfoSchema>;
export type FolderStats = z.infer<typeof FolderStatsSchema>;

// Utility types for common operations
export type CreateArtifactInput = Omit<ConceptArtifact, 'artifactId' | 'audit' | 'createdAt' | 'updatedAt'>;
export type UpdateArtifactInput = Partial<Pick<ConceptArtifact, 'title' | 'summary' | 'content' | 'routing'>>;
export type CreateFolderInput = Omit<FolderManifest, 'folderId' | 'stats' | 'createdAt' | 'updatedAt'>;