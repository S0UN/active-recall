/**
 * Extended Dependency Injection Container for Concept Organizer Core
 * 
 * This file defines:
 * - Registration of all core service interfaces
 * - Default implementations with strategy pattern
 * - Test configuration overrides
 * - Environment-specific bindings
 * 
 * Design principles:
 * - Register interfaces, not concrete classes
 * - Singleton for stateless services
 * - Transient for stateful operations
 * - Easy test mocking via container reset
 */

import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';

// Import all service interfaces
import {
  // Pipeline services
  ISessionAssembler,
  IConceptExtractor, 
  IRouter,
  IArtifactBuilder,
  IPipelineOrchestrator,
  
  // Storage services
  IConceptArtifactRepository,
  IFolderRepository,
  IAuditRepository,
  
  // Indexing services
  IVectorIndex,
  IEmbeddingService,
  IFolderIndex,
  
  // Quality services
  IDeduplicationService,
  IReviewQueueService,
  
  // LLM services
  ILLMService,
  ITokenBudgetManager,
  
  // Maintenance services
  IJobScheduler,
  ISessionManifestService,
} from './services/interfaces';

// Import default implementations (will be created in Sprint 1)
// For now, we'll register the interfaces with placeholder classes

/**
 * Placeholder implementation for development
 * Will be replaced with real implementations in subsequent sprints
 */
class NotImplementedYet {
  constructor(private readonly serviceName: string) {}
  
  [key: string]: any;
  
  private notImplemented(method: string): never {
    throw new Error(
      `${this.serviceName}.${method} not implemented yet - will be added in Sprint 1+`
    );
  }
}

/**
 * Container configuration for different environments
 */
export interface ContainerConfig {
  environment: 'development' | 'test' | 'production';
  useLocalOnly: boolean;
  enableLLM: boolean;
  enableCaching: boolean;
}

/**
 * Default configuration for development
 */
export const DEFAULT_CONFIG: ContainerConfig = {
  environment: 'development',
  useLocalOnly: true,
  enableLLM: false,
  enableCaching: true,
};

/**
 * Extended container class with Concept Organizer services
 */
export class ConceptOrganizerContainer {
  private container: DependencyContainer;
  private config: ContainerConfig;
  
  constructor(config: ContainerConfig = DEFAULT_CONFIG) {
    this.container = container.createChildContainer();
    this.config = config;
    this.registerServices();
  }
  
  /**
   * Register all service implementations
   */
  private registerServices(): void {
    this.registerPipelineServices();
    this.registerStorageServices();
    this.registerIndexingServices();
    this.registerQualityServices();
    this.registerLLMServices();
    this.registerMaintenanceServices();
  }
  
  /**
   * Pipeline services - core processing chain
   */
  private registerPipelineServices(): void {
    // Session assembler - converts batches to candidates
    this.container.register<ISessionAssembler>(
      'ISessionAssembler',
      {
        useValue: new NotImplementedYet('ISessionAssembler')
        // TODO Sprint 1: Replace with SessionAssemblerService
      }
    );
    
    // Concept extractor - LLM enhancement (optional)
    this.container.register<IConceptExtractor>(
      'IConceptExtractor',
      {
        useValue: new NotImplementedYet('IConceptExtractor')
        // TODO Sprint 1: Replace with ConceptExtractorService
        // Implementation will check config.enableLLM
      }
    );
    
    // Router - intelligent placement decisions
    this.container.register<IRouter>(
      'IRouter',
      {
        useValue: new NotImplementedYet('IRouter')
        // TODO Sprint 2: Replace with SmartRouterService
        // Sprint 1: Use SimpleRouterService (rule-based)
      }
    );
    
    // Artifact builder - creates final artifacts
    this.container.register<IArtifactBuilder>(
      'IArtifactBuilder',
      {
        useValue: new NotImplementedYet('IArtifactBuilder')
        // TODO Sprint 1: Replace with ArtifactBuilderService
      }
    );
    
    // Pipeline orchestrator - coordinates all steps
    this.container.register<IPipelineOrchestrator>(
      'IPipelineOrchestrator',
      {
        useValue: new NotImplementedYet('IPipelineOrchestrator')
        // TODO Sprint 1: Replace with PipelineOrchestratorService
        // Will integrate with existing Orchestrator.ts
      }
    );
  }
  
