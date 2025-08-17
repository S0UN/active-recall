/**
 * ConceptRoutingDecisionMaker - Pure routing decision logic
 * 
 * Implements routing decision algorithms without side effects.
 * Extracted from SmartRouter to follow Single Responsibility Principle.
 */

import {
  IRoutingDecisionMaker,
  FolderMatch,
  RoutingThresholds,
  RoutingDecision,
  RoutingExplanation,
  DecisionContext,
  ConceptSummary
} from '../IRoutingDecisionMaker';
import { ScoringUtilities } from '../../utils/ScoringUtilities';

export class ConceptRoutingDecisionMaker implements IRoutingDecisionMaker {
  private static readonly DECIMAL_PLACES_FOR_SCORES = 3;
  private static readonly MAX_SIMILAR_CONCEPTS_TO_SHOW = 5;
  private static readonly MAX_FOLDER_MATCHES_TO_SHOW = 3;

  makeRoutingDecision(context: DecisionContext): RoutingDecision {
    const bestMatch = this.getBestFolderMatch(context.folderMatches);
    const confidence = this.calculateConfidenceScore(bestMatch);
    
    if (this.shouldRouteToUnsorted(bestMatch, confidence, context.thresholds)) {
      return this.createUnsortedDecision(context, confidence);
    }

    if (this.shouldRouteDirectly(confidence, context.thresholds)) {
      return this.createDirectRouteDecision(bestMatch!, context, confidence);
    }

    if (this.shouldRequestReview(confidence, context.thresholds)) {
      return this.createReviewDecision(context, confidence);
    }

    return this.createUnsortedDecision(context, confidence);
  }

  shouldRouteToUnsorted(
    bestMatch: FolderMatch | null,
    confidence: number,
    thresholds: RoutingThresholds
  ): boolean {
    return this.hasNoValidMatch(bestMatch) || 
           this.confidenceIsBelowNewTopicThreshold(confidence, thresholds);
  }

  shouldRouteDirectly(confidence: number, thresholds: RoutingThresholds): boolean {
    return confidence >= thresholds.highConfidence;
  }

  shouldRequestReview(confidence: number, thresholds: RoutingThresholds): boolean {
    return confidence >= thresholds.lowConfidence;
  }

  buildRoutingExplanation(
    decision: 'route' | 'duplicate' | 'unsorted' | 'review',
    context: DecisionContext
  ): RoutingExplanation {
    switch (decision) {
      case 'route':
        return this.buildDirectRouteExplanation(context);
      case 'duplicate':
        return this.buildDuplicateExplanation(context);
      case 'unsorted':
        return this.buildUnsortedExplanation(context);
      case 'review':
        return this.buildReviewExplanation(context);
    }
  }

  private getBestFolderMatch(folderMatches: FolderMatch[]): FolderMatch | null {
    return folderMatches[0] || null;
  }

  private calculateConfidenceScore(match: FolderMatch | null): number {
    return match?.score || 0;
  }

  private hasNoValidMatch(match: FolderMatch | null): boolean {
    return match === null;
  }

  private confidenceIsBelowNewTopicThreshold(
    confidence: number,
    thresholds: RoutingThresholds
  ): boolean {
    return confidence < thresholds.newTopic;
  }

  private createDirectRouteDecision(
    match: FolderMatch,
    context: DecisionContext,
    confidence: number
  ): RoutingDecision {
    return {
      action: 'route',
      folderId: match.folderId,
      confidence,
      explanation: this.buildDirectRouteExplanation(context),
      timestamp: new Date()
    };
  }

  private createUnsortedDecision(
    context: DecisionContext,
    confidence: number
  ): RoutingDecision {
    return {
      action: 'unsorted',
      confidence,
      explanation: this.buildUnsortedExplanation(context),
      timestamp: new Date()
    };
  }

  private createReviewDecision(
    context: DecisionContext,
    confidence: number
  ): RoutingDecision {
    return {
      action: 'review',
      confidence,
      explanation: this.buildReviewExplanation(context),
      timestamp: new Date()
    };
  }

  private buildDirectRouteExplanation(context: DecisionContext): RoutingExplanation {
    const bestMatch = this.getBestFolderMatch(context.folderMatches)!;
    
    return {
      primarySignal: 'High confidence match found',
      similarConcepts: this.extractTopSimilarConcepts(bestMatch.similarConcepts),
      decisionFactors: this.buildDirectRouteDecisionFactors(bestMatch),
      folderMatches: [bestMatch]
    };
  }

