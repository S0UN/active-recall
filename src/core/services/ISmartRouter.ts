/**
 * ISmartRouter - Orchestrates the complete DISTILL → EMBED → ROUTE pipeline
 * 
 * This service is the brain of the routing system, coordinating:
 * - Content distillation (LLM enrichment)
 * - Vector embedding generation
 * - Deduplication checks
 * - Intelligent folder routing
 * - Dynamic folder creation triggers
 */

import { ConceptCandidate } from '../domain/ConceptCandidate';

/**
 * Individual folder placement decision
 */
export interface FolderPlacement {
  folderId: string;
  folderPath: string;
  confidence: number;
  type: 'primary' | 'reference';
  similarity: number;
  reason?: string;
}

/**
 * Routing decision with full explanation and multi-folder support
 */
export interface RoutingDecision {
  action: 'route' | 'unsorted' | 'duplicate' | 'create_folder' | 'review';
  
  // Backward compatibility - primary folder
  folderId?: string;
  
  // NEW: Multi-folder placements (primary + references)
  placements?: FolderPlacement[];
  
  duplicateId?: string;
  suggestedFolderName?: string;
  confidence: number;
  explanation: RoutingExplanation;
  timestamp: Date;
}

/**
 * Detailed explanation of routing decision
 */
export interface RoutingExplanation {
  primarySignal: string;
  similarConcepts: Array<{
    conceptId: string;
    title: string;
    similarity: number;
  }>;
  decisionFactors: string[];
  folderMatches?: Array<{
    folderId: string;
    score: number;
    conceptCount: number;
  }>;
}

/**
 * Batch routing for related concepts
 */
export interface BatchRoutingResult {
  decisions: RoutingDecision[];
  clusters: ConceptCluster[];
  suggestedFolders: FolderSuggestion[];
}

/**
 * Cluster of related concepts
 */
export interface ConceptCluster {
  concepts: string[];
  centroid: number[];
  coherence: number;
  suggestedAction: 'create_folder' | 'route_together' | 'review';
}

/**
 * Suggested new folder
 */
export interface FolderSuggestion {
  name: string;
  concepts: string[];
  parentFolderId?: string;
  confidence: number;
}

/**
 * Configuration for routing behavior
 */
export interface SmartRouterConfig {
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  newTopicThreshold: number;
  duplicateThreshold: number;
  minClusterSize: number;
  enableBatchClustering: boolean;
  enableFolderCreation: boolean;
}

/**
 * Interface for smart routing service
 */
export interface ISmartRouter {
  /**
   * Route a single concept through the pipeline
   */
  route(candidate: ConceptCandidate): Promise<RoutingDecision>;

  /**
   * Route multiple concepts with batch optimization
   */
  routeBatch(candidates: ConceptCandidate[]): Promise<BatchRoutingResult>;

  /**
   * Check if routing would create a new folder
   */
  checkExpansionOpportunity(candidate: ConceptCandidate): Promise<FolderSuggestion | null>;

  /**
   * Get routing statistics for monitoring
   */
  getRoutingStats(): Promise<{
    totalRouted: number;
    duplicatesFound: number;
    foldersCreated: number;
    unsortedCount: number;
    averageConfidence: number;
  }>;
}

/**
 * Error types for routing operations
 */
export class RoutingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RoutingError';
  }
}

export class RoutingPipelineError extends RoutingError {
  constructor(
    public readonly stage: 'distill' | 'embed' | 'route',
    message: string,
    cause?: Error
  ) {
    super(`Pipeline failed at ${stage}: ${message}`, cause);
    this.name = 'RoutingPipelineError';
  }
}