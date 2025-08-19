/**
 * ILLMFolderAnalysisService - LLM-powered folder structure analysis
 * 
 * This service provides the LLM integration for the Enhanced Smart Trigger System.
 * It uses carefully crafted prompts to analyze folder contents and suggest improvements.
 * 
 * Core responsibilities:
 * - Analyze folder contents for subfolder opportunities
 * - Create new folder structures for low-similarity concepts
 * - Analyze and clean up duplicate concepts
 * - Suggest optimal placement for ambiguous concepts
 */

import { ConceptArtifact } from '../contracts/schemas';

/**
 * Request for subfolder analysis
 */
export interface SubfolderAnalysisRequest {
  folderId: string;
  concepts: ConceptArtifact[];        // Sample of concepts for analysis
  currentStructure: FolderStructure;  // Current folder hierarchy context
  maxSubfolders?: number;             // Limit on number of subfolders to suggest
}

/**
 * Result of subfolder analysis
 */
export interface SubfolderAnalysis {
  shouldCreateSubfolders: boolean;
  suggestedSubfolders: SubfolderSuggestion[];
  confidence: number;
  reasoning: string;
  tokensUsed: number;
}

/**
 * Request for creating new folder structure
 */
export interface NewFolderRequest {
  concept: ConceptArtifact;
  existingFolders: FolderSummary[];    // Context of existing folder structure
  folderTree: FolderStructure;         // Full folder hierarchy
  maxDepth?: number;                   // Maximum folder depth allowed (default: 4)
}

/**
 * Suggested new folder
 */
export interface NewFolderSuggestion {
  suggestedPath: string;
  reasoning: string;
  confidence: number;
  parentFolders: string[];             // Required parent folders to create
  tokensUsed: number;
}

/**
 * Request for duplicate analysis
 */
export interface DuplicateAnalysisRequest {
  duplicateGroups: ConceptGroup[];     // Groups of potentially duplicate concepts
  folderContext: FolderSummary;        // Context of the folder they're in
}

/**
 * Cleanup plan for duplicates
 */
export interface DuplicateCleanupPlan {
  cleanupActions: CleanupAction[];
  tokensUsed: number;
  confidence: number;
}

/**
 * Action to take on a group of concepts
 */
export interface CleanupAction {
  conceptIds: string[];
  action: 'merge' | 'keep_separate' | 'review';
  reasoning: string;
  confidence: number;
  mergedTitle?: string;               // If action is 'merge'
  mergedSummary?: string;            // If action is 'merge'
}

/**
 * Request for placement suggestion
 */
export interface PlacementRequest {
  concept: ConceptArtifact;
  candidateFolders: FolderMatch[];     // Potential folder matches with scores
  threshold: number;                   // Minimum similarity threshold
}

/**
 * Placement suggestion from LLM
 */
export interface PlacementSuggestion {
  primaryFolder: string;
  alternativeFolders: string[];
  newFolderSuggestion?: NewFolderSuggestion;
  confidence: number;
  reasoning: string;
  tokensUsed: number;
}

/**
 * Supporting data structures
 */
export interface FolderStructure {
  rootPath: string;
  subfolders: FolderSummary[];
  totalDepth: number;
}

export interface FolderSummary {
  path: string;
  name: string;
  conceptCount: number;
  description?: string;
  depth: number;
}

export interface ConceptGroup {
  concepts: ConceptArtifact[];
  averageSimilarity: number;
}

export interface FolderMatch {
  folderId: string;
  score: number;
  conceptCount: number;
}

/**
 * Main interface for LLM folder analysis
 */
export interface ILLMFolderAnalysisService {
  /**
   * Analyze folder contents for potential subfolder organization
   * @param request - Analysis parameters
   * @returns Promise<SubfolderAnalysis> - LLM analysis results
   */
  analyzeForSubfolders(request: SubfolderAnalysisRequest): Promise<SubfolderAnalysis>;

  /**
   * Create new folder structure for concepts that don't fit existing categories
   * @param request - New folder creation parameters
   * @returns Promise<NewFolderSuggestion> - LLM folder suggestion
   */
  createNewFolder(request: NewFolderRequest): Promise<NewFolderSuggestion>;

  /**
   * Analyze and provide cleanup plan for potential duplicates
   * @param request - Duplicate analysis parameters
   * @returns Promise<DuplicateCleanupPlan> - LLM cleanup recommendations
   */
  analyzeDuplicates(request: DuplicateAnalysisRequest): Promise<DuplicateCleanupPlan>;

  /**
   * Suggest optimal placement for ambiguous concepts
   * @param request - Placement analysis parameters
   * @returns Promise<PlacementSuggestion> - LLM placement recommendation
   */
  suggestPlacement(request: PlacementRequest): Promise<PlacementSuggestion>;

  /**
   * Check if service is available and within budget limits
   * @returns Promise<boolean> - True if service can be used
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get current token usage statistics
   * @returns Promise<TokenUsageStats> - Usage information
   */
  getUsageStats(): Promise<TokenUsageStats>;
}

/**
 * Token usage tracking
 */
export interface TokenUsageStats {
  dailyUsage: number;
  dailyLimit: number;
  remainingBudget: number;
  averageTokensPerOperation: Record<string, number>;
}

/**
 * Errors that can occur during LLM analysis
 */
export class LLMAnalysisError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`LLM analysis failed during ${operation}: ${message}`);
    this.name = 'LLMAnalysisError';
  }
}

export class LLMBudgetExceededError extends LLMAnalysisError {
  constructor(operation: string, currentUsage: number, limit: number) {
    super(operation, `Daily token budget exceeded: ${currentUsage}/${limit} tokens used`);
    this.name = 'LLMBudgetExceededError';
  }
}

export class LLMServiceUnavailableError extends LLMAnalysisError {
  constructor(operation: string, reason: string) {
    super(operation, `LLM service unavailable: ${reason}`);
    this.name = 'LLMServiceUnavailableError';
  }
}