/**
 * IIntelligentFolderService - Academic Domain Intelligence for Folder Routing
 * 
 * This service provides the core intelligence for the new folder routing system,
 * replacing the broken multi-folder placement logic with academic-aware routing.
 * 
 * Key Features:
 * - Academic domain intelligence with proper hierarchy creation
 * - Bootstrap mode for empty systems (< 20 concepts)
 * - Context filtering for mature systems (500+ concepts)
 * - Vector-based discovery with single source of truth
 * - Adaptive system states: Bootstrap → Growing → Mature
 * - Real academic conventions: Domain → Field → Subfield → Topic
 * 
 * Architecture Philosophy:
 * - Single source of truth for each concept
 * - Cross-folder relationships through vector discovery
 * - LLM provides intelligence, vectors provide discovery
 * - Context efficiency to prevent LLM overload
 * - Progressive enhancement as system grows
 */

import { ConceptCandidate, DistilledContent, VectorEmbeddings } from '../contracts/schemas';

/**
 * System state determines routing behavior
 */
export type SystemState = 'bootstrap' | 'growing' | 'mature';

/**
 * Academic routing decision with full context
 */
export interface AcademicRoutingDecision {
  /** Primary action to take */
  action: 'route' | 'create_folder' | 'unsorted' | 'duplicate' | 'reorganize';
  
  /** Target folder ID (for route action) */
  folderId?: string;
  
  /** New folder specification (for create_folder action) */
  newFolder?: NewFolderSpecification;
  
  /** Existing concept ID (for duplicate action) */
  duplicateId?: string;
  
  /** Reorganization plan (for reorganize action) */
  reorganization?: ReorganizationPlan;
  
  /** Confidence in the decision (0.0 - 1.0) */
  confidence: number;
  
  /** Academic reasoning and context */
  academicReasoning: AcademicReasoning;
  
  /** Tokens used for this decision */
  tokensUsed: number;
  
  /** System state when decision was made */
  systemState: SystemState;
}

/**
 * New folder specification with academic hierarchy
 */
export interface NewFolderSpecification {
  /** Proposed folder name */
  name: string;
  
  /** Full academic path (e.g., "Mathematics/Algebra/Abstract Algebra") */
  academicPath: string;
  
  /** Academic abstraction level */
  level: AcademicLevel;
  
  /** Domain classification */
  domain: AcademicDomain;
  
  /** Parent folder ID (if creating subfolder) */
  parentId?: string;
  
  /** Required parent folders to create */
  requiredParents: string[];
  
  /** Academic justification */
  justification: string;
}

/**
 * Academic abstraction levels
 */
export type AcademicLevel = 'domain' | 'field' | 'subfield' | 'topic' | 'concept';

/**
 * Academic domain classifications
 */
export type AcademicDomain = 
  | 'mathematics' | 'physics' | 'chemistry' | 'biology' | 'medicine'
  | 'computer_science' | 'engineering' | 'psychology' | 'economics'
  | 'philosophy' | 'history' | 'literature' | 'linguistics'
  | 'interdisciplinary' | 'other';

/**
 * Academic reasoning context
 */
export interface AcademicReasoning {
  /** Primary academic signal used */
  primarySignal: string;
  
  /** Domain-specific analysis */
  domainAnalysis: string;
  
  /** Hierarchy placement rationale */
  hierarchyRationale: string;
  
  /** Decision factors considered */
  decisionFactors: string[];
  
  /** Alternative placements considered */
  alternativesConsidered: AlternativePlacement[];
  
  /** Cross-folder relationships discovered */
  relatedConcepts: RelatedConcept[];
}

/**
 * Alternative placement option
 */
export interface AlternativePlacement {
  folderId: string;
  folderPath: string;
  confidence: number;
  reasoning: string;
}

/**
 * Related concept from discovery
 */
export interface RelatedConcept {
  conceptId: string;
  folderId: string;
  similarity: number;
  relationship: string;
}

/**
 * Reorganization plan for cohesive improvements
 */
export interface ReorganizationPlan {
  /** Type of reorganization */
  type: 'subfolder_creation' | 'hierarchy_improvement' | 'domain_consolidation';
  
  /** Concepts to be reorganized */
  affectedConcepts: string[];
  
  /** New folder structure */
  targetStructure: FolderStructureChange[];
  
  /** Academic justification */
  academicJustification: string;
  
  /** Estimated improvement score */
  improvementScore: number;
}

/**
 * Folder structure change specification
 */
export interface FolderStructureChange {
  action: 'create' | 'move' | 'rename' | 'merge';
  folderId?: string;
  newName?: string;
  newPath?: string;
  conceptIds?: string[];
}

/**
 * Context for routing decisions
 */
export interface RoutingContext {
  /** Current system state */
  systemState: SystemState;
  
  /** Total concept count */
  totalConcepts: number;
  
  /** Current folder structure */
  folderStructure: FolderContext[];
  
  /** Similar concepts from vector search */
  similarConcepts: SimilarConcept[];
  
