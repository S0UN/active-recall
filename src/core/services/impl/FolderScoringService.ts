/**
 * FolderScoringService - Dedicated service for folder scoring calculations
 * 
 * This service encapsulates all folder scoring logic, making it easier to
 * understand, test, and modify scoring algorithms. It operates at a single
 * level of abstraction, focusing on scoring calculations only.
 */

import { SimilarConcept } from '../IVectorIndexManager';
import { PipelineConfig } from '../../config/PipelineConfig';
import { VectorMathOperations } from '../../utils/VectorMathOperations';

export interface FolderScore {
  folderId: string;
  totalScore: number;
  averageSimilarity: number;
  maximumSimilarity: number;
  countBonus: number;
  conceptCount: number;
}

export interface ScoringWeights {
  averageSimilarityWeight: number;
  maximumSimilarityWeight: number;
  countBonusWeight: number;
}

export class FolderScoringService {
  private readonly scoringWeights: ScoringWeights;
  private readonly countBonusMultiplier: number;
  private readonly maximumCountBonus: number;

  constructor(config: PipelineConfig) {
    this.scoringWeights = {
      averageSimilarityWeight: config.folderScoring.avgSimilarityWeight || 0.6,
      maximumSimilarityWeight: config.folderScoring.maxSimilarityWeight || 0.2,
      countBonusWeight: 0.2 // Default value since it's not in config
    };
    this.countBonusMultiplier = config.folderScoring.countBonusMultiplier || 0.1;
    this.maximumCountBonus = config.folderScoring.maxCountBonus || 0.3;
  }

  /**
   * Score multiple folders based on their similar concepts
   */
  scoreFolders(folderGroups: Map<string, SimilarConcept[]>): FolderScore[] {
    const scores: FolderScore[] = [];

    for (const [folderId, concepts] of folderGroups.entries()) {
      scores.push(this.scoreFolder(folderId, concepts));
    }

    return this.sortByTotalScore(scores);
  }

  /**
   * Calculate comprehensive score for a single folder
   */
  scoreFolder(folderId: string, concepts: SimilarConcept[]): FolderScore {
    if (this.isEmpty(concepts)) {
      return this.createEmptyScore(folderId);
    }

    const similarities = concepts.map(c => c.similarity);
    const averageSimilarity = VectorMathOperations.calculateAverageSimilarity(similarities);
    const maximumSimilarity = VectorMathOperations.findMaximum(similarities);
    const countBonus = this.calculateCountBonus(concepts.length);

    const totalScore = this.calculateTotalScore(
      averageSimilarity,
      maximumSimilarity,
      countBonus
    );

    return {
      folderId,
      totalScore,
      averageSimilarity,
      maximumSimilarity,
      countBonus,
      conceptCount: concepts.length
    };
  }

  /**
   * Group concepts by their folder ID
   */
  groupConceptsByFolder(concepts: SimilarConcept[]): Map<string, SimilarConcept[]> {
    const groups = new Map<string, SimilarConcept[]>();

    for (const concept of concepts) {
      const folderId = concept.folderId || 'unsorted';
      const existing = groups.get(folderId) || [];
      existing.push(concept);
      groups.set(folderId, existing);
    }

    return groups;
  }

  /**
   * Determine if a score indicates high confidence
   */
  isHighConfidence(score: number, threshold: number): boolean {
    return score >= threshold;
  }

  /**
   * Determine if a score indicates low confidence
   */
  isLowConfidence(score: number, threshold: number): boolean {
    return score <= threshold;
  }

  /**
   * Calculate the confidence delta between two scores
   */
  calculateConfidenceDelta(primaryScore: number, secondaryScore: number): number {
    return primaryScore - secondaryScore;
  }

  private isEmpty(concepts: SimilarConcept[]): boolean {
    return concepts.length === 0;
  }

  private createEmptyScore(folderId: string): FolderScore {
    return {
      folderId,
      totalScore: 0,
      averageSimilarity: 0,
      maximumSimilarity: 0,
      countBonus: 0,
      conceptCount: 0
    };
  }

  private calculateCountBonus(conceptCount: number): number {
    const rawBonus = conceptCount * this.countBonusMultiplier;
    return Math.min(rawBonus, this.maximumCountBonus);
  }

  private calculateTotalScore(
    averageSimilarity: number,
    maximumSimilarity: number,
    countBonus: number
  ): number {
    const weightedAverage = averageSimilarity * this.scoringWeights.averageSimilarityWeight;
    const weightedMaximum = maximumSimilarity * this.scoringWeights.maximumSimilarityWeight;

    // Original behavior: countBonus was added directly without additional weighting
    return weightedAverage + weightedMaximum + countBonus;
  }

  private sortByTotalScore(scores: FolderScore[]): FolderScore[] {
    return scores.sort((a, b) => b.totalScore - a.totalScore);
  }
}