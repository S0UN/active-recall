/**
 * IRoutingDecisionMaker - Decision logic for routing concepts to folders
 * 
 * Extracts routing decision logic from SmartRouter to follow SRP.
 * Pure decision-making without side effects.
 */

import { DistilledContent, VectorEmbeddings } from '../contracts/schemas';
import { SimilarConcept } from './IVectorIndexManager';

export interface FolderMatch {
  readonly folderId: string;
  readonly score: number;
  readonly conceptCount: number;
  readonly similarConcepts: SimilarConcept[];
}

export interface RoutingThresholds {
  readonly highConfidence: number;
  readonly lowConfidence: number;
  readonly newTopic: number;
  readonly duplicate: number;
}

export interface RoutingDecision {
  readonly action: 'route' | 'duplicate' | 'unsorted' | 'review';
  readonly folderId?: string;
  readonly duplicateId?: string;
  readonly confidence: number;
  readonly explanation: RoutingExplanation;
  readonly crossLinks?: any[]; // TODO: Define proper CrossLink interface
  readonly requiresReview?: boolean;
  readonly timestamp: Date;
}

export interface RoutingExplanation {
  readonly primarySignal: string;
  readonly similarConcepts: ConceptSummary[];
  readonly decisionFactors: string[];
  readonly folderMatches?: FolderMatch[];
}

export interface ConceptSummary {
  readonly conceptId: string;
  readonly title: string;
  readonly similarity: number;
}

export interface DecisionContext {
  readonly folderMatches: FolderMatch[];
  readonly embeddings: VectorEmbeddings;
  readonly distilled: DistilledContent;
  readonly thresholds: RoutingThresholds;
}

export interface IRoutingDecisionMaker {
  /**
   * Make routing decision based on folder matches and confidence
   * Pure function - no side effects
   */
  makeRoutingDecision(context: DecisionContext): RoutingDecision;

  /**
   * Determine if concept should be routed to unsorted folder
   * Pure predicate function
   */
  shouldRouteToUnsorted(
    bestMatch: FolderMatch | null, 
    confidence: number, 
    thresholds: RoutingThresholds
  ): boolean;

  /**
   * Determine if concept should be routed directly to folder
   * Pure predicate function
   */
  shouldRouteDirectly(confidence: number, thresholds: RoutingThresholds): boolean;

  /**
   * Determine if concept should be sent for manual review
   * Pure predicate function
   */
  shouldRequestReview(confidence: number, thresholds: RoutingThresholds): boolean;

  /**
   * Build explanation for routing decision
   * Pure function generating explanation text
   */
  buildRoutingExplanation(
    decision: 'route' | 'duplicate' | 'unsorted' | 'review',
    context: DecisionContext
  ): RoutingExplanation;
}