  /** Recent routing decisions */
  recentDecisions: RecentDecision[];
  
  /** Available token budget */
  tokenBudget: number;
}

/**
 * Folder context with academic metadata
 */
export interface FolderContext {
  id: string;
  name: string;
  path: string;
  level: AcademicLevel;
  domain: AcademicDomain;
  conceptCount: number;
  sampleConcepts: ConceptSample[];
  centroid?: number[]; // Vector representation
}

/**
 * Sample concept for context
 */
export interface ConceptSample {
  id: string;
  title: string;
  summary: string;
}

/**
 * Similar concept from vector search
 */
export interface SimilarConcept {
  conceptId: string;
  folderId: string | null;
  similarity: number;
  title: string;
  summary: string;
}

/**
 * Recent routing decision for pattern analysis
 */
export interface RecentDecision {
  timestamp: Date;
  action: string;
  confidence: number;
  domain: AcademicDomain;
}

/**
 * Bootstrap analysis for empty systems
 */
export interface BootstrapAnalysis {
  /** Recommended initial folder structure */
  recommendedFolders: NewFolderSpecification[];
  
  /** Concept assignments */
  conceptAssignments: ConceptAssignment[];
  
  /** Academic domains detected */
  detectedDomains: AcademicDomain[];
  
  /** Confidence in bootstrap structure */
  confidence: number;
  
  /** Academic justification */
  justification: string;
  
  /** Tokens used */
  tokensUsed: number;
}

/**
 * Concept assignment in bootstrap
 */
export interface ConceptAssignment {
  conceptId: string;
  folderId: string;
  confidence: number;
  reasoning: string;
}

/**
 * Discovery context for cross-folder relationships
 */
export interface DiscoveryContext {
  /** Source folder being viewed */
  sourceFolderId: string;
  
  /** Concepts discovered from other folders */
  discoveredConcepts: DiscoveredConcept[];
  
  /** Discovery method used */
  discoveryMethod: 'vector_similarity' | 'academic_relationship' | 'topic_modeling';
  
  /** Relevance threshold applied */
  relevanceThreshold: number;
}

/**
 * Discovered concept from another folder
 */
export interface DiscoveredConcept {
  conceptId: string;
  sourceFolderId: string;
  targetFolderId: string;
  similarity: number;
  relationshipType: string;
  academicConnection: string;
}

/**
 * Main interface for intelligent folder routing
 */
export interface IIntelligentFolderService {
  /**
   * Make academic routing decision for a concept
   * 
   * Core method that determines where a concept should be placed using
   * academic domain intelligence, vector similarity, and context analysis.
   * 
   * @param concept - The distilled concept to route
   * @param embeddings - Vector embeddings for similarity search
   * @param context - Current system context and similar concepts
   * @returns Promise<AcademicRoutingDecision> - Intelligent routing decision
   */
  makeRoutingDecision(
    concept: DistilledContent,
    embeddings: VectorEmbeddings,
    context: RoutingContext
  ): Promise<AcademicRoutingDecision>;

  /**
   * Bootstrap empty system with initial academic structure
   * 
   * Analyzes a batch of concepts and creates an intelligent initial
   * folder structure based on academic domain analysis.
   * 
   * @param concepts - Initial batch of concepts (< 20)
   * @param embeddings - Embeddings for all concepts
   * @returns Promise<BootstrapAnalysis> - Bootstrap recommendations
   */
  bootstrapSystem(
    concepts: { concept: DistilledContent; embeddings: VectorEmbeddings }[],
    existingFolders?: FolderContext[]
  ): Promise<BootstrapAnalysis>;

  /**
   * Discover related concepts across folders
   * 
   * Uses vector similarity and academic relationships to find
   * concepts in other folders that are relevant to the current context.
   * 
   * @param sourceFolderId - Folder being viewed
   * @param contextConcepts - Concepts in the current folder
   * @param allFolderConcepts - Concepts from other folders
   * @returns Promise<DiscoveryContext> - Cross-folder discovery results
   */
  discoverRelatedConcepts(
    sourceFolderId: string,
    contextConcepts: SimilarConcept[],
    allFolderConcepts: SimilarConcept[]
  ): Promise<DiscoveryContext>;

  /**
   * Determine current system state
   * 
   * @param totalConcepts - Total number of concepts in system
   * @param folderCount - Total number of folders
   * @returns SystemState - Current state classification
   */
  determineSystemState(totalConcepts: number, folderCount: number): SystemState;

  /**
   * Check if cohesive reorganization is needed
   * 
   * Analyzes recent routing decisions to detect opportunities for
   * structural improvements like subfolder creation or hierarchy changes.
   * 
   * @param recentDecisions - Recent routing decisions
   * @param folderStructure - Current folder structure
   * @returns Promise<ReorganizationPlan | null> - Reorganization recommendations
   */
  analyzeReorganizationOpportunity(
    recentDecisions: RecentDecision[],
    folderStructure: FolderContext[]
  ): Promise<ReorganizationPlan | null>;

