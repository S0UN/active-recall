/**
 * RoutingDecisionMaker - Service for making routing decisions
 * 
 * This service encapsulates all decision-making logic for concept routing.
 * It operates at a single level of abstraction, focusing solely on evaluating
 * options and making decisions based on confidence thresholds.
 */

import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { RoutingDecision, RoutingExplanation } from '../ISmartRouter';
import { PipelineConfig } from '../../config/PipelineConfig';
import { FolderMatch } from './FolderMatchingService';

export interface DecisionThresholds {
  highConfidence: number;
  lowConfidence: number;
  folderPlacement: number;
  crossLinkDelta: number;
  crossLinkMinimum: number;
}

export interface PlacementOption {
  path: string;
  confidence: number;
  type: 'primary' | 'secondary' | 'alternative';
}

export class RoutingDecisionMaker {
  private readonly thresholds: DecisionThresholds;

  constructor(config: PipelineConfig) {
    this.thresholds = {
      highConfidence: config.routing.highConfidenceThreshold,
      lowConfidence: config.routing.lowConfidenceThreshold,
      folderPlacement: config.routing.folderPlacementThreshold,
      crossLinkDelta: 0.1, // TODO: Add to config
      crossLinkMinimum: 0.6 // TODO: Add to config
    };
  }

  /**
   * Make a routing decision based on folder matches and confidence
   */
  async makeDecision(
    folderMatches: FolderMatch[],
    embeddings: VectorEmbeddings,
    distilled: DistilledContent
  ): Promise<RoutingDecision> {
    if (this.hasNoMatches(folderMatches)) {
      return this.createUnsortedDecision('No matching folders found');
    }

    const topMatch = folderMatches[0];

    if (this.isHighConfidence(topMatch.score)) {
      return this.createHighConfidenceDecision(topMatch, folderMatches);
    }

    if (this.isLowConfidence(topMatch.score)) {
      return this.createLowConfidenceDecision(folderMatches);
    }

    // Medium confidence - requires more nuanced decision
    return this.createMediumConfidenceDecision(topMatch, folderMatches, distilled);
  }

  /**
   * Determine folder placements based on scores
   */
  determinePlacements(folderMatches: FolderMatch[]): PlacementOption[] {
    const placements: PlacementOption[] = [];

    if (folderMatches.length === 0) {
      return placements;
    }

    // Primary placement
    const primary = folderMatches[0];
    placements.push({
      path: primary.folderId,
      confidence: primary.score,
      type: 'primary'
    });

    // Secondary placements (above threshold)
    for (let i = 1; i < folderMatches.length; i++) {
      const match = folderMatches[i];
      
      if (this.qualifiesForSecondaryPlacement(match.score, primary.score)) {
        placements.push({
          path: match.folderId,
          confidence: match.score,
          type: 'secondary'
        });
      } else if (this.qualifiesForAlternative(match.score)) {
        placements.push({
          path: match.folderId,
          confidence: match.score,
          type: 'alternative'
        });
      }
    }

    return placements;
  }

  private hasNoMatches(folderMatches: FolderMatch[]): boolean {
    return folderMatches.length === 0;
  }

  private isHighConfidence(score: number): boolean {
    return score >= this.thresholds.highConfidence;
  }

  private isLowConfidence(score: number): boolean {
    return score <= this.thresholds.lowConfidence;
  }

  private qualifiesForSecondaryPlacement(score: number, primaryScore: number): boolean {
    const delta = primaryScore - score;
    return score >= this.thresholds.folderPlacement && 
           delta <= this.thresholds.crossLinkDelta;
  }

  private qualifiesForAlternative(score: number): boolean {
    return score >= this.thresholds.crossLinkMinimum;
  }

  private createHighConfidenceDecision(
    topMatch: FolderMatch,
    allMatches: FolderMatch[]
  ): RoutingDecision {
    const placements = this.determinePlacements(allMatches);
    
    return {
      action: 'route',
      folderId: topMatch.folderId,
      confidence: topMatch.score,
      explanation: this.buildHighConfidenceExplanation(topMatch, placements),
      crossLinks: this.extractCrossLinks(placements),
      timestamp: new Date()
    };
  }

  private createMediumConfidenceDecision(
    topMatch: FolderMatch,
    allMatches: FolderMatch[],
    distilled: DistilledContent
  ): RoutingDecision {
    const placements = this.determinePlacements(allMatches);
    
    return {
      action: 'route',
      folderId: topMatch.folderId,
      confidence: topMatch.score,
      explanation: this.buildMediumConfidenceExplanation(topMatch, placements, distilled),
      crossLinks: this.extractCrossLinks(placements),
      requiresReview: true,
      timestamp: new Date()
    };
  }

  private createLowConfidenceDecision(folderMatches: FolderMatch[]): RoutingDecision {
    return this.createUnsortedDecision('Low confidence matches only');
  }

  private createUnsortedDecision(reason: string): RoutingDecision {
    return {
      action: 'unsorted',
      confidence: 0,
      explanation: this.buildUnsortedExplanation(reason),
      timestamp: new Date()
    };
  }

  private buildHighConfidenceExplanation(
    topMatch: FolderMatch,
    placements: PlacementOption[]
  ): RoutingExplanation {
    const confidencePercentage = Math.round(topMatch.score * 100);
    
    return {
      primarySignal: `High confidence match (${confidencePercentage}%)`,
      folderMatches: this.formatFolderMatches([topMatch]),
      decisionFactors: [
        `Primary folder: ${topMatch.folderId}`,
        `Match strength: ${topMatch.score.toFixed(3)}`,
        `Similar concepts found: ${topMatch.conceptCount}`,
        ...this.formatPlacementFactors(placements)
      ]
    };
  }

  private buildMediumConfidenceExplanation(
    topMatch: FolderMatch,
    placements: PlacementOption[],
    distilled: DistilledContent
  ): RoutingExplanation {
    const confidencePercentage = Math.round(topMatch.score * 100);
    
    return {
      primarySignal: `Medium confidence match (${confidencePercentage}%) - review recommended`,
      folderMatches: this.formatFolderMatches([topMatch]),
      decisionFactors: [
        `Concept: "${distilled.title}"`,
        `Best match: ${topMatch.folderId}`,
        `Confidence below high threshold (${this.thresholds.highConfidence})`,
        ...this.formatPlacementFactors(placements)
      ]
    };
  }

  private buildUnsortedExplanation(reason: string): RoutingExplanation {
    return {
      primarySignal: 'Routing to unsorted folder',
      folderMatches: [],
      decisionFactors: [reason]
    };
  }

  private formatFolderMatches(matches: FolderMatch[]): Array<{
    folderId: string;
    score: number;
    conceptCount: number;
  }> {
    return matches.map(match => ({
      folderId: match.folderId,
      score: match.score,
      conceptCount: match.conceptCount
    }));
  }

  private formatPlacementFactors(placements: PlacementOption[]): string[] {
    const factors: string[] = [];
    
    const secondaryPlacements = placements.filter(p => p.type === 'secondary');
    if (secondaryPlacements.length > 0) {
      factors.push(`Secondary placements: ${secondaryPlacements.map(p => p.path).join(', ')}`);
    }

    const alternatives = placements.filter(p => p.type === 'alternative');
    if (alternatives.length > 0) {
      factors.push(`Alternative options: ${alternatives.length}`);
    }

    return factors;
  }

  private extractCrossLinks(placements: PlacementOption[]): string[] {
    return placements
      .filter(p => p.type === 'secondary')
      .map(p => p.path);
  }
}