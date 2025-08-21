/**
 * FolderMatchingService - Service for finding and matching folders
 * 
 * This service encapsulates all folder matching logic, operating at a single
 * level of abstraction. It handles vector search and folder scoring without
 * mixing in unrelated concerns.
 */

import { VectorEmbeddings } from '../../contracts/schemas';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { PipelineConfig } from '../../config/PipelineConfig';
import { FolderScoringService, FolderScore } from './FolderScoringService';

export interface FolderMatch {
  folderId: string;
  score: number;
  conceptCount: number;
  averageSimilarity: number;
  maximumSimilarity: number;
  similarConcepts: SimilarConcept[];
}

export class FolderMatchingService {
  private readonly lowConfidenceThreshold: number;
  private readonly contextSearchLimit: number;
  private readonly scoringService: FolderScoringService;

  constructor(
    private readonly vectorIndex: IVectorIndexManager,
    config: PipelineConfig
  ) {
    this.lowConfidenceThreshold = config.routing.lowConfidenceThreshold;
    this.contextSearchLimit = config.vector.contextSearchLimit;
    this.scoringService = new FolderScoringService(config);
  }

  /**
   * Find the best matching folders for the given embeddings
   */
  async findBestFolders(embeddings: VectorEmbeddings): Promise<FolderMatch[]> {
    // Search for similar concepts in existing folders
    const similarConcepts = await this.searchSimilarConcepts(embeddings);

    // Group concepts by folder
    const folderGroups = this.scoringService.groupConceptsByFolder(similarConcepts);

    // Score each folder
    const folderScores = this.scoringService.scoreFolders(folderGroups);

    // Convert to folder matches with full details
    return this.createFolderMatches(folderScores, folderGroups);
  }

  /**
   * Search for concepts similar to unsorted content
   */
  async findUnsortedSimilar(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    const searchOptions = {
      vector: embeddings.vector,
      threshold: this.lowConfidenceThreshold,
      limit: this.contextSearchLimit,
      filterByFolder: 'unsorted'
    };

    return await this.vectorIndex.searchByContext(searchOptions);
  }

  /**
   * Get folder statistics for decision making
   */
  async getFolderStatistics(folderId: string): Promise<{
    conceptCount: number;
    averageConfidence: number;
    lastUpdated: Date;
  }> {
    const members = await this.vectorIndex.getFolderMembers(folderId, 1000);
    
    if (members.length === 0) {
      return {
        conceptCount: 0,
        averageConfidence: 0,
        lastUpdated: new Date()
      };
    }

    const totalConfidence = members.reduce((sum, member) => sum + (member.confidence || 0), 0);
    
    return {
      conceptCount: members.length,
      averageConfidence: totalConfidence / members.length,
      lastUpdated: new Date()
    };
  }

  private async searchSimilarConcepts(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    const searchOptions = {
      vector: embeddings.vector,
      threshold: this.lowConfidenceThreshold,
      limit: this.contextSearchLimit
    };

    return await this.vectorIndex.searchByContext(searchOptions);
  }

  private createFolderMatches(
    folderScores: FolderScore[],
    folderGroups: Map<string, SimilarConcept[]>
  ): FolderMatch[] {
    return folderScores.map(score => {
      const concepts = folderGroups.get(score.folderId) || [];
      
      return {
        folderId: score.folderId,
        score: score.totalScore,
        conceptCount: score.conceptCount,
        averageSimilarity: score.averageSimilarity,
        maximumSimilarity: score.maximumSimilarity,
        similarConcepts: concepts
      };
    });
  }
}