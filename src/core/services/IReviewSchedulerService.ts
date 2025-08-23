/**
 * IReviewSchedulerService Interface
 * 
 * Core service interface for managing spaced repetition review scheduling.
 * This service orchestrates the review process by coordinating between
 * the domain layer (ReviewSchedule) and the algorithm layer (SM2Algorithm).
 * 
 * Key responsibilities:
 * - Schedule reviews for concepts based on spaced repetition algorithms
 * - Process review responses and update schedules accordingly
 * - Provide review planning and calendar functionality
 * - Manage review workflows and state transitions
 * - Maintain separation between business logic and persistence
 * 
 * Design principles:
 * - Interface Segregation: Focused solely on scheduling concerns
 * - Dependency Inversion: Depends on abstractions, not concretions
 * - Single Responsibility: Only handles review scheduling logic
 * - Open/Closed: Extensible for different scheduling algorithms
 */

import { ReviewSchedule, ResponseQuality, ReviewStatus } from '../spaced-repetition/domain/ReviewSchedule';

/**
 * Input for scheduling a new concept for review
 */
export interface ScheduleConceptInput {
  /** The concept ID to schedule reviews for */
  conceptId: string;
  
  /** Optional folder ID for categorization */
  folderId?: string;
  
  /** Optional initial difficulty override */
  initialDifficulty?: number;
  
  /** Optional custom scheduling parameters */
  customParameters?: {
    initialEaseFactor?: number;
    initialInterval?: number;
  };
}

/**
 * Input for processing a review response
 */
export interface ProcessReviewInput {
  /** The concept ID that was reviewed */
  conceptId: string;
  
  /** The quality of the user's response */
  responseQuality: ResponseQuality;
  
  /** Optional time taken to answer (in seconds) */
  responseTime?: number;
  
  /** Optional additional context about the review */
  reviewContext?: {
    questionType?: string;
    difficulty?: number;
    hints_used?: number;
  };
}

/**
 * Result of processing a review
 */
export interface ReviewProcessingResult {
  /** The updated review schedule */
  schedule: ReviewSchedule;
  
  /** The next review date */
  nextReviewDate: Date;
  
  /** Whether the schedule status changed */
  statusChanged: boolean;
  
  /** The previous and new intervals for comparison */
  intervalChange: {
    previous: number;
    current: number;
    change: number; // positive = interval increased
  };
  
  /** Ease factor change information */
  easeChange: {
    previous: number;
    current: number;
    change: number; // positive = ease increased
  };
}

/**
 * Options for querying due reviews
 */
export interface DueReviewsOptions {
  /** Maximum number of reviews to return */
  limit?: number;
  
  /** Filter by folder ID */
  folderId?: string;
  
  /** Filter by review status */
  status?: ReviewStatus[];
  
  /** Include overdue reviews up to N days */
  includeOverdue?: number;
  
  /** Prioritize by difficulty/ease factor */
  prioritizeByDifficulty?: boolean;
  
  /** Current time for due calculation (useful for testing) */
  currentTime?: Date;
}

/**
 * Review planning information
 */
export interface ReviewPlan {
  /** Total reviews due today */
  dueToday: number;
  
  /** Reviews overdue by 1+ days */
  overdue: number;
  
  /** Estimated study time in minutes */
  estimatedMinutes: number;
  
  /** Breakdown by review status */
  byStatus: Record<ReviewStatus, number>;
  
  /** Projected reviews for next 7 days */
  weeklyProjection: Array<{
    date: string;
    count: number;
    estimatedMinutes: number;
  }>;
}

/**
 * Bulk scheduling options
 */
export interface BulkScheduleOptions {
  /** Concept IDs to schedule */
  conceptIds: string[];
  
  /** Optional folder ID for all concepts */
  folderId?: string;
  
  /** Whether to skip concepts that already have schedules */
  skipExisting?: boolean;
  
  /** Batch size for processing (default: 50) */
  batchSize?: number;
}

/**
 * Core Review Scheduler Service Interface
 * 
 * This service acts as the main orchestrator for spaced repetition functionality,
 * providing a clean API that abstracts away the complexity of the underlying
 * domain models and algorithms.
 */
export interface IReviewSchedulerService {
  
  // ==================== CORE SCHEDULING OPERATIONS ====================
  
  /**
   * Schedule a new concept for spaced repetition reviews
   * 
   * Creates a new ReviewSchedule with initial parameters and saves it.
   * If a schedule already exists for the concept, returns the existing one.
   * 
   * @param input - Concept scheduling parameters
   * @returns The created or existing review schedule
   * @throws Error if concept ID is invalid or scheduling fails
   */
  scheduleForReview(input: ScheduleConceptInput): Promise<ReviewSchedule>;
  
  /**
   * Process a review response and update the schedule
   * 
   * This is the core method that applies spaced repetition logic.
   * Updates the schedule based on response quality and saves the changes.
   * 
   * @param input - Review response information
   * @returns Detailed results of the processing
   * @throws Error if concept not found or processing fails
   */
  processReview(input: ProcessReviewInput): Promise<ReviewProcessingResult>;
  