  /**
   * Storage services - data persistence
   */
  private registerStorageServices(): void {
    // Concept artifact repository - file system storage
    this.container.register<IConceptArtifactRepository>(
      'IConceptArtifactRepository',
      {
        useValue: new NotImplementedYet('IConceptArtifactRepository')
        // TODO Sprint 1: Replace with FileSystemArtifactRepository
        // Handles atomic writes, idempotency, JSON + optional markdown
      }
    );
    
    // Folder repository - hierarchy and manifests  
    this.container.register<IFolderRepository>(
      'IFolderRepository',
      {
        useValue: new NotImplementedYet('IFolderRepository')
        // TODO Sprint 1: Replace with SQLiteFolderRepository
        // Manages folder manifests, poly-hierarchy, renames
      }
    );
    
    // Audit repository - append-only event log
    this.container.register<IAuditRepository>(
      'IAuditRepository',
      {
        useValue: new NotImplementedYet('IAuditRepository')
        // TODO Sprint 1: Replace with FileSystemAuditRepository
        // JSONL format, daily rotation, never lose events
      }
    );
  }
  
  /**
   * Indexing services - vector and search operations
   */
  private registerIndexingServices(): void {
    // Vector index - Qdrant integration
    this.container.register<IVectorIndex>(
      'IVectorIndex',
      {
        useValue: new NotImplementedYet('IVectorIndex')
        // TODO Sprint 2: Replace with QdrantVectorIndex
        // Dual vectors (label + context), HNSW optimization
      }
    );
    
    // Embedding service - text to vectors
    this.container.register<IEmbeddingService>(
      'IEmbeddingService',
      {
        useValue: new NotImplementedYet('IEmbeddingService')
        // TODO Sprint 2: Replace based on config
        // - LocalEmbeddingService (Transformers.js) if useLocalOnly
        // - OpenAIEmbeddingService (hosted) otherwise
        // - Cached results to avoid recomputation
      }
    );
    
    // Folder index - centroid management
    this.container.register<IFolderIndex>(
      'IFolderIndex',
      {
        useValue: new NotImplementedYet('IFolderIndex')
        // TODO Sprint 2: Replace with FolderIndexService
        // Maintains centroids, exemplars, lexical footprints
      }
    );
  }
  
  /**
   * Quality services - dedup and review
   */
  private registerQualityServices(): void {
    // Deduplication service - prevent duplicates
    this.container.register<IDeduplicationService>(
      'IDeduplicationService',
      {
        useValue: new NotImplementedYet('IDeduplicationService')
        // TODO Sprint 3: Replace with DeduplicationService  
        // Content hash + semantic similarity checks
      }
    );
    
    // Review queue service - human oversight
    this.container.register<IReviewQueueService>(
      'IReviewQueueService',
      {
        useValue: new NotImplementedYet('IReviewQueueService')
        // TODO Sprint 3: Replace with SQLiteReviewQueueService
        // Queue management, suggested actions, metrics
      }
    );
  }
  
  /**
   * LLM services - AI enhancement (optional)
   */
  private registerLLMServices(): void {
    if (this.config.enableLLM) {
      // LLM service - summaries and arbitration
      this.container.register<ILLMService>(
        'ILLMService',
        {
          useValue: new NotImplementedYet('ILLMService')
          // TODO Sprint 4: Replace with OpenAILLMService or similar
          // Prompts, retries, structured outputs, caching
        }
      );
      
      // Token budget manager - cost control
      this.container.register<ITokenBudgetManager>(
        'ITokenBudgetManager',
        {
          useValue: new NotImplementedYet('ITokenBudgetManager')
          // TODO Sprint 4: Replace with TokenBudgetManagerService
          // Daily/monthly caps, usage tracking, alerts
        }
      );
    } else {
      // Null implementations when LLM disabled
      this.container.register<ILLMService>(
        'ILLMService',
        {
          useValue: new DisabledLLMService()
        }
      );
      
      this.container.register<ITokenBudgetManager>(
        'ITokenBudgetManager',
        {
          useValue: new DisabledTokenBudgetManager()
        }
      );
    }
  }
  
