/**
 * Repository Interface for Review Schedule Storage
 * 
 * Defines the contract for persisting and retrieving review schedules.
 * All implementations must satisfy this interface contract.
 * 
 * Following the same patterns as the existing repository interfaces
 * in src/core/contracts/repositories.ts
 */

import { ReviewSchedule, ReviewStatus } from '../domain/ReviewSchedule';

/**
 * Query parameters for finding due reviews
 */
export interface DueReviewsQuery {
  /** Maximum number of reviews to return (default: 20) */
  limit?: number;
  
  /** Only include reviews for specific concept IDs */
  conceptIds?: string[];
  
  /** Only include reviews from specific folder IDs */
  folderIds?: string[];
  
  /** Include overdue reviews (default: true) */
  includeOverdue?: boolean;
  
  /** Maximum days overdue to include (default: unlimited) */
  maxOverdueDays?: number;
}

/**
 * Query parameters for finding schedules by criteria
 */
export interface ScheduleQuery {
  /** Filter by status */
  status?: ReviewStatus;
  
  /** Filter by folder ID */
  folderId?: string;
  
  /** Filter by minimum repetitions */
  minRepetitions?: number;
  
  /** Filter by maximum repetitions */
  maxRepetitions?: number;
  
  /** Filter by minimum interval days */
  minInterval?: number;
  
  /** Filter by maximum interval days */
  maxInterval?: number;
  
  /** Limit number of results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Review calendar entry for scheduling overview
 */
export interface ReviewCalendarEntry {
  date: Date;
  dueCount: number;
  newCount: number;
  learningCount: number;
  reviewingCount: number;
  matureCount: number;
}

/**
 * Statistics for review schedule performance
 */
export interface ScheduleStatistics {
  totalSchedules: number;
  newCount: number;
  learningCount: number;
  reviewingCount: number;
  matureCount: number;
  suspendedCount: number;
  leechCount: number;
  dueCount: number;
  overdueCount: number;
  averageEaseFactor: number;
  averageInterval: number;
}

/**
 * Repository interface for ReviewSchedule persistence
 */
export interface IReviewScheduleRepository {
  // ==================== BASIC CRUD OPERATIONS ====================
  
  /**
   * Save a review schedule to storage
   * Must be idempotent - saving the same schedule multiple times should succeed
   */
  save(schedule: ReviewSchedule): Promise<void>;

  /**
   * Save multiple review schedules in a batch operation
   * More efficient for bulk operations
   */
  saveMany(schedules: ReviewSchedule[]): Promise<void>;

  /**
   * Find a schedule by its unique ID
   * Returns null if not found
   */
  findById(id: string): Promise<ReviewSchedule | null>;

  /**
   * Find a schedule by concept ID
   * Each concept should have exactly one schedule
   * Returns null if not found
   */
  findByConceptId(conceptId: string): Promise<ReviewSchedule | null>;

  /**
   * Check if a schedule exists by ID
   * More efficient than findById when only existence matters
   */
  exists(id: string): Promise<boolean>;

  /**
   * Delete a schedule by ID
   * Should be idempotent - deleting non-existent schedule should succeed
   */
  delete(scheduleId: string): Promise<void>;

  /**
   * Delete schedule by concept ID
   * Used when removing concepts from the system
   */
  deleteByConceptId(conceptId: string): Promise<void>;

  // ==================== QUERY OPERATIONS ====================

  /**
   * Find all schedules that are currently due for review
   * Respects status (suspended schedules are never due)
   */
  findDueReviews(query?: DueReviewsQuery): Promise<ReviewSchedule[]>;

  /**
   * Find schedules by multiple criteria
   * Supports filtering and pagination
   */
  findByQuery(query: ScheduleQuery): Promise<ReviewSchedule[]>;

  /**
   * Find all schedules for concepts in a specific folder
   * Used for folder-based review sessions
   */
  findByFolderId(folderId: string): Promise<ReviewSchedule[]>;

  /**
   * Find schedules by status
   * Useful for analytics and maintenance operations
   */
  findByStatus(status: ReviewStatus, limit?: number): Promise<ReviewSchedule[]>;

  /**
   * Find schedules that are overdue by more than specified days
   * Used for identifying problem areas and cleanup
   */
  findOverdue(daysOverdue: number, limit?: number): Promise<ReviewSchedule[]>;

  /**
   * Find schedules marked as leeches
   * Used for special handling of problematic concepts
   */
  findLeeches(limit?: number): Promise<ReviewSchedule[]>;

