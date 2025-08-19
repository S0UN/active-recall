/**
 * VectorClusteringService - Mathematical clustering implementation
 * 
 * Pure clustering algorithms extracted from SmartRouter to follow SRP.
 * All methods are pure functions without side effects.
 */

import { VectorEmbeddings } from '../../contracts/schemas';
import { 
  IClusteringService, 
  ConceptCluster, 
  ClusteringConfig,
  SimilarityCalculation 
} from '../IClusteringService';

export class VectorClusteringService implements IClusteringService {
  private static readonly MINIMUM_COHERENCE_THRESHOLD = 0.1;
  private static readonly ZERO_VECTORS_COUNT = 0;
  private static readonly SINGLE_VECTOR_COHERENCE = 1.0;
  private static readonly NO_SIMILARITY = 0.0;

  findClusters(
    embeddings: VectorEmbeddings[], 
    config: ClusteringConfig
  ): ConceptCluster[] {
    if (embeddings.length < 2) {
      return [];
    }

    const clusterGroups = this.identifyClusterGroups(embeddings, config);
    return this.buildClusterObjects(clusterGroups, embeddings, config);
  }

  calculateCoherence(vectors: number[][]): number {
    if (vectors.length < 2) {
      return VectorClusteringService.SINGLE_VECTOR_COHERENCE;
    }

    const similarities = this.calculateAllPairwiseSimilarities(vectors);
    return this.calculateAverageCoherence(similarities);
  }

  calculateCentroid(vectors: number[][]): number[] {
    if (vectors.length === VectorClusteringService.ZERO_VECTORS_COUNT) {
      return [];
    }

    const dimensions = vectors[0].length;
    const centroid = this.initializeZeroVector(dimensions);
    
    this.accumulateVectorSums(vectors, centroid);
    this.averageVectorComponents(centroid, vectors.length);
    
    return centroid;
  }

  calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (this.areVectorsIncompatible(vectorA, vectorB)) {
      return VectorClusteringService.NO_SIMILARITY;
    }

    const dotProduct = this.calculateDotProduct(vectorA, vectorB);
    const magnitudeA = this.calculateVectorMagnitude(vectorA);
    const magnitudeB = this.calculateVectorMagnitude(vectorB);
    
    return this.computeCosineSimilarity(dotProduct, magnitudeA, magnitudeB);
  }

  determineSuggestedAction(
    clusterSize: number, 
    coherence: number, 
    config: ClusteringConfig
  ): 'create_folder' | 'route_together' {
    const isLargeEnoughForFolder = clusterSize >= config.minimumClusterSize;
    const isCoherent = coherence >= VectorClusteringService.MINIMUM_COHERENCE_THRESHOLD;
    
    return isLargeEnoughForFolder && isCoherent ? 'create_folder' : 'route_together';
  }

  private identifyClusterGroups(
    embeddings: VectorEmbeddings[], 
    config: ClusteringConfig
  ): number[][] {
    const visited = new Set<number>();
    const clusters: number[][] = [];
    
    for (let i = 0; i < embeddings.length; i++) {
      if (visited.has(i)) continue;
      
      const cluster = this.buildClusterStartingFrom(i, embeddings, config, visited);
      if (this.isClusterViable(cluster)) {
        clusters.push(cluster);
      }
    }
    
    return clusters;
  }

  private buildClusterStartingFrom(
    startIndex: number,
    embeddings: VectorEmbeddings[],
    config: ClusteringConfig,
    visited: Set<number>
  ): number[] {
    const cluster = [startIndex];
    visited.add(startIndex);
    
    for (let j = startIndex + 1; j < embeddings.length; j++) {
      if (visited.has(j)) continue;
      
      const similarity = this.calculateCosineSimilarity(
        embeddings[startIndex].vector,
        embeddings[j].vector
      );
      
      if (this.exceedsSimilarityThreshold(similarity, config)) {
        cluster.push(j);
        visited.add(j);
      }
    }
    
    return cluster;
  }

  private buildClusterObjects(
    clusterGroups: number[][],
    embeddings: VectorEmbeddings[],
    config: ClusteringConfig
  ): ConceptCluster[] {
    return clusterGroups.map(group => {
      const vectors = group.map(index => embeddings[index].vector);
      const coherence = this.calculateCoherence(vectors);
      const centroid = this.calculateCentroid(vectors);
      const suggestedAction = this.determineSuggestedAction(group.length, coherence, config);
      
      return {
        concepts: group.map(index => `concept-${index}`),
        centroid,
        coherence,
        suggestedAction
      };
    });
  }

  private calculateAllPairwiseSimilarities(vectors: number[][]): number[] {
    const similarities: number[] = [];
    
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const similarity = this.calculateCosineSimilarity(vectors[i], vectors[j]);
        similarities.push(similarity);
      }
    }
    
    return similarities;
  }

  private calculateAverageCoherence(similarities: number[]): number {
    if (similarities.length === VectorClusteringService.ZERO_VECTORS_COUNT) {
      return VectorClusteringService.NO_SIMILARITY;
    }
    
    const totalSimilarity = similarities.reduce((sum, sim) => sum + sim, 0);
    return totalSimilarity / similarities.length;
  }

  private initializeZeroVector(dimensions: number): number[] {
    return new Array(dimensions).fill(0);
  }

  private accumulateVectorSums(vectors: number[][], centroid: number[]): void {
    for (const vector of vectors) {
      for (let i = 0; i < vector.length; i++) {
        centroid[i] += vector[i];
      }
    }
  }

  private averageVectorComponents(centroid: number[], vectorCount: number): void {
    for (let i = 0; i < centroid.length; i++) {
      centroid[i] /= vectorCount;
    }
  }

  private areVectorsIncompatible(vectorA: number[], vectorB: number[]): boolean {
    return vectorA.length !== vectorB.length || 
           vectorA.length === VectorClusteringService.ZERO_VECTORS_COUNT;
  }

  private calculateDotProduct(vectorA: number[], vectorB: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }
    return dotProduct;
  }

  private calculateVectorMagnitude(vector: number[]): number {
    let sumOfSquares = 0;
    for (const component of vector) {
      sumOfSquares += component * component;
    }
    return Math.sqrt(sumOfSquares);
  }

  private computeCosineSimilarity(
    dotProduct: number, 
    magnitudeA: number, 
    magnitudeB: number
  ): number {
    const denominator = magnitudeA * magnitudeB;
    return denominator === 0 ? VectorClusteringService.NO_SIMILARITY : dotProduct / denominator;
  }

  private isClusterViable(cluster: number[]): boolean {
    return cluster.length >= 2;
  }

  private exceedsSimilarityThreshold(similarity: number, config: ClusteringConfig): boolean {
    return similarity > config.similarityThreshold;
  }
}