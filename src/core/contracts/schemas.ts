/**
 * Data contracts and schemas for the Concept Organizer
 * 
 * This file defines all data structures used throughout the application.
 * We use Zod for runtime validation and TypeScript type inference.
 * 
 * Key principles:
 * - Single source of truth for data structures
 * - Runtime validation at boundaries
 * - Type safety throughout the application
 * - Clear, documented schemas
 */

import { z } from 'zod';

// =============================================================================
// BASE SCHEMAS - Common patterns used across the system
// =============================================================================

/**
 * UUID v4 validation pattern
 */
const UuidSchema = z.string().uuid();


/**
 * Entry in a batch - represents a single captured text snippet
 */
export const EntrySchema = z.object({
  text: z.string().min(1, "Text cannot be empty"),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Session markers for tracking capture sessions
 */
export const SessionMarkerSchema = z.object({
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  startTime: z.date(),
  endTime: z.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// =============================================================================
// BATCH SCHEMAS - Input from capture system
// =============================================================================

/**
 * Batch of entries from the capture system
 * This is the primary input to the concept pipeline
 */
export const BatchSchema = z.object({
  batchId: UuidSchema,
  window: z.string().min(1, "Window cannot be empty"),
  topic: z.string().min(1, "Topic cannot be empty"),
  entries: z.array(EntrySchema),
  sessionMarkers: SessionMarkerSchema.optional(),
  createdAt: z.date(),
});

/**
 * Source information for tracking data provenance
 */
export const SourceInfoSchema = z.object({
  window: z.string().min(1, "Window cannot be empty"),
  topic: z.string().min(1, "Topic cannot be empty"),
  batchId: UuidSchema,
  entryCount: z.number().int().positive(),
  uri: z.string().url().optional(),
});

// =============================================================================
// CONCEPT CANDIDATE SCHEMAS - Processing pipeline intermediate data
// =============================================================================

/**
 * Concept candidate - normalized and prepared for routing
 */
export const ConceptCandidateSchema = z.object({
  candidateId: z.string().min(1, "Field cannot be empty"), // Deterministic ID
  batchId: UuidSchema,
  index: z.number().int().nonnegative(),
  rawText: z.string().min(1, "Field cannot be empty"),
  normalizedText: z.string().min(1, "Field cannot be empty"),
  contentHash: z.string().min(1, "Field cannot be empty"),
  source: SourceInfoSchema,
  titleHint: z.string().optional(),
  keyTerms: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
});

/**
 * Distilled content from LLM enrichment
 * This is the output of the DISTILL step before EMBED
 */
export const DistilledContentSchema = z.object({
  title: z.string().min(1, "Title cannot be empty").max(100, "Title too long"),
  summary: z.string().min(50, "Summary too short").max(500),
  contentHash: z.string().min(1, "Field cannot be empty"),
  cached: z.boolean().optional(),
  distilledAt: z.date().optional(),
});

// =============================================================================
// CONCEPT ARTIFACT SCHEMAS - Final persisted concepts
// =============================================================================

/**
 * Content of a concept artifact
 */
export const ContentSchema = z.object({
  original: z.string().min(1, "Field cannot be empty"),
  normalized: z.string().min(1, "Field cannot be empty"),
  enhancedSummary: z.string().optional(),
  quizSeeds: z.array(z.string()).optional(),
});

/**
 * Routing decision information
 */
export const RoutingInfoSchema = z.object({
  path: z.string().min(1, "Field cannot be empty"),
  confidence: z.number().min(0).max(1),
  method: z.string().min(1, "Field cannot be empty"),
  rationale: z.string().optional(),
  alternatives: z.array(z.object({
    path: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

/**
 * Provenance tracking
 */
export const ProvenanceSchema = z.object({
  source: SourceInfoSchema,
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  capturedAt: z.date(),
  processedAt: z.date().optional(),
});

/**
 * Model information for reproducibility
 */
export const ModelInfoSchema = z.object({
  classifier: z.string().min(1, "Field cannot be empty"),
  embedding: z.string().min(1, "Field cannot be empty"),
  version: z.string().min(1, "Field cannot be empty"),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Audit information
 */
export const AuditInfoSchema = z.object({
  createdAt: z.date(),
  createdBy: z.string().min(1, "Field cannot be empty"),
  lastModified: z.date(),
  modifiedBy: z.string().min(1, "Field cannot be empty"),
  version: z.number().int().positive(),
  changeLog: z.array(z.object({
    timestamp: z.date(),
    user: z.string(),
    action: z.string(),
    details: z.string().optional(),
  })).optional(),
});

/**
 * Vector embeddings for the concept
 * Two-view approach: title vector (fast dedup) + context vector (routing)
 */
export const VectorEmbeddingsSchema = z.object({
  titleVector: z.array(z.number()), // Fast dedup/lookups
  contextVector: z.array(z.number()), // Primary for routing/search
  contentHash: z.string().min(1, "Field cannot be empty"),
  model: z.string().min(1, "Field cannot be empty"),
  dimensions: z.number().int().positive(),
  cached: z.boolean().optional(),
  embeddedAt: z.date().optional(),
});

/**
 * Complete concept artifact - the final output of the pipeline
 */
export const ConceptArtifactSchema = z.object({
  artifactId: z.string().min(1, "Field cannot be empty"), // Deterministic ID
  candidateId: z.string().min(1, "Field cannot be empty"),
  title: z.string().min(1, "Title cannot be empty").max(100, "Title too long"),
  summary: z.string().min(50, "Summary too short").max(500),
  content: ContentSchema,
  routing: RoutingInfoSchema,
  provenance: ProvenanceSchema,
  modelInfo: ModelInfoSchema,
  audit: AuditInfoSchema,
  crossLinks: z.array(z.object({
    targetPath: z.string(),
    score: z.number().min(0).max(1),
    reason: z.string(),
  })).optional(),
  embeddings: VectorEmbeddingsSchema.optional(), // Two-vector approach
  version: z.string().min(1, "Field cannot be empty"),
});

// =============================================================================
// FOLDER SCHEMAS - Organization structure
// =============================================================================

/**
 * Folder statistics
 */
export const FolderStatsSchema = z.object({
  artifactCount: z.number().int().nonnegative(),
  lastUpdated: z.date(),
  size: z.number().int().nonnegative(),
  avgConfidence: z.number().min(0).max(1).optional(),
  variance: z.number().min(0).optional(),
});

/**
 * Folder manifest - metadata about a folder in the hierarchy
 */
export const FolderManifestSchema = z.object({
  folderId: z.string().min(1, "Field cannot be empty"), // Stable ID
  path: z.string().min(1, "Field cannot be empty"),
  name: z.string().min(1, "Field cannot be empty"),
  description: z.string().optional(),
  depth: z.number().int().min(0).max(4),
  provisional: z.boolean(),
  stats: FolderStatsSchema,
  centroid: z.instanceof(Float32Array).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// =============================================================================
// ROUTING SCHEMAS - Decision making structures
// =============================================================================

/**
 * Placement score for a folder candidate
 */
export const PlacementScoreSchema = z.object({
  folder: FolderManifestSchema,
  score: z.number().min(0).max(1),
  components: z.object({
    centroidSimilarity: z.number().min(0).max(1),
    exemplarSimilarity: z.number().min(0).max(1),
    lexicalOverlap: z.number().min(0).max(1),
    depthPenalty: z.number().min(0).max(1),
  }).optional(),
});

/**
 * Routing decision result
 */
export const RoutingDecisionSchema = z.object({
  path: z.string().min(1, "Field cannot be empty"),
  confidence: z.number().min(0).max(1),
  method: z.enum(['rule-based', 'vector-similarity', 'llm-arbitrated', 'fallback']),
  rationale: z.string().optional(),
  scores: z.array(PlacementScoreSchema).optional(),
});

// =============================================================================
// DEDUPLICATION SCHEMAS
// =============================================================================

/**
 * Duplicate check result
 */
export const DuplicateCheckResultSchema = z.object({
  isDuplicate: z.boolean(),
  type: z.enum(['exact', 'semantic', 'none']).optional(),
  existing: z.object({
    artifactId: z.string(),
    path: z.string(),
    score: z.number().min(0).max(1),
    contentHash: z.string(),
  }).optional(),
});

// =============================================================================
// REVIEW QUEUE SCHEMAS
// =============================================================================

/**
 * Review reason enumeration
 */
export const ReviewReasonSchema = z.enum([
  'low-confidence',
  'ambiguous-routing',
  'potential-duplicate',
  'quality-concerns',
  'manual-flag',
]);

/**
 * Review item in the queue
 */
export const ReviewItemSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string(),
  artifact: ConceptArtifactSchema,
  reason: ReviewReasonSchema,
  suggestedActions: z.array(z.object({
    action: z.string(),
    target: z.string().optional(),
    confidence: z.number().min(0).max(1),
  })),
  createdAt: z.date(),
  status: z.enum(['pending', 'in-review', 'resolved', 'skipped']),
  resolution: z.object({
    action: z.string(),
    details: z.string().optional(),
    resolvedBy: z.string(),
    resolvedAt: z.date(),
  }).optional(),
});

// =============================================================================
// SESSION MANIFEST SCHEMAS
// =============================================================================

/**
 * Complete session manifest
 */
export const SessionManifestSchema = z.object({
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  startTime: z.date(),
  endTime: z.date(),
  batches: z.array(z.object({
    batchId: z.string().uuid(),
    timestamp: z.date(),
    entryCount: z.number().int().positive(),
  })),
  artifacts: z.array(z.object({
    artifactId: z.string(),
    path: z.string(),
    timestamp: z.date(),
  })),
  stats: z.object({
    totalBatches: z.number().int().nonnegative(),
    totalEntries: z.number().int().nonnegative(),
    totalArtifacts: z.number().int().nonnegative(),
    totalDuplicates: z.number().int().nonnegative(),
    routingAccuracy: z.number().min(0).max(1).optional(),
  }),
});

// =============================================================================
// AUDIT EVENT SCHEMAS
// =============================================================================

/**
 * Audit event types
 */
export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  type: z.enum([
    'batch-received',
    'artifact-created',
    'artifact-updated',
    'artifact-moved',
    'folder-created',
    'folder-renamed',
    'folder-merged',
    'folder-split',
    'duplicate-detected',
    'review-resolved',
  ]),
  entityId: z.string(),
  entityType: z.string(),
  action: z.string(),
  userId: z.string(),
  details: z.record(z.string(), z.unknown()),
  sessionId: z.string().optional(),
});

// =============================================================================
// TYPE EXPORTS - TypeScript types inferred from schemas
// =============================================================================

export type Entry = z.infer<typeof EntrySchema>;
export type SessionMarker = z.infer<typeof SessionMarkerSchema>;
export type Batch = z.infer<typeof BatchSchema>;
export type SourceInfo = z.infer<typeof SourceInfoSchema>;
export type ConceptCandidate = z.infer<typeof ConceptCandidateSchema>;
export type Content = z.infer<typeof ContentSchema>;
export type RoutingInfo = z.infer<typeof RoutingInfoSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type AuditInfo = z.infer<typeof AuditInfoSchema>;
export type ConceptArtifact = z.infer<typeof ConceptArtifactSchema>;
export type FolderStats = z.infer<typeof FolderStatsSchema>;
export type FolderManifest = z.infer<typeof FolderManifestSchema>;
export type PlacementScore = z.infer<typeof PlacementScoreSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type DuplicateCheckResult = z.infer<typeof DuplicateCheckResultSchema>;
export type ReviewReason = z.infer<typeof ReviewReasonSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type SessionManifest = z.infer<typeof SessionManifestSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// New types for corrected pipeline
export type DistilledContent = z.infer<typeof DistilledContentSchema>;
export type VectorEmbeddings = z.infer<typeof VectorEmbeddingsSchema>;