  private buildUnsortedExplanation(context: DecisionContext): RoutingExplanation {
    const bestMatch = this.getBestFolderMatch(context.folderMatches);
    const reason = this.determineUnsortedReason(bestMatch, context.thresholds);
    
    return {
      primarySignal: reason,
      similarConcepts: [],
      decisionFactors: this.buildUnsortedDecisionFactors(context),
      folderMatches: this.getTopFolderMatches(context.folderMatches)
    };
  }

  private buildReviewExplanation(context: DecisionContext): RoutingExplanation {
    const bestMatch = this.getBestFolderMatch(context.folderMatches)!;
    
    return {
      primarySignal: 'Ambiguous match requires manual review',
      similarConcepts: this.extractTopSimilarConcepts(bestMatch.similarConcepts),
      decisionFactors: this.buildReviewDecisionFactors(context),
      folderMatches: this.getTopFolderMatches(context.folderMatches)
    };
  }

  private buildDuplicateExplanation(context: DecisionContext): RoutingExplanation {
    return {
      primarySignal: 'Duplicate content detected',
      similarConcepts: [],
      decisionFactors: ['Content hash match detected'],
      folderMatches: []
    };
  }

  private extractTopSimilarConcepts(concepts: any[]): ConceptSummary[] {
    return concepts
      .slice(0, ConceptRoutingDecisionMaker.MAX_SIMILAR_CONCEPTS_TO_SHOW)
      .map(concept => ({
        conceptId: concept.conceptId,
        title: 'Similar concept',
        similarity: concept.similarity
      }));
  }

  private buildDirectRouteDecisionFactors(match: FolderMatch): string[] {
    const averageSimilarity = ScoringUtilities.calculateAverageSimilarity(match.similarConcepts);
    
    return [
      `Folder score: ${ScoringUtilities.formatScoreToDecimalPlaces(match.score, ConceptRoutingDecisionMaker.DECIMAL_PLACES_FOR_SCORES)}`,
      `Similar concepts: ${match.conceptCount}`,
      `Average similarity: ${ScoringUtilities.formatScoreToDecimalPlaces(averageSimilarity, ConceptRoutingDecisionMaker.DECIMAL_PLACES_FOR_SCORES)}`
    ];
  }

  private buildUnsortedDecisionFactors(context: DecisionContext): string[] {
    const bestMatch = this.getBestFolderMatch(context.folderMatches);
    const bestScore = bestMatch?.score || 0;
    
    return [
      `Best score: ${ScoringUtilities.formatScoreToDecimalPlaces(bestScore, ConceptRoutingDecisionMaker.DECIMAL_PLACES_FOR_SCORES)}`,
      `Threshold not met: < ${context.thresholds.lowConfidence}`
    ];
  }

  private buildReviewDecisionFactors(context: DecisionContext): string[] {
    const bestMatch = this.getBestFolderMatch(context.folderMatches)!;
    const viableCandidatesCount = this.countViableFolderCandidates(context.folderMatches, context.thresholds);
    
    return [
      `Score in ambiguous range: ${ScoringUtilities.formatScoreToDecimalPlaces(bestMatch.score, ConceptRoutingDecisionMaker.DECIMAL_PLACES_FOR_SCORES)}`,
      `Multiple viable candidates: ${viableCandidatesCount}`
    ];
  }

  private determineUnsortedReason(
    bestMatch: FolderMatch | null,
    thresholds: RoutingThresholds
  ): string {
    if (this.hasNoValidMatch(bestMatch)) {
      return 'No suitable folder found';
    }
    
    if (this.confidenceIsBelowNewTopicThreshold(bestMatch!.score, thresholds)) {
      return 'Confidence below new topic threshold';
    }
    
    return 'Low confidence match';
  }

  private getTopFolderMatches(matches: FolderMatch[]): FolderMatch[] {
    return matches.slice(0, ConceptRoutingDecisionMaker.MAX_FOLDER_MATCHES_TO_SHOW);
  }

  private countViableFolderCandidates(
    matches: FolderMatch[], 
    thresholds: RoutingThresholds
  ): number {
    return matches.filter(match => 
      ScoringUtilities.meetsMinimumThreshold(match.score, thresholds.lowConfidence)
    ).length;
  }
}