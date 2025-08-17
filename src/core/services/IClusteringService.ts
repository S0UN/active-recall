/**
 * IClusteringService - Pure clustering algorithms for concept vectors
 * 
 * Provides mathematical clustering operations without side effects.
 * Follows SRP by focusing solely on clustering logic.
 */

import { VectorEmbeddings } from '../contracts/schemas';

export interface ConceptCluster {
  readonly concepts: string[];
  readonly centroid: number[];
  readonly coherence: number;
  readonly suggestedAction: 'create_folder' | 'route_together';
}

export interface ClusteringConfig {
  readonly similarityThreshold: number;
  readonly minimumClusterSize: number;
  readonly maximumClusterSize: number;
}

export interface SimilarityCalculation {
  readonly similarity: number;
  readonly conceptPair: [number, number];
}

export interface IClusteringService {
  /**
   * Find clusters within a batch of concept embeddings
   * Pure function - no side effects
   */
  findClusters(
    embeddings: VectorEmbeddings[], 
    config: ClusteringConfig
  ): ConceptCluster[];

  /**
   * Calculate coherence score for a group of vectors
   * Higher score indicates more cohesive cluster
   */
  calculateCoherence(vectors: number[][]): number;

  /**
   * Calculate centroid vector from multiple vectors
   * Returns average position in vector space
   */
  calculateCentroid(vectors: number[][]): number[];

  /**
   * Calculate cosine similarity between two vectors
   * Pure mathematical function
   */
  calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number;

  /**
   * Determine suggested action for cluster based on size and coherence
   */
  determineSuggestedAction(
    clusterSize: number, 
    coherence: number, 
    config: ClusteringConfig
  ): 'create_folder' | 'route_together';
}