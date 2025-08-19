/**
 * SmartRouter - Orchestrates the complete routing pipeline
 * 
 * Implements the DISTILL → EMBED → ROUTE flow with intelligent
 * deduplication, folder matching, and expansion detection.
 */

import {
  ISmartRouter,
  SmartRouterConfig,
  RoutingDecision,
  RoutingExplanation,
  BatchRoutingResult,
  ConceptCluster,
  FolderSuggestion,
  RoutingPipelineError
} from '../ISmartRouter';
import { IDistillationService } from '../IDistillationService';
import { IEmbeddingService } from '../IEmbeddingService';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { loadPipelineConfig, PipelineConfig } from '../../config/PipelineConfig';

interface InternalConfig extends SmartRouterConfig {
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  newTopicThreshold: number;
  duplicateThreshold: number;
  minClusterSize: number;
  enableBatchClustering: boolean;
  enableFolderCreation: boolean;
}

interface FolderMatch {
  folderId: string;
  score: number;
  conceptCount: number;
  similarConcepts: SimilarConcept[];
}

interface ProcessedConcept {
  candidate: ConceptCandidate;
  distilled: DistilledContent;
  embeddings: VectorEmbeddings;
  folderMatches: FolderMatch[];
}

export class SmartRouter implements ISmartRouter {
  private readonly config: InternalConfig;
  private readonly pipelineConfig: PipelineConfig;
  private routingStats = {
    totalRouted: 0,
    duplicatesFound: 0,
    foldersCreated: 0,
    unsortedCount: 0,
    totalConfidence: 0
  };

  constructor(
    private readonly distillService: IDistillationService,
    private readonly embeddingService: IEmbeddingService,
    private readonly vectorIndex: IVectorIndexManager,
    config?: Partial<SmartRouterConfig>,
    pipelineConfig?: PipelineConfig
  ) {
    this.pipelineConfig = pipelineConfig || loadPipelineConfig();
    this.config = this.buildInternalConfig(config);
  }

  private buildInternalConfig(userConfig?: Partial<SmartRouterConfig>): InternalConfig {
    const defaultConfig = this.createDefaultConfiguration();
    return { ...defaultConfig, ...userConfig };
  }

  private createDefaultConfiguration(): InternalConfig {
    return {
      highConfidenceThreshold: this.pipelineConfig.routing.highConfidenceThreshold,
      lowConfidenceThreshold: this.pipelineConfig.routing.lowConfidenceThreshold,
      newTopicThreshold: this.pipelineConfig.routing.newTopicThreshold,
      duplicateThreshold: this.pipelineConfig.routing.duplicateThreshold,
      minClusterSize: this.pipelineConfig.batch.minClusterSize,
      enableBatchClustering: this.pipelineConfig.batch.enableBatchClustering,
      enableFolderCreation: this.pipelineConfig.batch.enableFolderCreation
    };
  }

