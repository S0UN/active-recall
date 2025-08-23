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

/**
 * Individual concept extracted during multi-concept distillation
 * 
 * Represents a single, specific educational concept that is narrow enough
 * to be studied as an individual flashcard. Must follow the extreme
 * specificity requirements for folder system integration.
 */
export const ExtractedConceptSchema = z.object({
  title: z.string()
    .min(1, "Title cannot be empty")
    .max(100, "Title too long")
    .refine(
      title => !['Algorithms', 'Programming', 'Data Structures', 'Machine Learning'].includes(title),
      "Title is too broad - must be specific enough for individual flashcard"
    ),
  summary: z.string()
    .min(50, "Summary too short for meaningful learning")
    .max(500, "Summary too long for flashcard format"),
  relevanceScore: z.number()
    .min(0, "Relevance score must be non-negative")
    .max(1, "Relevance score cannot exceed 1")
    .optional(),
  startOffset: z.number()
    .int("Start offset must be integer")
    .min(0, "Start offset cannot be negative")
    .optional(),
  endOffset: z.number()
    .int("End offset must be integer")
    .min(0, "End offset cannot be negative")
    .optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  category: z.string().optional(),
}).refine(
  data => !data.endOffset || !data.startOffset || data.endOffset >= data.startOffset,
  "End offset must be greater than or equal to start offset"
);

/**
 * Multi-concept distillation result
 * 
 * Contains multiple specific educational concepts extracted from a single
 * text input. Each concept should be individually testable and specific
 * enough for flashcard generation.
 */
export const MultiConceptDistillationSchema = z.object({
  concepts: z.array(ExtractedConceptSchema)
    .min(1, "Must contain at least one concept")
    .max(5, "Cannot exceed 5 concepts for optimal learning"),
  sourceContentHash: z.string()
    .min(1, "Source content hash cannot be empty"),
  totalConcepts: z.number()
    .int("Total concepts must be integer")
    .min(1, "Must have at least one concept"),
  processingTime: z.number()
    .min(0, "Processing time cannot be negative")
    .optional(),
  cached: z.boolean()
    .default(false),
  distilledAt: z.date()
    .default(() => new Date()),
  modelInfo: z.object({
    model: z.string().default('gpt-3.5-turbo'),
    promptVersion: z.string().default('v2.0-specificity'),
    tokensUsed: z.number().optional(),
  }).optional(),
  metadata: z.object({
    ocrText: z.boolean().default(false),
    sourceType: z.enum(['pdf', 'image', 'text', 'web']).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }).optional(),
}).refine(
  data => data.concepts.length === data.totalConcepts,
  "Total concepts count must match actual concepts array length"
);

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
  generatedQuestions: z.array(z.string()).optional(), // References to generated question IDs
});

/**
 * Routing decision information
 */
