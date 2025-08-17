/**
 * ScoringUtilities - Pure mathematical functions for scoring calculations
 * 
 * Contains only pure functions without side effects.
 * Follows functional programming principles for predictability and testability.
 */

import { SimilarConcept } from '../services/IVectorIndexManager';

export interface ScoreComponent {
  readonly weight: number;
  readonly value: number;
  readonly name: string;
}

export interface ScoringWeights {
  readonly averageSimilarity: number;
  readonly maximumSimilarity: number;
  readonly countBonus: number;
}

export interface ScoringLimits {
  readonly maximumCountBonus: number;
  readonly countBonusMultiplier: number;
}

export class ScoringUtilities {
  private static readonly ZERO_CONCEPTS_SCORE = 0;
  private static readonly MINIMUM_SIMILARITY = 0;
  private static readonly MAXIMUM_SIMILARITY = 1;

  /**
   * Calculate average similarity from array of similar concepts
   * Pure function - no side effects
   */
  static calculateAverageSimilarity(concepts: SimilarConcept[]): number {
    if (ScoringUtilities.hasNoConcepts(concepts)) {
      return ScoringUtilities.ZERO_CONCEPTS_SCORE;
    }
    
    const totalSimilarity = concepts.reduce((sum, concept) => sum + concept.similarity, 0);
    return totalSimilarity / concepts.length;
  }

  /**
   * Find maximum similarity value from array of concepts
   * Pure function returning single maximum value
   */
  static findMaximumSimilarity(concepts: SimilarConcept[]): number {
    if (ScoringUtilities.hasNoConcepts(concepts)) {
      return ScoringUtilities.MINIMUM_SIMILARITY;
    }
    
    return Math.max(...concepts.map(concept => concept.similarity));
  }

  /**
   * Calculate count-based bonus score with configured limits
   * Pure mathematical calculation
   */
  static calculateConceptCountBonus(
    conceptCount: number, 
    limits: ScoringLimits
  ): number {
    const rawBonus = conceptCount * limits.countBonusMultiplier;
    return Math.min(rawBonus, limits.maximumCountBonus);
  }

  /**
   * Combine multiple score components with their weights
   * Pure function for weighted score calculation
   */
  static combineWeightedScoreComponents(components: ScoreComponent[]): number {
    return components.reduce((total, component) => {
      return total + (component.value * component.weight);
    }, 0);
  }

  /**
   * Calculate folder score using weighted components
   * Combines average similarity, max similarity, and count bonus
   */
  static calculateFolderScore(
    concepts: SimilarConcept[],
    weights: ScoringWeights,
    limits: ScoringLimits
  ): number {
    if (ScoringUtilities.hasNoConcepts(concepts)) {
      return ScoringUtilities.ZERO_CONCEPTS_SCORE;
    }

    const components: ScoreComponent[] = [
      {
        name: 'average_similarity',
        value: ScoringUtilities.calculateAverageSimilarity(concepts),
        weight: weights.averageSimilarity
      },
      {
        name: 'maximum_similarity', 
        value: ScoringUtilities.findMaximumSimilarity(concepts),
        weight: weights.maximumSimilarity
      },
      {
        name: 'count_bonus',
        value: ScoringUtilities.calculateConceptCountBonus(concepts.length, limits),
        weight: weights.countBonus
      }
    ];

    return ScoringUtilities.combineWeightedScoreComponents(components);
  }

  /**
   * Normalize score to be within valid range [0, 1]
   * Ensures score values remain predictable
   */
  static normalizeScore(score: number): number {
    return Math.max(
      ScoringUtilities.MINIMUM_SIMILARITY, 
      Math.min(score, ScoringUtilities.MAXIMUM_SIMILARITY)
    );
  }

  /**
   * Calculate confidence percentage from similarity score
   * Pure conversion function
   */
  static calculateConfidencePercentage(similarity: number): number {
    const normalizedSimilarity = ScoringUtilities.normalizeScore(similarity);
    return Math.round(normalizedSimilarity * 100);
  }

  /**
   * Format score to specified decimal places
   * Pure formatting function
   */
  static formatScoreToDecimalPlaces(score: number, decimalPlaces: number): string {
    return score.toFixed(decimalPlaces);
  }

  /**
   * Determine if score meets minimum threshold
   * Pure predicate function
   */
  static meetsMinimumThreshold(score: number, threshold: number): boolean {
    return score >= threshold;
  }

  /**
   * Calculate score difference between two values
   * Pure mathematical operation
   */
  static calculateScoreDifference(scoreA: number, scoreB: number): number {
    return Math.abs(scoreA - scoreB);
  }

  /**
   * Check if concept array is empty
   * Private utility for input validation
   */
  private static hasNoConcepts(concepts: SimilarConcept[]): boolean {
    return concepts.length === 0;
  }
}