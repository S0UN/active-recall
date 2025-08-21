/**
 * ExpansionDetectionService - Service for detecting folder expansion opportunities
 * 
 * This service specializes in identifying when new folders should be created
 * based on unsorted content clusters. It operates at a single level of
 * abstraction, focusing on expansion detection logic only.
 */

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { IDistillationService } from '../IDistillationService';
import { IEmbeddingService } from '../IEmbeddingService';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { FolderSuggestion } from '../ISmartRouter';
import { PipelineConfig } from '../../config/PipelineConfig';
import { VectorMathOperations } from '../../utils/VectorMathOperations';

export class ExpansionDetectionService {
  private readonly minClusterSize: number;
  private readonly enableFolderCreation: boolean;
  private readonly expansionThreshold: number;

  constructor(
    private readonly distillationService: IDistillationService,
    private readonly embeddingService: IEmbeddingService,
    private readonly vectorIndex: IVectorIndexManager,
    config: PipelineConfig
  ) {
    this.minClusterSize = config.batch.minClusterSize;
    this.enableFolderCreation = config.batch.enableFolderCreation;
    this.expansionThreshold = config.routing.newTopicThreshold;
  }

  /**
   * Detect if there's an opportunity to create a new folder
   */
  async detectExpansionOpportunity(candidate: ConceptCandidate): Promise<FolderSuggestion | null> {
    if (!this.enableFolderCreation) {
      return null;
    }

    try {
      // Process the candidate to get embeddings
      const distilled = await this.distillContent(candidate);
      const embeddings = await this.generateEmbeddings(distilled);
      
      // Find similar unsorted content
      const unsortedSimilar = await this.findUnsortedSimilarConcepts(embeddings);
      
      // Check if we have enough similar concepts for a new folder
      if (this.hasEnoughConceptsForFolder(unsortedSimilar)) {
        return this.createFolderSuggestion(candidate, distilled, unsortedSimilar);
      }
      
      return null;
    } catch (error) {
      console.warn('Expansion detection failed:', error);
      return null;
    }
  }

  /**
   * Analyze folder for potential subdivision
   */
  async analyzeFolderForSubdivision(folderId: string): Promise<FolderSuggestion[]> {
    const folderMembers = await this.vectorIndex.getFolderMembers(folderId, 1000);
    
    if (folderMembers.length < this.minClusterSize * 2) {
      return []; // Too few members to subdivide
    }

    // Find subclusters within the folder
    const subclusters = await this.identifySubclusters(folderMembers);
    
    return subclusters.map(cluster => ({
      name: this.generateSubfolderName(folderId, cluster),
      concepts: cluster.map(member => member.conceptId),
      confidence: this.calculateSubclusterCoherence(cluster)
    }));
  }

  private async distillContent(candidate: ConceptCandidate): Promise<DistilledContent> {
    const normalized = candidate.normalize();
    return await this.distillationService.distill(normalized);
  }

  private async generateEmbeddings(distilled: DistilledContent): Promise<VectorEmbeddings> {
    return await this.embeddingService.embed(distilled);
  }

  private async findUnsortedSimilarConcepts(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    return await this.vectorIndex.searchByContext({
      vector: embeddings.vector,
      threshold: this.expansionThreshold,
      limit: 20,
      filterByFolder: 'unsorted'
    });
  }

  private hasEnoughConceptsForFolder(similarConcepts: SimilarConcept[]): boolean {
    return similarConcepts.length >= (this.minClusterSize - 1);
  }

  private createFolderSuggestion(
    candidate: ConceptCandidate,
    distilled: DistilledContent,
    similarConcepts: SimilarConcept[]
  ): FolderSuggestion {
    return {
      name: this.generateFolderName(distilled),
      concepts: [candidate.id, ...similarConcepts.map(c => c.conceptId)],
      confidence: this.calculateClusterCoherence(similarConcepts)
    };
  }

  private generateFolderName(distilled: DistilledContent): string {
    // Extract key terms from title for folder name
    const words = distilled.title.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word)
    );
    
    return meaningfulWords.slice(0, 3).join('-') || 'new-topic';
  }

  private calculateClusterCoherence(concepts: SimilarConcept[]): number {
    if (concepts.length === 0) {
      return 0;
    }
    
    const similarities = concepts.map(c => c.similarity);
    return VectorMathOperations.calculateAverageSimilarity(similarities);
  }

  private async identifySubclusters(members: any[]): Promise<any[][]> {
    // Simple clustering based on similarity
    const clusters: any[][] = [];
    const processed = new Set<number>();

    for (let i = 0; i < members.length; i++) {
      if (processed.has(i)) continue;

      const cluster = [members[i]];
      processed.add(i);

      for (let j = i + 1; j < members.length; j++) {
        if (processed.has(j)) continue;

        // Calculate similarity (simplified - in practice would use vectors)
        const similarity = Math.random(); // Placeholder
        
        if (similarity > 0.7) {
          cluster.push(members[j]);
          processed.add(j);
        }
      }

      if (cluster.length >= this.minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private generateSubfolderName(parentFolderId: string, cluster: any[]): string {
    return `${parentFolderId}-subcluster-${cluster.length}`;
  }

  private calculateSubclusterCoherence(cluster: any[]): number {
    // Simplified coherence calculation
    return 0.8; // Placeholder
  }
}