export const RoutingInfoSchema = z.object({
  primaryPath: z.string().min(1, "Field cannot be empty"), // Primary folder placement
  placements: z.array(z.object({
    path: z.string(),
    confidence: z.number().min(0).max(1),
    type: z.enum(['primary', 'secondary']) // Primary vs secondary placement
  })),
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
 * Single vector approach: one vector for both deduplication and routing
 */
export const VectorEmbeddingsSchema = z.object({
  vector: z.array(z.number()), // Single vector for all operations
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
  embeddings: VectorEmbeddingsSchema.optional(), // Single vector embeddings
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
// QUESTION GENERATION SCHEMAS - Educational content question generation
// =============================================================================

/**
 * Question types for educational review
 */
export const QuestionTypeSchema = z.enum([
  'flashcard',
  'multiple_choice', 
  'short_answer',
  'true_false',
  'fill_blank',
  'concept_map'
]);

/**
 * Question difficulty levels aligned with spaced repetition
 */
export const QuestionDifficultySchema = z.enum([
  'beginner',
  'intermediate', 
  'advanced',
  'review'
]);

/**
 * Individual generated question with comprehensive metadata
 */
export const GeneratedQuestionSchema = z.object({
  id: z.string().min(1, "Question ID cannot be empty"),
  type: QuestionTypeSchema,
  difficulty: QuestionDifficultySchema,
  question: z.string().min(10, "Question text too short").max(1000, "Question text too long"),
  correctAnswer: z.union([z.string(), z.array(z.string())]).refine(
    (val) => Array.isArray(val) ? val.length > 0 : val.length > 0,
    "Correct answer cannot be empty"
  ),
  distractors: z.array(z.string()).optional(),
  explanation: z.string().max(2000, "Explanation too long").optional(),
  conceptArea: z.string().min(1, "Concept area cannot be empty"),
  learningObjective: z.string().max(500, "Learning objective too long").optional(),
  estimatedTimeSeconds: z.number().int().min(5).max(600).optional(),
  tags: z.array(z.string()).optional(),
  sourceContentHash: z.string().min(1, "Source content hash cannot be empty"),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.object({
    model: z.string().min(1, "Model name cannot be empty"),
    promptVersion: z.string().min(1, "Prompt version cannot be empty"),
    tokensUsed: z.number().int().min(0),
    generatedAt: z.date(),
  }).optional(),
});

/**
 * Question generation request configuration
 */
export const QuestionGenerationRequestSchema = z.object({
  conceptId: z.string().min(1, "Concept ID cannot be empty"),
  conceptTitle: z.string().min(1, "Concept title cannot be empty"),
  conceptSummary: z.string().min(10, "Concept summary too short"),
  sourceContentHash: z.string().min(1, "Source content hash cannot be empty"),
  count: z.number().int().min(1).max(20).default(5),
  questionTypes: z.array(QuestionTypeSchema).optional(),
  targetDifficulty: QuestionDifficultySchema.optional(),
  performanceContext: z.object({
    easeFactor: z.number().min(1.3).max(3.0),
    repetitions: z.number().int().min(0),
    lastResponseQuality: z.number().min(0).max(3),
    averageResponseTime: z.number().min(0).optional(),
  }).optional(),
  additionalContext: z.string().max(1000, "Additional context too long").optional(),
  learningGoals: z.array(z.string()).optional(),
  existingQuestions: z.array(z.string()).optional(),
});

/**
 * Question generation result with processing metadata
 */
export const QuestionGenerationResultSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
  requestedCount: z.number().int().min(1),
  generatedCount: z.number().int().min(0),
  metadata: z.object({
    processingTimeMs: z.number().min(0),
    tokensUsed: z.number().int().min(0),
    model: z.string().min(1, "Model name cannot be empty"),
    promptVersion: z.string().min(1, "Prompt version cannot be empty"),
    cached: z.boolean(),
  }),
  warnings: z.array(z.string()).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
}).refine(
  data => data.generatedCount === data.questions.length,
  "Generated count must match questions array length"
);

/**
 * User response to a generated question
 */
export const QuestionResponseSchema = z.object({
  questionId: z.string().min(1, "Question ID cannot be empty"),
  userAnswer: z.union([z.string(), z.array(z.string())]),
  isCorrect: z.boolean(),
  responseTimeMs: z.number().int().min(0),
  answeredAt: z.date(),
  userConfidence: z.number().min(0).max(1).optional(),
  feedback: z.string().max(1000, "Feedback too long").optional(),
});

/**
 * Question review session for spaced repetition integration
 */
export const QuestionReviewSessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  conceptId: z.string().min(1, "Concept ID cannot be empty"),
  questions: z.array(GeneratedQuestionSchema).min(1, "Session must have at least one question"),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  responses: z.array(QuestionResponseSchema).optional(),
  sessionScore: z.number().min(0).max(1).optional(),
  totalTimeMs: z.number().int().min(0).optional(),
}).refine(
  data => !data.completedAt || data.completedAt >= data.startedAt,
  "Completion time must be after start time"
);

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
export type ExtractedConcept = z.infer<typeof ExtractedConceptSchema>;
export type MultiConceptDistillation = z.infer<typeof MultiConceptDistillationSchema>;

// Question generation types
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type QuestionDifficulty = z.infer<typeof QuestionDifficultySchema>;
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type QuestionGenerationRequest = z.infer<typeof QuestionGenerationRequestSchema>;
export type QuestionGenerationResult = z.infer<typeof QuestionGenerationResultSchema>;
export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;
export type QuestionReviewSession = z.infer<typeof QuestionReviewSessionSchema>;