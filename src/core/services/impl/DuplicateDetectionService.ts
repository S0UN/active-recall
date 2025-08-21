/**
 * DuplicateDetectionService - Specialized service for duplicate detection
 * 
 * This service follows the Single Responsibility Principle by focusing solely
 * on duplicate detection logic. It encapsulates all duplicate-related operations,
 * making the code more maintainable and testable.
 */

import { VectorEmbeddings } from '../../contracts/schemas';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { RoutingDecision, RoutingExplanation } from '../ISmartRouter';
import { PipelineConfig } from '../../config/PipelineConfig';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicate?: SimilarConcept;
  decision?: RoutingDecision;
}

export class DuplicateDetectionService {
  private readonly duplicateThreshold: number;
  private readonly titleSearchLimit: number;

  constructor(
    private readonly vectorIndex: IVectorIndexManager,
    config: PipelineConfig
  ) {
    this.duplicateThreshold = config.routing.duplicateThreshold;
    this.titleSearchLimit = config.vector.titleSearchLimit;
  }

  /**
   * Check if the given embeddings represent a duplicate of existing content
   */
  async checkForDuplicates(embeddings: VectorEmbeddings): Promise<DuplicateCheckResult> {
    const searchResults = await this.searchForSimilarTitles(embeddings);

    if (!this.hasDuplicates(searchResults)) {
      return { isDuplicate: false };
    }

    const duplicate = searchResults[0];
    const decision = this.createDuplicateDecision(duplicate);

    return {
      isDuplicate: true,
      duplicate,
      decision
    };
  }

  /**
   * Create a routing decision for a detected duplicate
   */
  createDuplicateDecision(duplicate: SimilarConcept): RoutingDecision {
    return {
      action: 'duplicate',
      duplicateId: duplicate.conceptId,
      confidence: duplicate.similarity,
      explanation: this.buildDuplicateExplanation(duplicate),
      timestamp: new Date()
    };
  }

  /**
   * Determine if two concepts are duplicates based on similarity
   */
  areDuplicates(similarity: number): boolean {
    return similarity >= this.duplicateThreshold;
  }

  /**
   * Extract similarity percentage for display
   */
  formatSimilarityPercentage(similarity: number): string {
    const percentage = Math.round(similarity * 100);
    return `${percentage}%`;
  }

  private async searchForSimilarTitles(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    return await this.vectorIndex.searchByTitle({
      vector: embeddings.vector,
      threshold: this.duplicateThreshold,
      limit: this.titleSearchLimit
    });
  }

  private hasDuplicates(searchResults: SimilarConcept[]): boolean {
    return searchResults.length > 0;
  }

  private buildDuplicateExplanation(duplicate: SimilarConcept): RoutingExplanation {
    const similarityText = this.formatSimilarityPercentage(duplicate.similarity);
    const similarityDecimal = duplicate.similarity.toFixed(3);

    return {
      primarySignal: `Duplicate of existing concept (${similarityText} similar)`,
      similarConcepts: [{
        conceptId: duplicate.conceptId,
        title: 'Duplicate concept',
        similarity: duplicate.similarity
      }],
      decisionFactors: [`Title similarity: ${similarityDecimal}`]
    };
  }
}