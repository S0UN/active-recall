/**
 * IFolderExpansionService - Enhanced Smart Trigger System for LLM-powered folder expansion
 * 
 * This service implements the Enhanced Smart Trigger System documented in:
 * /docs/ENHANCED-FOLDER-EXPANSION-SYSTEM.md
 * 
 * Core responsibilities:
 * - Monitor folder sizes for expansion triggers (15+ concepts)
 * - Analyze folders for potential subfolder organization
 * - Execute LLM-powered folder expansion when appropriate
 * - Coordinate with duplicate cleanup during expansion
 */

import { ConceptArtifact } from '../contracts/schemas';

/**
 * Analysis result for potential folder expansion
 */
export interface ExpansionAnalysis {
  folderId: string;
  currentConceptCount: number;
  shouldCreateSubfolders: boolean;
  suggestedSubfolders: SubfolderSuggestion[];
  duplicateGroups: DuplicateGroup[];
  confidence: number;
  reasoning: string;
  estimatedTokenCost: number; // For budget management
}

/**
 * Suggested subfolder structure
 */
export interface SubfolderSuggestion {
  name: string;
  description: string;
  conceptIds: string[];
  confidence: number;
  reasoning: string;
}

/**
 * Group of potentially duplicate concepts
 */
export interface DuplicateGroup {
  conceptIds: string[];
  similarity: number;
  recommendedAction: 'merge' | 'keep_separate' | 'review';
  reasoning: string;
}

/**
 * Result of folder expansion operation
 */
export interface ExpansionResult {
  folderId: string;
  subfoldersCreated: string[];
  conceptsMoved: number;
  duplicatesResolved: number;
  tokensUsed: number;
  success: boolean;
  error?: string;
}

/**
 * Main interface for folder expansion service
 * Implements Enhanced Smart Trigger System
 */
export interface IFolderExpansionService {
  /**
   * Check if folder meets size criteria for expansion analysis
   * @param folderId - Folder to check
   * @returns Promise<boolean> - True if folder should be analyzed
   */
  shouldTriggerExpansion(folderId: string): Promise<boolean>;

  /**
   * Analyze folder for potential expansion opportunities
   * Uses LLM to determine if subfolders would improve organization
   * @param folderId - Folder to analyze
   * @returns Promise<ExpansionAnalysis> - Analysis results
   */
  analyzeForExpansion(folderId: string): Promise<ExpansionAnalysis>;

  /**
   * Execute folder expansion based on analysis
   * Creates subfolders and moves concepts accordingly
   * @param folderId - Folder to expand
   * @param analysis - Previous analysis results
   * @returns Promise<ExpansionResult> - Expansion results
   */
  expandFolder(folderId: string, analysis: ExpansionAnalysis): Promise<ExpansionResult>;

  /**
   * Get expansion configuration
   * @returns Current expansion settings
   */
  getConfig(): FolderExpansionConfig;
}

/**
 * Configuration for folder expansion system
 */
export interface FolderExpansionConfig {
  // Size triggers
  folderSizeTrigger: number;           // 15 - concepts before subfolder analysis
  maxFolderSize: number;               // 50 - force subdivision at this size
  minSubfolderSize: number;            // 3 - minimum concepts for valid subfolder
  
  // LLM settings
  llmExpansionEnabled: boolean;        // Feature flag
  maxConceptsForAnalysis: number;      // 20 - sample size for LLM analysis
  llmBudgetLimit: number;             // Daily token budget
  
  // Duplicate management
  enableDuplicateCleanup: boolean;     // Feature flag
  duplicateCleanupBatchSize: number;   // 10 - max duplicates to process at once
}

/**
 * Errors that can occur during folder expansion
 */
export class FolderExpansionError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`Folder expansion failed during ${operation}: ${message}`);
    this.name = 'FolderExpansionError';
  }
}

export class ExpansionBudgetExceededError extends FolderExpansionError {
  constructor(currentUsage: number, limit: number) {
    super('budget_check', `Token budget exceeded: ${currentUsage}/${limit} tokens used`);
    this.name = 'ExpansionBudgetExceededError';
  }
}