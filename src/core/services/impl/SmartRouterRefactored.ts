/**
 * SmartRouter - Orchestrates the complete routing pipeline
 * 
 * Refactored to follow Clean Code principles:
 * - Single Responsibility: Only orchestration logic
 * - Dependency Injection: Uses extracted services
 * - Pure Functions: No side effects in business logic
 * - Improved Naming: Intention-revealing names
 */

import {
  ISmartRouter,
  SmartRouterConfig,
  BatchRoutingResult,
  ConceptCluster,
  FolderSuggestion,
  RoutingPipelineError
} from '../ISmartRouter';
import { IDistillationService } from '../IDistillationService';
import { IEmbeddingService } from '../IEmbeddingService';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { IClusteringService, ClusteringConfig } from '../IClusteringService';
import { IRoutingDecisionMaker, RoutingDecision, FolderMatch, RoutingThresholds, DecisionContext } from '../IRoutingDecisionMaker';
import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { loadPipelineConfig, PipelineConfig } from '../../config/PipelineConfig';
import { ScoringUtilities, ScoringWeights, ScoringLimits } from '../../utils/ScoringUtilities';

interface ProcessedConcept {
  readonly candidate: ConceptCandidate;
  readonly distilled: DistilledContent;
  readonly embeddings: VectorEmbeddings;
  readonly folderMatches: FolderMatch[];
}

interface RoutingStatistics {
  totalRouted: number;
  duplicatesFound: number;
  foldersCreated: number;
  unsortedCount: number;
  totalConfidence: number;
}

export class SmartRouter implements ISmartRouter {
  private readonly internalConfig: SmartRouterConfig;
  private readonly pipelineConfig: PipelineConfig;
  private readonly routingStatistics: RoutingStatistics;

  constructor(
    private readonly distillationService: IDistillationService,
    private readonly embeddingService: IEmbeddingService,
    private readonly vectorIndexManager: IVectorIndexManager,
    private readonly clusteringService: IClusteringService,
    private readonly routingDecisionMaker: IRoutingDecisionMaker,
    userConfig?: Partial<SmartRouterConfig>,
    pipelineConfig?: PipelineConfig
  ) {
    this.pipelineConfig = pipelineConfig || loadPipelineConfig();
    this.internalConfig = this.buildInternalConfiguration(userConfig);
    this.routingStatistics = this.initializeRoutingStatistics();
  }