  /**
   * Maintenance services - background jobs
   */
  private registerMaintenanceServices(): void {
    // Job scheduler - background tasks
    this.container.register<IJobScheduler>(
      'IJobScheduler',
      {
        useValue: new NotImplementedYet('IJobScheduler')
        // TODO Sprint 5: Replace with CronJobScheduler
        // Rename jobs, tidy jobs, index maintenance
      }
    );
    
    // Session manifest service - recovery tracking
    this.container.register<ISessionManifestService>(
      'ISessionManifestService',
      {
        useValue: new NotImplementedYet('ISessionManifestService')
        // TODO Sprint 1: Replace with SessionManifestService
        // Track processing sessions for audit and recovery
      }
    );
  }
  
  /**
   * Get service instance by interface
   */
  resolve<T>(token: string): T {
    return this.container.resolve<T>(token);
  }
  
  /**
   * Register custom implementation (for testing)
   */
  register<T>(token: string, implementation: T): void {
    this.container.register(token, { useValue: implementation });
  }
  
  /**
   * Create child container for isolated testing
   */
  createTestContainer(): ConceptOrganizerContainer {
    const testConfig: ContainerConfig = {
      ...this.config,
      environment: 'test',
    };
    
    return new ConceptOrganizerContainer(testConfig);
  }
  
  /**
   * Reset container to default state
   */
  reset(): void {
    this.container.clearInstances();
    this.registerServices();
  }
  
  /**
   * Get current configuration
   */
  getConfig(): ContainerConfig {
    return { ...this.config };
  }
}

// =============================================================================
// DISABLED SERVICE IMPLEMENTATIONS
// =============================================================================

/**
 * Null implementation when LLM is disabled
 * Always returns fallback results
 */
class DisabledLLMService implements ILLMService {
  async generateSummary(text: string) {
    // Extract first sentence as title, first 200 chars as summary
    const sentences = text.split(/[.!?]+/);
    const title = sentences[0]?.substring(0, 80) || 'Untitled Concept';
    const summary = text.substring(0, 200) + (text.length > 200 ? '...' : '');
    
    return {
      title: title.trim(),
      summary: summary.trim(),
      confidence: 0.1, // Low confidence without LLM
    };
  }
  
  async arbitrateRouting() {
    throw new Error('LLM arbitration disabled - route to Unsorted instead');
  }
  
  async proposeRename() {
    throw new Error('LLM rename disabled - keep current folder names');
  }
  
  async isAvailable(): Promise<boolean> {
    return false;
  }
  
  async getUsageStats() {
    return {
      tokensUsedToday: 0,
      tokensRemaining: 0,
      requestsToday: 0,
      averageLatency: 0,
      errorRate: 0,
    };
  }
}

/**
 * Null implementation when token budget is disabled
 */
class DisabledTokenBudgetManager implements ITokenBudgetManager {
  async canUse(): Promise<boolean> {
    return false; // Never allow LLM usage when disabled
  }
  
  async recordUsage(): Promise<void> {
    // No-op
  }
  
  async getBudgetStatus() {
    return {
      dailyLimit: 0,
      dailyUsed: 0,
      dailyRemaining: 0,
      monthlyUsed: 0,
      estimatedMonthlyCost: 0,
    };
  }
  
  async resetDailyBudget(): Promise<void> {
    // No-op
  }
}

// =============================================================================
// CONTAINER FACTORY
// =============================================================================

/**
 * Create container with environment-specific configuration
 */
export function createConceptOrganizerContainer(
  config?: Partial<ContainerConfig>
): ConceptOrganizerContainer {
  const fullConfig: ContainerConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  
  return new ConceptOrganizerContainer(fullConfig);
}

/**
 * Create test container with mocked services
 */
export function createTestContainer(): ConceptOrganizerContainer {
  return createConceptOrganizerContainer({
    environment: 'test',
    useLocalOnly: true,
    enableLLM: false,
    enableCaching: false,
  });
}

// Export singleton for convenience (can be overridden for tests)
export const conceptOrganizerContainer = createConceptOrganizerContainer();