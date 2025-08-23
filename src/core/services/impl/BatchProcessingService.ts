/**
 * BatchProcessingService - Specialized service for batch concept processing
 * 
 * This service handles batch processing of concepts with clustering support.
 * It operates at a single level of abstraction, focusing on batch operations
 * without mixing individual concept processing concerns.
 */

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { BatchRoutingResult, ConceptCluster, FolderSuggestion } from '../ISmartRouter';
import { PipelineConfig } from '../../config/PipelineConfig';
import { RoutingPipeline, PipelineResult } from './RoutingPipeline';
import { VectorMathOperations } from '../../utils/VectorMathOperations';

export class BatchProcessingService {
  private readonly enableClustering: boolean;
  private readonly minClusterSize: number;
  private readonly enableFolderCreation: boolean;

  constructor(
    private readonly pipeline: RoutingPipeline,
    config: PipelineConfig
  ) {
    this.enableClustering = config.batch.enableBatchClustering;
    this.minClusterSize = config.batch.minClusterSize;
    this.enableFolderCreation = config.batch.enableFolderCreation;
  }

  /**
   * Process a batch of concepts with optional clustering
   */
  async processBatch(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    if (this.shouldProcessIndividually(candidates)) {
      return await this.processIndividually(candidates);
    }

    return await this.processWithClustering(candidates);
  }

  private shouldProcessIndividually(candidates: ConceptCandidate[]): boolean {
    return !this.enableClustering || candidates.length < 2;
  }

  private async processIndividually(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const results = await this.pipeline.executeBatch(candidates);
    const decisions = results.map(r => r.decision);

    return {
      decisions,
      clusters: [],
      suggestedFolders: []
    };
  }

  private async processWithClustering(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    // Process all candidates first
    const results = await this.pipeline.executeBatch(candidates);
    
    // Identify clusters from the processed results
    const clusters = this.identifyClusters(results);
    
    // Generate folder suggestions from clusters
    const suggestedFolders = this.generateFolderSuggestions(clusters);
    
    return {
      decisions: results.map(r => r.decision),
      clusters,
      suggestedFolders
    };
  }

  private identifyClusters(results: PipelineResult[]): ConceptCluster[] {
    if (results.length < this.minClusterSize) {
      return [];
    }

    // Group results by similar embeddings
    const clusters: ConceptCluster[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      if (processed.has(i) || !results[i].context.embeddings) {
        continue;
      }

      const cluster: ConceptCluster = {
        concepts: [results[i].context.candidate.id],
        centroid: results[i].context.embeddings!.vector,
        coherence: 1.0,
        suggestedAction: 'route_together'
      };

      // Find similar concepts
      for (let j = i + 1; j < results.length; j++) {
        if (processed.has(j) || !results[j].context.embeddings) {
          continue;
        }

        const similarity = VectorMathOperations.calculateCosineSimilarity(
          results[i].context.embeddings!.vector,
          results[j].context.embeddings!.vector
        );

        if (similarity >= 0.7) { // Clustering threshold
          cluster.concepts.push(results[j].context.candidate.id);
          processed.add(j);
        }
      }

      if (cluster.concepts.length >= this.minClusterSize) {
        // Update centroid and coherence
        const vectors = cluster.concepts
          .map(id => results.find(r => r.context.candidate.id === id)?.context.embeddings?.vector)
          .filter(v => v !== undefined) as number[][];
        
        cluster.centroid = VectorMathOperations.computeCentroid(vectors);
        cluster.coherence = VectorMathOperations.calculateClusterCoherence(vectors);
        
        clusters.push(cluster);
      }

      processed.add(i);
    }

    return clusters;
  }

  private generateFolderSuggestions(clusters: ConceptCluster[]): FolderSuggestion[] {
    if (!this.enableFolderCreation) {
      return [];
    }

    return clusters.map(cluster => ({
      name: this.generateClusterName(cluster),
      concepts: cluster.concepts,
      confidence: cluster.coherence
    }));
  }

  private generateClusterName(cluster: ConceptCluster): string {
    // Simple naming strategy - could be enhanced with LLM
    return `cluster-${cluster.concepts.length}-items`;
  }
}