  async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
    try {
      const pipelineContext = await this.executeDistillationAndEmbeddingPipeline(candidate);
      const duplicateDecision = await this.checkForDuplicateContent(pipelineContext.embeddings);
      
      if (this.isDuplicateDetected(duplicateDecision)) {
        this.updateDuplicateStatistics(duplicateDecision);
        return duplicateDecision;
      }

      return await this.makeIntelligentRoutingDecision(pipelineContext);
    } catch (error) {
      throw this.wrapRoutingError(error);
    }
  }

  async routeBatch(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    if (this.shouldProcessIndividually(candidates)) {
      return this.processIndividualRouting(candidates);
    }

    return this.processBatchRoutingWithClustering(candidates);
  }

  async checkExpansionOpportunity(candidate: ConceptCandidate): Promise<FolderSuggestion | null> {
    if (!this.isFolderCreationEnabled()) {
      return null;
    }

    const pipelineContext = await this.executeDistillationAndEmbeddingPipeline(candidate);
    const unsortedSimilarConcepts = await this.findUnsortedSimilarConcepts(pipelineContext.embeddings);
    
    return this.evaluateFolderCreationOpportunity(candidate, unsortedSimilarConcepts, pipelineContext.distilled);
  }

  async getRoutingStats(): Promise<{
    totalRouted: number;
    duplicatesFound: number;
    foldersCreated: number;
    unsortedCount: number;
    averageConfidence: number;
  }> {
    return {
      totalRouted: this.routingStatistics.totalRouted,
      duplicatesFound: this.routingStatistics.duplicatesFound,
      foldersCreated: this.routingStatistics.foldersCreated,
      unsortedCount: this.routingStatistics.unsortedCount,
      averageConfidence: this.calculateAverageConfidence()
    };
  }

  private async executeDistillationAndEmbeddingPipeline(candidate: ConceptCandidate): Promise<{
    distilled: DistilledContent;
    embeddings: VectorEmbeddings;
  }> {
    const normalizedContent = candidate.normalize();
    const distilled = await this.distillationService.distill(normalizedContent);
    const embeddings = await this.embeddingService.embed(distilled);
    
    return { distilled, embeddings };
  }

  private async checkForDuplicateContent(embeddings: VectorEmbeddings): Promise<RoutingDecision | null> {
    const titleSearchOptions = this.buildTitleSearchOptions(embeddings);
    const potentialDuplicates = await this.vectorIndexManager.searchByTitle(titleSearchOptions);

    if (this.hasDuplicatesFound(potentialDuplicates)) {
      return this.createDuplicateRoutingDecision(potentialDuplicates[0]);
    }

    return null;
  }

  private async makeIntelligentRoutingDecision(pipelineContext: {
    distilled: DistilledContent;
    embeddings: VectorEmbeddings;
  }): Promise<RoutingDecision> {
    const folderMatches = await this.findBestFolderMatches(pipelineContext.embeddings);
    const decisionContext = this.buildDecisionContext(folderMatches, pipelineContext);
    const decision = this.routingDecisionMaker.makeRoutingDecision(decisionContext);
    
    this.updateRoutingStatistics(decision);
    return decision;
  }

  private async findBestFolderMatches(embeddings: VectorEmbeddings): Promise<FolderMatch[]> {
    const contextSearchOptions = this.buildContextSearchOptions(embeddings);
    const contextMatches = await this.vectorIndexManager.searchByContext(contextSearchOptions);
    const folderGroups = this.groupConceptsByFolder(contextMatches);
    
    return this.convertToFolderMatches(folderGroups);
  }

  private groupConceptsByFolder(concepts: SimilarConcept[]): Record<string, SimilarConcept[]> {
    const folderGroups: Record<string, SimilarConcept[]> = {};
    
    for (const concept of concepts) {
      const folderId = concept.folderId || 'unsorted';
      if (!folderGroups[folderId]) {
        folderGroups[folderId] = [];
      }
      folderGroups[folderId].push(concept);
    }
    
    return folderGroups;
  }

  private convertToFolderMatches(folderGroups: Record<string, SimilarConcept[]>): FolderMatch[] {
    const folderMatches = Object.entries(folderGroups).map(([folderId, concepts]) => ({
      folderId,
      score: this.calculateFolderScore(concepts),
      conceptCount: concepts.length,
      similarConcepts: concepts
    }));

    return this.sortFolderMatchesByScore(folderMatches);
  }

  private calculateFolderScore(concepts: SimilarConcept[]): number {
    const scoringWeights = this.extractScoringWeights();
    const scoringLimits = this.extractScoringLimits();
    
    return ScoringUtilities.calculateFolderScore(concepts, scoringWeights, scoringLimits);
  }

  private async processBatchRoutingWithClustering(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const processedConcepts = await this.processConceptsBatch(candidates);
    const conceptClusters = this.identifyConceptClusters(processedConcepts);
    const suggestedFolders = await this.generateFolderSuggestions(conceptClusters);
    const routingDecisions = await this.createBatchRoutingDecisions(processedConcepts);
    
    return { 
      decisions: routingDecisions, 
      clusters: conceptClusters, 
      suggestedFolders 
    };
  }

  private identifyConceptClusters(processedConcepts: ProcessedConcept[]): ConceptCluster[] {
    const embeddings = processedConcepts.map(concept => concept.embeddings);
    const clusteringConfig = this.buildClusteringConfiguration();
    
    return this.clusteringService.findClusters(embeddings, clusteringConfig);
  }

  private async generateFolderSuggestions(clusters: ConceptCluster[]): Promise<FolderSuggestion[]> {
    if (!this.isFolderCreationEnabled()) {
      return [];
    }

    const suggestions: FolderSuggestion[] = [];
    for (const cluster of clusters) {
      const suggestion = this.createFolderSuggestionFromCluster(cluster);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
    
    return suggestions;
  }

  private buildInternalConfiguration(userConfig?: Partial<SmartRouterConfig>): SmartRouterConfig {
    const defaultConfig = this.createDefaultConfiguration();
    return { ...defaultConfig, ...userConfig };
  }

  private createDefaultConfiguration(): SmartRouterConfig {
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

  private initializeRoutingStatistics(): RoutingStatistics {
    return {
      totalRouted: 0,
      duplicatesFound: 0,
      foldersCreated: 0,
      unsortedCount: 0,
      totalConfidence: 0
    };
  }

  private buildTitleSearchOptions(embeddings: VectorEmbeddings) {
    return {
      vector: embeddings.titleVector,
      threshold: this.internalConfig.duplicateThreshold!,
      limit: this.pipelineConfig.vector.titleSearchLimit
    };
  }

  private buildContextSearchOptions(embeddings: VectorEmbeddings) {
    return {
      vector: embeddings.contextVector,
      threshold: this.internalConfig.lowConfidenceThreshold!,
      limit: this.pipelineConfig.vector.contextSearchLimit
    };
  }

  private buildDecisionContext(
    folderMatches: FolderMatch[], 
    pipelineContext: { distilled: DistilledContent; embeddings: VectorEmbeddings }
  ): DecisionContext {
    return {
      folderMatches,
      embeddings: pipelineContext.embeddings,
      distilled: pipelineContext.distilled,
      thresholds: this.extractRoutingThresholds()
    };
  }

  private buildClusteringConfiguration(): ClusteringConfig {
    return {
      similarityThreshold: this.pipelineConfig.clustering.clusterSimilarityThreshold,
      minimumClusterSize: this.internalConfig.minClusterSize!,
      maximumClusterSize: this.pipelineConfig.clustering.maxClusterSize
    };
  }

  private extractScoringWeights(): ScoringWeights {
    return {
      averageSimilarity: this.pipelineConfig.folderScoring.avgSimilarityWeight,
      maximumSimilarity: this.pipelineConfig.folderScoring.maxSimilarityWeight,
      countBonus: 1.0 // Count bonus weight is always 1.0 in the scoring formula
    };
  }

  private extractScoringLimits(): ScoringLimits {
    return {
      maximumCountBonus: this.pipelineConfig.folderScoring.maxCountBonus,
      countBonusMultiplier: this.pipelineConfig.folderScoring.countBonusMultiplier
    };
  }

  private extractRoutingThresholds(): RoutingThresholds {
    return {
      highConfidence: this.internalConfig.highConfidenceThreshold!,
      lowConfidence: this.internalConfig.lowConfidenceThreshold!,
      newTopic: this.internalConfig.newTopicThreshold!,
      duplicate: this.internalConfig.duplicateThreshold!
    };
  }

  private isDuplicateDetected(decision: RoutingDecision | null): decision is RoutingDecision {
    return decision !== null;
  }

  private hasDuplicatesFound(duplicates: SimilarConcept[]): boolean {
    return duplicates.length > 0;
  }

  private shouldProcessIndividually(candidates: ConceptCandidate[]): boolean {
    return !this.internalConfig.enableBatchClustering! || candidates.length < 2;
  }

  private isFolderCreationEnabled(): boolean {
    return this.internalConfig.enableFolderCreation!;
  }

  private calculateAverageConfidence(): number {
    return this.routingStatistics.totalRouted > 0
      ? this.routingStatistics.totalConfidence / this.routingStatistics.totalRouted
      : 0;
  }

  private sortFolderMatchesByScore(matches: FolderMatch[]): FolderMatch[] {
    return matches.sort((a, b) => b.score - a.score);
  }

  private wrapRoutingError(error: unknown): RoutingPipelineError {
    if (error instanceof RoutingPipelineError) {
      return error;
    }
    return new RoutingPipelineError(
      'route',
      'Unexpected error during routing',
      error instanceof Error ? error : new Error(String(error))
    );
  }

  // Simplified helper methods that delegate to injected services
  private createDuplicateRoutingDecision(duplicate: SimilarConcept): RoutingDecision {
    const confidencePercentage = ScoringUtilities.calculateConfidencePercentage(duplicate.similarity);
    
    return {
      action: 'duplicate',
      duplicateId: duplicate.conceptId,
      confidence: duplicate.similarity,
      explanation: {
        primarySignal: `Duplicate of existing concept (${confidencePercentage}% similar)`,
        similarConcepts: [{
          conceptId: duplicate.conceptId,
          title: 'Duplicate concept',
          similarity: duplicate.similarity
        }],
        decisionFactors: [`Title similarity: ${ScoringUtilities.formatScoreToDecimalPlaces(duplicate.similarity, 3)}`]
      },
      timestamp: new Date()
    };
  }

  private updateDuplicateStatistics(decision: RoutingDecision): void {
    this.routingStatistics.duplicatesFound++;
    this.routingStatistics.totalRouted++;
    this.routingStatistics.totalConfidence += decision.confidence;
  }

  private updateRoutingStatistics(decision: RoutingDecision): void {
    this.routingStatistics.totalRouted++;
    this.routingStatistics.totalConfidence += decision.confidence;
    
    if (decision.action === 'unsorted') {
      this.routingStatistics.unsortedCount++;
    }
  }

  // Placeholder implementations for complex batch operations
  private async processConceptsBatch(candidates: ConceptCandidate[]): Promise<ProcessedConcept[]> {
    const results: ProcessedConcept[] = [];
    
    for (const candidate of candidates) {
      const pipelineContext = await this.executeDistillationAndEmbeddingPipeline(candidate);
      const folderMatches = await this.findBestFolderMatches(pipelineContext.embeddings);
      
      results.push({
        candidate,
        distilled: pipelineContext.distilled,
        embeddings: pipelineContext.embeddings,
        folderMatches
      });
    }
    
    return results;
  }

  private async processIndividualRouting(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const decisions: RoutingDecision[] = [];
    for (const candidate of candidates) {
      decisions.push(await this.route(candidate));
    }
    
    return { 
      decisions, 
      clusters: [], 
      suggestedFolders: [] 
    };
  }

  private async createBatchRoutingDecisions(processedConcepts: ProcessedConcept[]): Promise<RoutingDecision[]> {
    const decisions: RoutingDecision[] = [];
    
    for (const processed of processedConcepts) {
      const decisionContext = this.buildDecisionContext(
        processed.folderMatches,
        { distilled: processed.distilled, embeddings: processed.embeddings }
      );
      const decision = this.routingDecisionMaker.makeRoutingDecision(decisionContext);
      decisions.push(decision);
    }
    
    return decisions;
  }

  private async findUnsortedSimilarConcepts(embeddings: VectorEmbeddings): Promise<SimilarConcept[]> {
    const results = await this.vectorIndexManager.searchByContext({
      vector: embeddings.contextVector,
      threshold: this.pipelineConfig.clustering.unsortedSimilarityThreshold,
      limit: this.pipelineConfig.clustering.unsortedSearchLimit
    });
    
    return results.filter(result => result.folderId === 'unsorted' || !result.folderId);
  }

  private evaluateFolderCreationOpportunity(
    candidate: ConceptCandidate,
    unsortedSimilar: SimilarConcept[],
    distilled: DistilledContent
  ): FolderSuggestion | null {
    const minimumClusterSize = this.internalConfig.minClusterSize! - 1;
    
    if (unsortedSimilar.length >= minimumClusterSize) {
      return {
        name: this.generateFolderNameFromContent(distilled),
        concepts: [candidate.id, ...unsortedSimilar.map(similar => similar.conceptId)],
        confidence: ScoringUtilities.calculateAverageSimilarity(unsortedSimilar)
      };
    }

    return null;
  }

  private createFolderSuggestionFromCluster(cluster: ConceptCluster): FolderSuggestion | null {
    return {
      name: `Cluster-${Date.now()}`,
      concepts: cluster.concepts,
      confidence: cluster.coherence
    };
  }

  private generateFolderNameFromContent(distilled: DistilledContent): string {
    const words = distilled.title.split(/\s+/).slice(0, 3);
    return words.join(' ');
  }
}