  /**
   * Get the current review schedule for a concept
   * 
   * @param conceptId - The concept to look up
   * @returns The review schedule or null if not found
   */
  getSchedule(conceptId: string): Promise<ReviewSchedule | null>;
  
  /**
   * Remove a concept from the review schedule
   * 
   * Permanently deletes the review schedule for the given concept.
   * Use with caution - this action cannot be undone.
   * 
   * @param conceptId - The concept to unschedule
   * @returns True if a schedule was deleted, false if none existed
   */
  unschedule(conceptId: string): Promise<boolean>;
  
  // ==================== REVIEW QUERYING ====================
  
  /**
   * Get concepts that are currently due for review
   * 
   * Returns concepts sorted by priority (overdue first, then by ease factor).
   * This is the primary method for building review sessions.
   * 
   * @param options - Query filtering and pagination options
   * @returns Array of due review schedules
   */
  getDueReviews(options?: DueReviewsOptions): Promise<ReviewSchedule[]>;
  
  /**
   * Check if a specific concept is currently due for review
   * 
   * @param conceptId - The concept to check
   * @param currentTime - Optional time for due calculation
   * @returns True if the concept is due for review
   */
  isDue(conceptId: string, currentTime?: Date): Promise<boolean>;
  
  /**
   * Get overdue reviews (past their due date)
   * 
   * @param daysPastDue - Minimum days overdue (default: 1)
   * @param limit - Maximum number to return
   * @returns Array of overdue schedules
   */
  getOverdueReviews(daysPastDue?: number, limit?: number): Promise<ReviewSchedule[]>;
  
  // ==================== PLANNING AND ANALYTICS ====================
  
  /**
   * Get a comprehensive review plan for today and the upcoming week
   * 
   * Provides overview information for planning review sessions
   * and estimating study time requirements.
   * 
   * @param currentTime - Optional time for planning calculation
   * @returns Detailed review planning information
   */
  getReviewPlan(currentTime?: Date): Promise<ReviewPlan>;
  
  /**
   * Get the number of reviews due on a specific date
   * 
   * @param date - The date to check
   * @returns Number of reviews due on that date
   */
  getReviewsForDate(date: Date): Promise<number>;
  
  /**
   * Estimate daily study time based on current schedules
   * 
   * @param averageSecondsPerReview - Time per review (default: 15)
   * @returns Estimated daily minutes
   */
  estimateDailyStudyTime(averageSecondsPerReview?: number): Promise<number>;
  
  // ==================== BULK OPERATIONS ====================
  
  /**
   * Schedule multiple concepts for review in bulk
   * 
   * Efficiently creates review schedules for multiple concepts.
   * Useful for initial setup or importing existing concepts.
   * 
   * @param options - Bulk scheduling parameters
   * @returns Array of created schedules
   */
  bulkSchedule(options: BulkScheduleOptions): Promise<ReviewSchedule[]>;
  
  /**
   * Suspend reviews for a concept temporarily
   * 
   * Marks the concept as suspended so it won't appear in due reviews.
   * The schedule is preserved and can be resumed later.
   * 
   * @param conceptId - The concept to suspend
   * @returns True if schedule was suspended, false if not found
   */
  suspend(conceptId: string): Promise<boolean>;
  
  /**
   * Resume reviews for a previously suspended concept
   * 
   * @param conceptId - The concept to resume
   * @returns True if schedule was resumed, false if not found
   */
  resume(conceptId: string): Promise<boolean>;
  
  // ==================== MAINTENANCE ====================
  
  /**
   * Clean up schedules for concepts that no longer exist
   * 
   * Removes orphaned review schedules to prevent data inconsistency.
   * Should be called periodically as part of maintenance.
   * 
   * @param validConceptIds - List of currently valid concept IDs
   * @returns Number of orphaned schedules removed
   */
  cleanupOrphaned(validConceptIds: string[]): Promise<number>;
  
  /**
   * Reset abandoned concepts that haven't been reviewed in a long time
   * 
   * Resets schedules for concepts that are severely overdue,
   * giving users a fresh start with difficult material.
   * 
   * @param daysAbandoned - Days without review to consider abandoned (default: 90)
   * @returns Number of schedules reset
   */
  resetAbandoned(daysAbandoned?: number): Promise<number>;
  
  /**
   * Get health statistics about the review system
   * 
   * Provides insights into system usage and performance.
   * Useful for monitoring and optimization.
   * 
   * @returns System health and usage statistics
   */
  getSystemHealth(): Promise<{
    totalConcepts: number;
    totalReviews: number;
    averageEaseFactor: number;
    averageInterval: number;
    conceptsByStatus: Record<ReviewStatus, number>;
    overduePercentage: number;
    lastMaintenanceDate?: Date;
  }>;
}