  /**
   * Find mature schedules (long intervals)
   * Used for analytics and understanding learning progress
   */
  findMature(limit?: number): Promise<ReviewSchedule[]>;

  // ==================== COUNTING AND STATISTICS ====================

  /**
   * Count total number of schedules
   */
  count(): Promise<number>;

  /**
   * Count schedules currently due for review
   */
  countDueReviews(): Promise<number>;

  /**
   * Count schedules by status
   */
  countByStatus(status: ReviewStatus): Promise<number>;

  /**
   * Count schedules in a specific folder
   */
  countByFolderId(folderId: string): Promise<number>;

  /**
   * Get comprehensive statistics about all schedules
   * Used for dashboard and analytics
   */
  getStatistics(): Promise<ScheduleStatistics>;

  // ==================== CALENDAR AND PLANNING ====================

  /**
   * Get review calendar for the next N days
   * Shows how many reviews are scheduled each day
   */
  getReviewCalendar(days: number): Promise<ReviewCalendarEntry[]>;

  /**
   * Get schedules due on a specific date
   * Used for daily planning and workload estimation
   */
  getSchedulesForDate(date: Date): Promise<ReviewSchedule[]>;

  /**
   * Estimate daily workload for the next N days
   * Returns average reviews per day based on current schedules
   */
  estimateDailyWorkload(days: number): Promise<number>;

  // ==================== MAINTENANCE OPERATIONS ====================

  /**
   * Update multiple schedules in a batch operation
   * More efficient for bulk updates after review sessions
   */
  updateMany(schedules: ReviewSchedule[]): Promise<void>;

  /**
   * Suspend all schedules for a specific concept
   * Used when user wants to pause reviews for certain topics
   */
  suspendByConceptId(conceptId: string): Promise<void>;

  /**
   * Resume all suspended schedules for a specific concept
   */
  resumeByConceptId(conceptId: string): Promise<void>;

  /**
   * Suspend all schedules in a folder
   * Used for folder-level review management
   */
  suspendByFolderId(folderId: string): Promise<void>;

  /**
   * Resume all suspended schedules in a folder
   */
  resumeByFolderId(folderId: string): Promise<void>;

  /**
   * Reset schedules for concepts that haven't been reviewed in X days
   * Maintenance operation for abandoned content
   */
  resetAbandoned(daysSinceLastReview: number): Promise<number>;

  /**
   * Clean up orphaned schedules (schedules for concepts that no longer exist)
   * Returns the number of schedules cleaned up
   */
  cleanupOrphaned(validConceptIds: string[]): Promise<number>;

  // ==================== BULK OPERATIONS ====================

  /**
   * Create initial schedules for multiple concepts
   * Used when adding new concepts to the system
   */
  createInitialSchedules(conceptIds: string[]): Promise<void>;

  /**
   * Export schedules to plain objects for backup/migration
   * Returns serializable data structure
   */
  exportSchedules(conceptIds?: string[]): Promise<Record<string, any>[]>;

  /**
   * Import schedules from plain objects
   * Used for backup restoration and data migration
   */
  importSchedules(data: Record<string, any>[]): Promise<void>;

  // ==================== ANALYTICS QUERIES ====================

  /**
   * Get ease factor distribution across all schedules
   * Useful for understanding learning patterns
   */
  getEaseFactorDistribution(): Promise<{ easeFactor: number; count: number }[]>;

  /**
   * Get interval distribution across all schedules
   * Shows how content is distributed across time
   */
  getIntervalDistribution(): Promise<{ intervalRange: string; count: number }[]>;

  /**
   * Get success rate by folder
   * Based on review history and current parameters
   */
  getSuccessRatesByFolder(): Promise<{ folderId: string; successRate: number }[]>;

  /**
   * Find concepts that might need attention
   * Low ease factors, frequent resets, etc.
   */
  findProblematicConcepts(limit?: number): Promise<{
    conceptId: string;
    easeFactor: number;
    consecutiveIncorrect: number;
    lastReviewDate: Date | null;
  }[]>;
}

/**
 * Repository implementation validation
 * Contract tests that any implementation must pass
 */
export interface IRepositoryContractTests {
  testBasicCrud(): Promise<void>;
  testQueryOperations(): Promise<void>;
  testBulkOperations(): Promise<void>;
  testStatistics(): Promise<void>;
  testMaintenanceOperations(): Promise<void>;
}

/**
 * Repository factory interface for dependency injection
 */
export interface IReviewScheduleRepositoryFactory {
  create(): IReviewScheduleRepository;
}