  /**
   * Get academic metadata for a folder
   * 
   * @param folderId - Target folder ID
   * @param conceptSamples - Sample concepts from the folder
   * @returns Promise<AcademicMetadata> - Academic classification and metadata
   */
  getAcademicMetadata(
    folderId: string,
    conceptSamples: ConceptSample[]
  ): Promise<AcademicMetadata>;

  /**
   * Validate academic hierarchy
   * 
   * @param proposedStructure - Proposed folder structure changes
   * @returns Promise<ValidationResult> - Validation results and suggestions
   */
  validateAcademicHierarchy(
    proposedStructure: FolderStructureChange[]
  ): Promise<ValidationResult>;

  /**
   * Get provider identifier
   * 
   * @returns string - Service provider (e.g., "openai-gpt4")
   */
  getProvider(): string;

  /**
   * Get current token usage statistics
   * 
   * @returns Promise<TokenUsageStats> - Usage tracking information
   */
  getUsageStats(): Promise<TokenUsageStats>;

  /**
   * Check if service is available within budget
   * 
   * @returns Promise<boolean> - True if service can handle requests
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Academic metadata for folders
 */
export interface AcademicMetadata {
  domain: AcademicDomain;
  level: AcademicLevel;
  confidence: number;
  academicPath: string;
  relatedDomains: AcademicDomain[];
  conceptualThemes: string[];
}

/**
 * Validation result for academic hierarchy
 */
export interface ValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  suggestions: string[];
  confidence: number;
}

/**
 * Validation violation
 */
export interface ValidationViolation {
  type: 'hierarchy_depth' | 'domain_mixing' | 'abstraction_jump' | 'redundancy';
  severity: 'error' | 'warning' | 'info';
  description: string;
  affectedFolders: string[];
}

/**
 * Token usage statistics
 */
export interface TokenUsageStats {
  totalTokensUsed: number;
  dailyTokensUsed: number;
  averageTokensPerDecision: number;
  remainingDailyBudget: number;
  operationBreakdown: Record<string, number>;
}

/**
 * Configuration for intelligent folder service
 */
export interface IntelligentFolderConfig {
  /** LLM provider settings */
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: string;
  model: string;
  
  /** Token budget management */
  dailyTokenBudget: number;
  maxTokensPerDecision: number;
  
  /** Academic intelligence settings */
  enableAcademicDomainDetection: boolean;
  enableHierarchyValidation: boolean;
  maxHierarchyDepth: number;
  
  /** System state thresholds */
  bootstrapThreshold: number; // < this many concepts = bootstrap
  matureThreshold: number;    // > this many concepts = mature
  
  /** Discovery settings */
  discoveryEnabled: boolean;
  maxDiscoveredConcepts: number;
  discoveryThreshold: number;
  
  /** Context filtering */
  maxContextFolders: number;
  maxConceptSamplesPerFolder: number;
  
  /** Confidence thresholds */
  highConfidenceThreshold: number;
  minimumConfidenceThreshold: number;
  
  /** Reorganization settings */
  enableReorganization: boolean;
  reorganizationCooldown: number; // minutes
  
  /** Performance settings */
  enableCaching: boolean;
  cacheTimeout: number; // minutes
  requestTimeout: number; // milliseconds
}

/**
 * Error hierarchy for intelligent folder operations
 */

/**
 * Base error for intelligent folder operations
 */
export class IntelligentFolderError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IntelligentFolderError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IntelligentFolderError);
    }
  }
}

/**
 * Token budget exceeded error
 */
export class TokenBudgetExceededError extends IntelligentFolderError {
  constructor(
    operation: string,
    used: number,
    budget: number
  ) {
    super(
      `Token budget exceeded for ${operation}: ${used}/${budget} tokens`,
      operation
    );
    this.name = 'TokenBudgetExceededError';
  }
}

/**
 * Academic validation error
 */
export class AcademicValidationError extends IntelligentFolderError {
  constructor(
    operation: string,
    violations: ValidationViolation[]
  ) {
    super(
      `Academic validation failed: ${violations.map(v => v.description).join(', ')}`,
      operation,
      undefined,
      { violations }
    );
    this.name = 'AcademicValidationError';
  }
}

/**
 * Service unavailable error
 */
export class IntelligentFolderServiceUnavailableError extends IntelligentFolderError {
  constructor(
    operation: string,
    reason: string
  ) {
    super(`Service unavailable for ${operation}: ${reason}`, operation);
    this.name = 'IntelligentFolderServiceUnavailableError';
  }
}

/**
 * Context overflow error
 */
export class ContextOverflowError extends IntelligentFolderError {
  constructor(
    operation: string,
    contextSize: number,
    maxSize: number
  ) {
    super(
      `Context overflow for ${operation}: ${contextSize} > ${maxSize} tokens`,
      operation
    );
    this.name = 'ContextOverflowError';
  }
}