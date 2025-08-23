/**
 * RoutingPipeline - Orchestrates the DISTILL → EMBED → ROUTE flow
 * 
 * This class encapsulates the pipeline execution logic, operating at a single
 * level of abstraction. It coordinates the flow between services without
 * containing implementation details, making the code read like a narrative.
 */

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { IDistillationService } from '../IDistillationService';
import { IEmbeddingService } from '../IEmbeddingService';
import { RoutingDecision, RoutingPipelineError } from '../ISmartRouter';
import { DuplicateDetectionService } from './DuplicateDetectionService';
import { FolderMatchingService } from './FolderMatchingService';
import { RoutingDecisionMaker } from './RoutingDecisionMaker';

export interface PipelineContext {
  candidate: ConceptCandidate;
  distilled?: DistilledContent;
  embeddings?: VectorEmbeddings;
  startTime: number;
}

export interface PipelineResult {
  decision: RoutingDecision;
  processingTime: number;
  context: PipelineContext;
}

export class RoutingPipeline {
  private readonly duplicateDetector: DuplicateDetectionService;
  private readonly folderMatcher: FolderMatchingService;
  private readonly decisionMaker: RoutingDecisionMaker;

  constructor(
    private readonly distillationService: IDistillationService,
    private readonly embeddingService: IEmbeddingService,
    dependencies: {
      duplicateDetector: DuplicateDetectionService;
      folderMatcher: FolderMatchingService;
      decisionMaker: RoutingDecisionMaker;
    }
  ) {
    this.duplicateDetector = dependencies.duplicateDetector;
    this.folderMatcher = dependencies.folderMatcher;
    this.decisionMaker = dependencies.decisionMaker;
  }

  /**
   * Execute the complete routing pipeline for a concept
   */
  async execute(candidate: ConceptCandidate): Promise<PipelineResult> {
    const context = this.createPipelineContext(candidate);

    try {
      // DISTILL: Extract structured content
      context.distilled = await this.distillContent(candidate);

      // EMBED: Generate vector representation
      context.embeddings = await this.generateEmbeddings(context.distilled);

      // CHECK: Detect duplicates
      const duplicateCheck = await this.checkForDuplicates(context.embeddings);
      if (duplicateCheck.isDuplicate) {
        return this.createResult(duplicateCheck.decision!, context);
      }

      // ROUTE: Find best folder placement
      const decision = await this.routeToFolder(context.embeddings, context.distilled);
      return this.createResult(decision, context);

    } catch (error) {
      throw this.handlePipelineError(error, context);
    }
  }

  /**
   * Execute batch processing with clustering support
   */
  async executeBatch(candidates: ConceptCandidate[]): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    // Process each candidate through the pipeline
    for (const candidate of candidates) {
      const result = await this.execute(candidate);
      results.push(result);
    }

    return results;
  }

  private createPipelineContext(candidate: ConceptCandidate): PipelineContext {
    return {
      candidate,
      startTime: Date.now()
    };
  }

  private async distillContent(candidate: ConceptCandidate): Promise<DistilledContent> {
    try {
      const normalized = candidate.normalize();
      return await this.distillationService.distill(normalized);
    } catch (error) {
      throw this.createStageError('distill', 'Failed to distill content', error);
    }
  }

  private async generateEmbeddings(distilled: DistilledContent): Promise<VectorEmbeddings> {
    try {
      return await this.embeddingService.embed(distilled);
    } catch (error) {
      throw this.createStageError('embed', 'Failed to generate embeddings', error);
    }
  }

  private async checkForDuplicates(embeddings: VectorEmbeddings): Promise<{ isDuplicate: boolean; decision?: RoutingDecision }> {
    try {
      return await this.duplicateDetector.checkForDuplicates(embeddings);
    } catch (error) {
      // Duplicate detection failure is non-fatal, continue routing
      console.warn('Duplicate detection failed, continuing with routing', error);
      return { isDuplicate: false };
    }
  }

  private async routeToFolder(embeddings: VectorEmbeddings, distilled: DistilledContent): Promise<RoutingDecision> {
    try {
      // Find similar folders
      const folderMatches = await this.folderMatcher.findBestFolders(embeddings);

      // Make routing decision
      return await this.decisionMaker.makeDecision(folderMatches, embeddings, distilled);
    } catch (error) {
      throw this.createStageError('route', 'Failed to route concept', error);
    }
  }

  private createResult(decision: RoutingDecision, context: PipelineContext): PipelineResult {
    return {
      decision,
      processingTime: Date.now() - context.startTime,
      context
    };
  }

  private createStageError(stage: 'distill' | 'embed' | 'route', message: string, error: unknown): RoutingPipelineError {
    return new RoutingPipelineError(
      stage,
      message,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  private handlePipelineError(error: unknown, _context: PipelineContext): RoutingPipelineError {
    if (error instanceof RoutingPipelineError) {
      return error;
    }
    
    return new RoutingPipelineError(
      'route',
      'Unexpected error during pipeline execution',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}