/**
 * SmartRouter - High-level orchestrator for concept routing
 * 
 * This class now operates at a single level of abstraction, delegating
 * all implementation details to specialized services. It reads like a
 * narrative, making it easy for new developers to understand the flow.
 * 
 * Refactored to follow clean code principles:
 * - Single Responsibility: Only orchestrates, doesn't implement
 * - Clear abstraction levels: High-level coordination only
 * - Reduced cognitive load: Delegates to focused services
 */

import {
  ISmartRouter,
  SmartRouterConfig,
  RoutingDecision,
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

// Extracted services for clean separation of concerns
import { RoutingPipeline, PipelineResult } from './RoutingPipeline';
import { RoutingMetricsCollector } from './RoutingMetricsCollector';
import { DuplicateDetectionService } from './DuplicateDetectionService';
import { FolderMatchingService } from './FolderMatchingService';
import { RoutingDecisionMaker } from './RoutingDecisionMaker';
import { BatchProcessingService } from './BatchProcessingService';
import { ExpansionDetectionService } from './ExpansionDetectionService';

// Configuration moved to dedicated services
// Types moved to respective service files

export class SmartRouter implements ISmartRouter {
  private readonly pipeline: RoutingPipeline;
  private readonly metricsCollector: RoutingMetricsCollector;
  private readonly batchProcessor: BatchProcessingService;
  private readonly expansionDetector: ExpansionDetectionService;
  private readonly pipelineConfig: PipelineConfig;

  constructor(
    distillService: IDistillationService,
    embeddingService: IEmbeddingService,
    vectorIndex: IVectorIndexManager,
    config?: Partial<SmartRouterConfig>,
    pipelineConfig?: PipelineConfig
  ) {
    this.pipelineConfig = pipelineConfig || loadPipelineConfig();
    
    // Initialize specialized services
    const duplicateDetector = new DuplicateDetectionService(vectorIndex, this.pipelineConfig);
    const folderMatcher = new FolderMatchingService(vectorIndex, this.pipelineConfig);
    const decisionMaker = new RoutingDecisionMaker(this.pipelineConfig);
    
    // Initialize pipeline with all dependencies
    this.pipeline = new RoutingPipeline(
      distillService,
      embeddingService,
      vectorIndex,
      { duplicateDetector, folderMatcher, decisionMaker }
    );
    
    // Initialize other services
    this.metricsCollector = new RoutingMetricsCollector();
    this.batchProcessor = new BatchProcessingService(this.pipeline, this.pipelineConfig);
    this.expansionDetector = new ExpansionDetectionService(
      distillService,
      embeddingService,
      vectorIndex,
      this.pipelineConfig
    );
  }

  // Configuration now handled by individual services

  /**
   * Route a single concept through the pipeline
   * This method now simply delegates to the pipeline and records metrics
   */
  async route(candidate: ConceptCandidate): Promise<RoutingDecision> {
    try {
      const result = await this.pipeline.execute(candidate);
      this.metricsCollector.recordRoutingDecision(result.decision, result.processingTime);
      return result.decision;
    } catch (error) {
      if (error instanceof RoutingPipelineError) {
        throw error;
      }
      throw new RoutingPipelineError(
        'route',
        'Unexpected error during routing',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // Pipeline execution now handled by RoutingPipeline service

  /**
   * Process a batch of concepts with optional clustering
   * Delegates to BatchProcessingService for implementation
   */
  async routeBatch(candidates: ConceptCandidate[]): Promise<BatchRoutingResult> {
    const result = await this.batchProcessor.processBatch(candidates);
    
    // Record metrics for batch processing
    for (const decision of result.decisions) {
      this.metricsCollector.recordRoutingDecision(decision);
    }
    
    return result;
  }

  /**
   * Check if there's an opportunity to create a new folder
   * Delegates to ExpansionDetectionService
   */
  async checkExpansionOpportunity(candidate: ConceptCandidate): Promise<FolderSuggestion | null> {
    const suggestion = await this.expansionDetector.detectExpansionOpportunity(candidate);
    
    if (suggestion) {
      this.metricsCollector.recordFolderCreation();
    }
    
    return suggestion;
  }

  /**
   * Get routing statistics
   * Now delegates to RoutingMetricsCollector
   */
  async getRoutingStats(): Promise<{
    totalRouted: number;
    duplicatesFound: number;
    foldersCreated: number;
    unsortedCount: number;
    averageConfidence: number;
  }> {
    const metrics = this.metricsCollector.getMetricsSummary();
    
    return {
      totalRouted: metrics.totalRouted,
      duplicatesFound: metrics.duplicatesFound,
      foldersCreated: metrics.foldersCreated,
      unsortedCount: metrics.unsortedCount,
      averageConfidence: metrics.averageConfidence
    };
  }

  // All implementation methods have been extracted to specialized services:
  // - RoutingPipeline: Handles DISTILL → EMBED → ROUTE flow
  // - DuplicateDetectionService: Handles duplicate detection
  // - FolderMatchingService: Handles folder matching and scoring
  // - RoutingDecisionMaker: Handles routing decisions
  // - RoutingMetricsCollector: Handles statistics tracking
  // - BatchProcessingService: Handles batch processing with clustering
  // - ExpansionDetectionService: Handles expansion opportunity detection
  //
  // This separation improves:
  // - Readability: Each class has a single, clear purpose
  // - Testability: Each service can be tested in isolation
  // - Maintainability: Changes are localized to specific services
  // - Cognitive load: Developers only need to understand one concern at a time
}