  async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
    try {
      return await this.executeRoutingPipeline(candidate);
    } catch (error) {
      return this.handleRoutingError(error);
    }
  }

  private async executeRoutingPipeline(candidate: ConceptCandidate): Promise<RoutingDecision> {
    const distilled = await this.distillContent(candidate);
    const embeddings = await this.generateEmbeddings(distilled);
    
    const duplicateDecision = await this.checkForDuplicates(embeddings);
    if (this.isDuplicateFound(duplicateDecision)) {
      return duplicateDecision;
    }

    const folderMatches = await this.findBestFolders(embeddings);
    return this.makeRoutingDecision(folderMatches, embeddings, distilled);
  }

  private isDuplicateFound(decision: RoutingDecision | null): decision is RoutingDecision {
    return decision !== null;
  }

  private handleRoutingError(error: unknown): never {
    if (error instanceof RoutingPipelineError) {
      throw error;
    }
    throw new RoutingPipelineError(
      'route',
      'Unexpected error during routing',
      error instanceof Error ? error : new Error(String(error))
    );
  }

  async routeBatch(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    if (this.shouldUseIndividualRouting(candidates)) {
      return this.routeIndividually(candidates);
    }

    return this.routeWithClustering(candidates);
  }

  private shouldUseIndividualRouting(candidates: ConceptCandidate[]): boolean {
    return !this.config.enableBatchClustering || candidates.length < 2;
  }

  private async routeIndividually(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const decisions = await this.processIndividualRouting(candidates);
    return this.createEmptyBatchResult(decisions);
  }

  private async processIndividualRouting(candidates: ConceptCandidate[]): Promise<RoutingDecision[]> {
    const decisions: RoutingDecision[] = [];
    for (const candidate of candidates) {
      decisions.push(await this.route(candidate));
    }
    return decisions;
  }

  private createEmptyBatchResult(decisions: RoutingDecision[]): BatchRoutingResult {
    return { 
      decisions, 
      clusters: [], 
      suggestedFolders: [] 
    };
  }

  private async routeWithClustering(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const processedConcepts = await this.processConceptsBatch(candidates);
    const clusters = this.identifyValidClusters(processedConcepts);
    const suggestedFolders = await this.generateFolderSuggestions(clusters);
    const decisions = await this.createBatchDecisions(processedConcepts);
    
    return { decisions, clusters, suggestedFolders };
  }

  private identifyValidClusters(processedConcepts: ProcessedConcept[]): ConceptCluster[] {
    const allClusters = this.findClustersInBatch(processedConcepts);
    return allClusters.filter(cluster => this.isClusterValid(cluster));
  }

  private isClusterValid(cluster: ConceptCluster): boolean {
    return cluster.concepts.length >= this.config.minClusterSize;
  }

  private async generateFolderSuggestions(clusters: ConceptCluster[]): Promise<FolderSuggestion[]> {
    if (!this.config.enableFolderCreation) {
      return [];
    }

    const suggestions: FolderSuggestion[] = [];
    for (const cluster of clusters) {
      const suggestion = await this.createFolderSuggestion(cluster);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
    return suggestions;
  }

  private async createBatchDecisions(processedConcepts: ProcessedConcept[]): Promise<RoutingDecision[]> {
    const decisions: RoutingDecision[] = [];
    for (const processed of processedConcepts) {
      const decision = await this.makeRoutingDecision(
        processed.folderMatches,
        processed.embeddings,
        processed.distilled
      );
      decisions.push(decision);
    }
    return decisions;
  }

  async checkExpansionOpportunity(candidate: ConceptCandidate): Promise<FolderSuggestion | null> {
    if (!this.config.enableFolderCreation) {
      return null;
    }

    const distilled = await this.distillContent(candidate);
    const embeddings = await this.generateEmbeddings(distilled);
    
    const unsortedSimilar = await this.findUnsortedSimilar(embeddings);
    
    if (unsortedSimilar.length >= this.config.minClusterSize - 1) {
      return {
        name: this.generateFolderName(distilled, unsortedSimilar),
        concepts: [candidate.id, ...unsortedSimilar.map(s => s.conceptId)],
        confidence: this.calculateClusterCoherence(unsortedSimilar)
      };
    }

    return null;
  }

  async getRoutingStats(): Promise<{
    totalRouted: number;
    duplicatesFound: number;
    foldersCreated: number;
    unsortedCount: number;
    averageConfidence: number;
  }> {
    return {
      totalRouted: this.routingStats.totalRouted,
      duplicatesFound: this.routingStats.duplicatesFound,
      foldersCreated: this.routingStats.foldersCreated,
      unsortedCount: this.routingStats.unsortedCount,
      averageConfidence: this.routingStats.totalRouted > 0
        ? this.routingStats.totalConfidence / this.routingStats.totalRouted
        : 0
    };
  }

  private async distillContent(candidate: ConceptCandidate): Promise<DistilledContent> {
    try {
      const normalized = candidate.normalize();
      return await this.distillService.distill(normalized);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle non-study content specifically
      if (errorMessage.includes('not study-related')) {
        throw new RoutingPipelineError('distill', 'Content is not study-related and will be skipped', error as Error);
      }
      
      throw new RoutingPipelineError('distill', 'Failed to distill content', error as Error);
    }
  }

  private async generateEmbeddings(distilled: DistilledContent): Promise<VectorEmbeddings> {
    try {
      return await this.embeddingService.embed(distilled);
    } catch (error) {
      throw new RoutingPipelineError('embed', 'Failed to generate embeddings', error as Error);
    }
  }

  private async checkForDuplicates(embeddings: VectorEmbeddings): Promise<RoutingDecision | null> {
    const searchOptions = this.buildTitleSearchOptions(embeddings);
    const duplicates = await this.vectorIndex.searchByTitle(searchOptions);

    if (this.hasDuplicatesFound(duplicates)) {
      return this.createDuplicateDecision(duplicates[0]);
    }

    return null;
  }

  private buildTitleSearchOptions(embeddings: VectorEmbeddings) {
    return {
      vector: embeddings.vector,
      threshold: this.config.duplicateThreshold,
      limit: this.pipelineConfig.vector.titleSearchLimit
    };
  }

  private hasDuplicatesFound(duplicates: SimilarConcept[]): boolean {
    return duplicates.length > 0;
  }

  private createDuplicateDecision(duplicate: SimilarConcept): RoutingDecision {
    this.updateDuplicateStatistics(duplicate);
    
    return {
      action: 'duplicate',
      duplicateId: duplicate.conceptId,
      confidence: duplicate.similarity,
      explanation: this.buildDuplicateExplanation(duplicate),
      timestamp: new Date()
    };
  }

  private updateDuplicateStatistics(duplicate: SimilarConcept): void {
    this.routingStats.duplicatesFound++;
    this.routingStats.totalRouted++;
    this.routingStats.totalConfidence += duplicate.similarity;
  }

  private buildDuplicateExplanation(duplicate: SimilarConcept): RoutingExplanation {
    const similarityPercentage = Math.round(duplicate.similarity * 100);
    const decimalPlaces = 3;
    
    return {
      primarySignal: `Duplicate of existing concept (${similarityPercentage}% similar)`,
      similarConcepts: [{
        conceptId: duplicate.conceptId,
        title: 'Duplicate concept',
        similarity: duplicate.similarity
      }],
      decisionFactors: [`Title similarity: ${duplicate.similarity.toFixed(decimalPlaces)}`]
    };
  }

  private async findBestFolders(embeddings: VectorEmbeddings): Promise<FolderMatch[]> {
    const searchOptions = this.buildContextSearchOptions(embeddings);
    const contextMatches = await this.vectorIndex.searchByContext(searchOptions);

    const folderGroups = this.groupByFolder(contextMatches);
    const folderMatches = this.convertToFolderMatches(folderGroups);
    
    return this.sortByScore(folderMatches);
  }

  private buildContextSearchOptions(embeddings: VectorEmbeddings) {
    return {
      vector: embeddings.vector,
      threshold: this.config.lowConfidenceThreshold,
      limit: this.pipelineConfig.vector.contextSearchLimit
    };
  }

  private convertToFolderMatches(folderGroups: Record<string, SimilarConcept[]>): FolderMatch[] {
    return Object.entries(folderGroups).map(([folderId, concepts]) => ({
      folderId,
      score: this.calculateFolderScore(concepts),
      conceptCount: concepts.length,
      similarConcepts: concepts
    }));
  }

  private sortByScore(matches: FolderMatch[]): FolderMatch[] {
    return matches.sort((a, b) => b.score - a.score);
  }

  private groupByFolder(concepts: SimilarConcept[]): Record<string, SimilarConcept[]> {
    const groups: Record<string, SimilarConcept[]> = {};
    
    for (const concept of concepts) {
      const folderId = concept.folderId || 'unsorted';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(concept);
    }
    
    return groups;
  }

  private calculateFolderScore(concepts: SimilarConcept[]): number {
    if (this.hasNoConcepts(concepts)) {
      return 0;
    }
    
    const avgSimilarity = this.calculateAverageSimilarity(concepts);
    const maxSimilarity = this.findMaximumSimilarity(concepts);
    const countBonus = this.calculateConceptCountBonus(concepts);
    
    return this.combineScoreComponents(avgSimilarity, maxSimilarity, countBonus);
  }

  private hasNoConcepts(concepts: SimilarConcept[]): boolean {
    return concepts.length === 0;
  }

  private findMaximumSimilarity(concepts: SimilarConcept[]): number {
    return Math.max(...concepts.map(concept => concept.similarity));
  }

  private calculateConceptCountBonus(concepts: SimilarConcept[]): number {
    const multiplier = this.pipelineConfig.folderScoring.countBonusMultiplier;
    const maxBonus = this.pipelineConfig.folderScoring.maxCountBonus;
    const rawBonus = concepts.length * multiplier;
    
    return Math.min(rawBonus, maxBonus);
  }

  private combineScoreComponents(avgSimilarity: number, maxSimilarity: number, countBonus: number): number {
    const avgWeight = this.pipelineConfig.folderScoring.avgSimilarityWeight;
    const maxWeight = this.pipelineConfig.folderScoring.maxSimilarityWeight;
    
    const weightedAverage = avgSimilarity * avgWeight;
    const weightedMaximum = maxSimilarity * maxWeight;
    
    return weightedAverage + weightedMaximum + countBonus;
  }

  private async makeRoutingDecision(
    folderMatches: FolderMatch[],
    _embeddings: VectorEmbeddings,
    _distilled: DistilledContent
  ): Promise<RoutingDecision> {
    // TODO: Implement Enhanced Smart Trigger System routing logic
    // This method will be enhanced to support:
    // - Tiered similarity thresholds (High >0.85, Medium 0.65-0.85, Low <0.65)
    // - LLM-powered folder creation for low similarity concepts
    // - Integration with IFolderExpansionService for size-based triggers
    // - Integration with IDuplicateCleanupService for duplicate prevention
    // See: /docs/ENHANCED-FOLDER-EXPANSION-SYSTEM.md
    
    // Multi-folder placement logic based on thresholds
    const placements = this.determineFolderPlacements(folderMatches);
    
    if (placements.length === 0) {
      return this.createUnsortedDecision(folderMatches, 'No suitable folders found');
    }
    
    // Check for duplicate threshold first
    const bestPlacement = placements[0];
    if (bestPlacement.confidence >= this.pipelineConfig.routing.duplicateThreshold) {
      return this.createDuplicateRoutingDecision(bestPlacement.path, bestPlacement.confidence);
    }
    
    return this.createMultiFolderDecision(placements, folderMatches);
  }

  private determineFolderPlacements(folderMatches: FolderMatch[]): { path: string; confidence: number; type: 'primary' | 'secondary' }[] {
    const placements: { path: string; confidence: number; type: 'primary' | 'secondary' }[] = [];
    const threshold = this.pipelineConfig.routing.folderPlacementThreshold;
    
    // Sort by confidence descending
    const sortedMatches = folderMatches.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < sortedMatches.length; i++) {
      const match = sortedMatches[i];
      
      if (match.score >= threshold) {
        placements.push({
          path: match.folderId,
          confidence: match.score,
          type: i === 0 ? 'primary' : 'secondary'
        });
      }
    }
    
    return placements;
  }

  private createMultiFolderDecision(
    placements: { path: string; confidence: number; type: 'primary' | 'secondary' }[],
    allMatches: FolderMatch[]
  ): RoutingDecision {
    const primary = placements[0];
    
    this.updateRoutingStatistics('route', primary.confidence);
    
    return {
      action: 'route',
      folderId: primary.path,
      confidence: primary.confidence,
      explanation: this.buildMultiFolderRoutingExplanation(placements, allMatches),
      timestamp: new Date()
    };
  }

  private createDuplicateRoutingDecision(path: string, confidence: number): RoutingDecision {
    this.updateRoutingStatistics('duplicate', confidence);
    
    return {
      action: 'duplicate',
      folderId: path,
      confidence: confidence,
      explanation: {
        primarySignal: 'High similarity match',
        similarConcepts: [],
        decisionFactors: [`Very high similarity (${(confidence * 100).toFixed(1)}%)`, 'Indicates likely duplicate'],
        folderMatches: [{ folderId: path, score: confidence, conceptCount: 1 }]
      },
      timestamp: new Date()
    };
  }

  private buildMultiFolderRoutingExplanation(
    placements: { path: string; confidence: number; type: 'primary' | 'secondary' }[],
    allMatches: FolderMatch[]
  ): RoutingExplanation {
    const primary = placements.find(p => p.type === 'primary');
    const secondaries = placements.filter(p => p.type === 'secondary');
    
    const decisionFactors = [
      `Primary placement: ${primary?.path} (${(primary!.confidence * 100).toFixed(1)}%)`
    ];
    
    if (secondaries.length > 0) {
      const secondaryDescriptions = secondaries.map(s => `${s.path} (${(s.confidence * 100).toFixed(1)}%)`);
      decisionFactors.push(`Secondary placements: ${secondaryDescriptions.join(', ')}`);
    }
    
    decisionFactors.push(`Using multi-folder threshold: ${this.pipelineConfig.routing.folderPlacementThreshold}`);
    
    return {
      primarySignal: 'Multi-folder placement based on similarity thresholds',
      similarConcepts: [],
      decisionFactors: decisionFactors,
      folderMatches: allMatches.map(match => ({
        folderId: match.folderId,
        score: match.score,
        conceptCount: match.conceptCount
      }))
    };
  }


  private createUnsortedDecision(matches: FolderMatch[], reason: string): RoutingDecision {
    const confidence = matches[0]?.score || 0;
    this.updateRoutingStatistics('unsorted', confidence);
    
    return {
      action: 'unsorted',
      confidence: confidence,
      explanation: {
        primarySignal: reason,
        similarConcepts: [],
        decisionFactors: [reason, `Best score: ${matches[0]?.score?.toFixed(3) || 'N/A'}`],
        folderMatches: matches.slice(0, 3)
      },
      timestamp: new Date()
    };
  }

  private calculateAverageSimilarity(concepts: SimilarConcept[]): number {
    if (concepts.length === 0) return 0;
    return concepts.reduce((sum, concept) => sum + concept.similarity, 0) / concepts.length;
  }

  private async processConceptsBatch(candidates: ConceptCandidate[]): Promise<Array<{
    candidate: ConceptCandidate;
    distilled: DistilledContent;
    embeddings: VectorEmbeddings;
    folderMatches: FolderMatch[];
  }>> {
    const results = [];
    
    for (const candidate of candidates) {
      const distilled = await this.distillContent(candidate);
      const embeddings = await this.generateEmbeddings(distilled);
      const folderMatches = await this.findBestFolders(embeddings);
      
      results.push({ candidate, distilled, embeddings, folderMatches });
    }
    
    return results;
  }

  private isClusterSimilarityAboveThreshold(similarity: number): boolean {
    return similarity > this.pipelineConfig.clustering.clusterSimilarityThreshold;
  }

  private findClustersInBatch(processedConcepts: Array<{
    embeddings: VectorEmbeddings;
  }>): ConceptCluster[] {
    const clusters: ConceptCluster[] = [];
    const visited = new Set<number>();
    
    for (let i = 0; i < processedConcepts.length; i++) {
      if (visited.has(i)) continue;
      
      const cluster: number[] = [i];
      visited.add(i);
      
      for (let j = i + 1; j < processedConcepts.length; j++) {
        if (visited.has(j)) continue;
        
        const similarity = this.cosineSimilarity(
          processedConcepts[i].embeddings.vector,
          processedConcepts[j].embeddings.vector
        );
        
        if (this.isClusterSimilarityAboveThreshold(similarity)) {
          cluster.push(j);
          visited.add(j);
        }
      }
      
      if (cluster.length >= 2) {
        clusters.push({
          concepts: cluster.map(idx => `concept-${idx}`),
          centroid: this.calculateCentroid(cluster.map(idx => processedConcepts[idx].embeddings.vector)),
          coherence: this.calculateCoherence(cluster.map(idx => processedConcepts[idx].embeddings.vector)),
          suggestedAction: cluster.length >= this.config.minClusterSize ? 'create_folder' : 'route_together'
        });
      }
    }
    
    return clusters;
  }

  private async findUnsortedSimilar(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    const results = await this.vectorIndex.searchByContext({
      vector: embeddings.vector,
      threshold: this.pipelineConfig.clustering.unsortedSimilarityThreshold,
      limit: this.pipelineConfig.clustering.unsortedSearchLimit
    });
    
    return results.filter(r => r.folderId === 'unsorted' || !r.folderId);
  }

  private async createFolderSuggestion(cluster: ConceptCluster): Promise<FolderSuggestion | null> {
    return {
      name: `Cluster-${Date.now()}`,
      concepts: cluster.concepts,
      confidence: cluster.coherence
    };
  }

  private generateFolderName(distilled: DistilledContent, _similar: SimilarConcept[]): string {
    const words = distilled.title.split(/\s+/).slice(0, 3);
    return words.join(' ');
  }

  private calculateClusterCoherence(concepts: SimilarConcept[]): number {
    if (concepts.length === 0) return 0;
    return concepts.reduce((sum, c) => sum + c.similarity, 0) / concepts.length;
  }

  private calculateCoherence(vectors: number[][]): number {
    if (vectors.length < 2) return 1;
    
    let totalSimilarity = 0;
    let pairs = 0;
    
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalSimilarity += this.cosineSimilarity(vectors[i], vectors[j]);
        pairs++;
      }
    }
    
    const noPairs = 0;
    return pairs > noPairs ? totalSimilarity / pairs : noPairs;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    const noDenominator = 0;
    const noSimilarity = 0;
    return denominator === noDenominator ? noSimilarity : dotProduct / denominator;
  }

  private calculateCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    
    const dimensions = vectors[0].length;
    const centroid = new Array(dimensions).fill(0);
    
    for (const vector of vectors) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += vector[i];
      }
    }
    
    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= vectors.length;
    }
    
    return centroid;
  }


  private updateRoutingStatistics(action: string, confidence: number): void {
    this.routingStats.totalRouted++;
    this.routingStats.totalConfidence += confidence;

    if (action === 'duplicate') {
      this.routingStats.duplicatesFound++;
    } else if (action === 'unsorted') {
      this.routingStats.unsortedCount++;
    }
  }
}