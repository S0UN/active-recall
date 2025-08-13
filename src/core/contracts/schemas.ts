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
 * ISO timestamp string or Date object
 */
const TimestampSchema = z.union([z.string().datetime(), z.date()]);

/**
 * Entry in a batch - represents a single captured text snippet
 */
export const EntrySchema = z.object({
  text: z.string().min(1),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Session markers for tracking capture sessions
 */
export const SessionMarkerSchema = z.object({
  sessionId: z.string().min(1),
  startTime: z.date(),
  endTime: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
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
  window: z.string().min(1),
  topic: z.string().min(1),
  entries: z.array(EntrySchema),
  sessionMarkers: SessionMarkerSchema.optional(),
  createdAt: z.date(),
});

/**
 * Source information for tracking data provenance
 */
export const SourceInfoSchema = z.object({
  window: z.string().min(1),
  topic: z.string().min(1),
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
  candidateId: z.string().min(1), // Deterministic ID
  batchId: UuidSchema,
  index: z.number().int().nonnegative(),
  rawText: z.string().min(1),
  normalizedText: z.string().min(1),
  contentHash: z.string().min(1),
  source: SourceInfoSchema,
  titleHint: z.string().optional(),
  keyTerms: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

// =============================================================================
// CONCEPT ARTIFACT SCHEMAS - Final persisted concepts
// =============================================================================

/**
 * Content of a concept artifact
 */
export const ContentSchema = z.object({
  original: z.string().min(1),
  normalized: z.string().min(1),
  enhancedSummary: z.string().optional(),
  quizSeeds: z.array(z.string()).optional(),
});

/**
 * Routing decision information
 */
export const RoutingInfoSchema = z.object({
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  method: z.string().min(1),
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
  sessionId: z.string().min(1),
  capturedAt: z.date(),
  processedAt: z.date().optional(),
});

/**
 * Model information for reproducibility
 */
export const ModelInfoSchema = z.object({
  classifier: z.string().min(1),
  embedding: z.string().min(1),
  version: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
});

/**
 * Audit information
 */
export const AuditInfoSchema = z.object({
  createdAt: z.date(),
  createdBy: z.string().min(1),
  lastModified: z.date(),
  modifiedBy: z.string().min(1),
  version: z.number().int().positive(),
  changeLog: z.array(z.object({
    timestamp: z.date(),
    user: z.string(),
    action: z.string(),
    details: z.string().optional(),
  })).optional(),
});

/**
 * Complete concept artifact - the final output of the pipeline
 */
export const ConceptArtifactSchema = z.object({
  artifactId: z.string().min(1), // Deterministic ID
  candidateId: z.string().min(1),
  title: z.string().min(1).max(100),
  summary: z.string().min(50).max(500),
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
  embedding: z.instanceof(Float32Array).optional(),
  version: z.string().min(1),
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
  folderId: z.string().min(1), // Stable ID
  path: z.string().min(1),
  name: z.string().min(1),
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
  path: z.string().min(1),
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
  sessionId: z.string().min(1),
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
  details: z.record(z.unknown()),
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