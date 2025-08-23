/**
 * ReviewSchedulerService Implementation
 * 
 * Concrete implementation of IReviewSchedulerService that orchestrates
 * spaced repetition functionality by coordinating between the domain layer,
 * algorithm layer, and repository layer.
 * 
 * This service follows clean architecture principles:
 * - Depends on abstractions (interfaces) not concretions
 * - Contains business logic but delegates persistence to repository
 * - Uses domain entities and value objects appropriately
 * - Provides a clean API that hides internal complexity
 * 
 * Design patterns used:
 * - Dependency Injection: All dependencies injected via constructor
 * - Strategy Pattern: Can work with different algorithms
 * - Repository Pattern: Abstracts data persistence concerns
 * - Domain-Driven Design: Uses domain entities as first-class citizens
 */

import { 
  IReviewSchedulerService,
  ScheduleConceptInput,
  ProcessReviewInput,
  ReviewProcessingResult,
  DueReviewsOptions,
  ReviewPlan,
  BulkScheduleOptions
} from '../IReviewSchedulerService';

import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus,
  ReviewParameters 
} from '../../spaced-repetition/domain/ReviewSchedule';

import { 
  IReviewScheduleRepository,
  DueReviewsQuery 
} from '../../spaced-repetition/contracts/IReviewScheduleRepository';

import { 
  SM2Algorithm,
  SM2State,
  SM2Utils 
} from '../../spaced-repetition/algorithms/SM2Algorithm';

/**
 * Default configuration for the review scheduler
 */
const DEFAULT_CONFIG = {
  /** Default time per review in seconds for time estimation */
  averageSecondsPerReview: 15,
  
  /** Default batch size for bulk operations */
  defaultBatchSize: 50,
  
  /** Maximum number of reviews to return without explicit limit */
  maxDueReviews: 100,
  
  /** Default days to consider a concept abandoned */
  defaultAbandonedDays: 90,
  
  /** Default days for overdue calculation */
  defaultOverdueDays: 1
};

/**
 * ReviewSchedulerService - Core orchestrator for spaced repetition
 * 
 * This service implements the business logic for spaced repetition scheduling
 * while delegating domain-specific calculations to the SM2Algorithm and
 * persistence concerns to the repository.
 */
export class ReviewSchedulerService implements IReviewSchedulerService {
  
  constructor(
    private readonly repository: IReviewScheduleRepository,
    private readonly algorithm: SM2Algorithm = new SM2Algorithm()
  ) {}

  // ==================== CORE SCHEDULING OPERATIONS ====================

  async scheduleForReview(input: ScheduleConceptInput): Promise<ReviewSchedule> {
    // Check if schedule already exists
    const existing = await this.repository.findByConceptId(input.conceptId);
    if (existing) {
      return existing;
    }

    // Create new schedule with custom parameters if provided
    let schedule = ReviewSchedule.createNew(input.conceptId);

    // Apply custom parameters if provided
    if (input.customParameters) {
      const currentParams = schedule.parameters;
      const customParams = new ReviewParameters(
        currentParams.repetitions,
        input.customParameters.initialEaseFactor ?? currentParams.easinessFactor,
        input.customParameters.initialInterval ?? currentParams.interval
      );
      schedule = schedule.withUpdatedParameters(customParams);
    }

    // Save the new schedule
    await this.repository.save(schedule);
    
    return schedule;
  }

  async processReview(input: ProcessReviewInput): Promise<ReviewProcessingResult> {
    // Get the current schedule
    const schedule = await this.repository.findByConceptId(input.conceptId);
    if (!schedule) {
      throw new Error(`No review schedule found for concept: ${input.conceptId}`);
    }

    // Capture previous state for comparison
    const previousInterval = schedule.parameters.interval;
    const previousEase = schedule.parameters.easinessFactor;
    const previousStatus = schedule.status;

    // Process the review using domain entity
    schedule.recordReview(input.responseQuality);

    // Calculate changes
    const intervalChange = {
      previous: previousInterval,
      current: schedule.parameters.interval,
      change: schedule.parameters.interval - previousInterval
    };

    const easeChange = {
      previous: previousEase,
      current: schedule.parameters.easinessFactor,
      change: schedule.parameters.easinessFactor - previousEase
    };

    // Save the updated schedule
    await this.repository.save(schedule);

    return {
      schedule,
      nextReviewDate: schedule.timing.nextReviewDate,
      statusChanged: schedule.status !== previousStatus,
      intervalChange,
      easeChange
    };
  }

  async getSchedule(conceptId: string): Promise<ReviewSchedule | null> {
    return await this.repository.findByConceptId(conceptId);
  }

  async unschedule(conceptId: string): Promise<boolean> {
    const existing = await this.repository.findByConceptId(conceptId);
    if (!existing) {
      return false;
    }

    await this.repository.deleteByConceptId(conceptId);
    return true;
  }

  // ==================== REVIEW QUERYING ====================

  async getDueReviews(options: DueReviewsOptions = {}): Promise<ReviewSchedule[]> {
    const query: DueReviewsQuery = {
      limit: options.limit ?? DEFAULT_CONFIG.maxDueReviews,
      folderId: options.folderId,
      statuses: options.status,
      includeOverdue: options.includeOverdue ?? DEFAULT_CONFIG.defaultOverdueDays,
      currentTime: options.currentTime
    };

    const dueReviews = await this.repository.findDueReviews(query);

    // Apply additional filtering and sorting if needed
    if (options.prioritizeByDifficulty) {
      // Sort by ease factor (lower = more difficult = higher priority)
      dueReviews.sort((a, b) => a.parameters.easinessFactor - b.parameters.easinessFactor);
    }

    return dueReviews;
  }

  async isDue(conceptId: string, currentTime?: Date): Promise<boolean> {
    const schedule = await this.repository.findByConceptId(conceptId);
    if (!schedule) {
      return false;
    }

    return schedule.isDue(currentTime);
  }

  async getOverdueReviews(daysPastDue: number = DEFAULT_CONFIG.defaultOverdueDays, limit?: number): Promise<ReviewSchedule[]> {
    return await this.repository.findOverdue(daysPastDue, limit);
  }

  // ==================== PLANNING AND ANALYTICS ====================

  async getReviewPlan(currentTime: Date = new Date()): Promise<ReviewPlan> {
    // Get comprehensive statistics
    const stats = await this.repository.getStatistics();
    
    // Get due and overdue counts
    const dueToday = await this.repository.countDueReviews(currentTime);
    const overdueSchedules = await this.repository.findOverdue(1);
    const overdue = overdueSchedules.length;
    
    // Estimate study time
    const estimatedMinutes = Math.round((dueToday * DEFAULT_CONFIG.averageSecondsPerReview) / 60);
    
    // Get breakdown by status
    const byStatus: Record<ReviewStatus, number> = {
      [ReviewStatus.NEW]: stats.newCount || 0,
      [ReviewStatus.LEARNING]: stats.learningCount || 0,
      [ReviewStatus.REVIEWING]: stats.reviewingCount || 0,
      [ReviewStatus.MATURE]: stats.matureCount || 0,
      [ReviewStatus.SUSPENDED]: stats.suspendedCount || 0,
      [ReviewStatus.LEECH]: stats.leechCount || 0
    };

    // Generate weekly projection
    const weeklyProjection = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentTime);
      date.setDate(date.getDate() + i);
      
      const count = await this.repository.countDueReviews(date);
      const estimatedMinutes = Math.round((count * DEFAULT_CONFIG.averageSecondsPerReview) / 60);
      
      weeklyProjection.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        count,
        estimatedMinutes
      });
    }

    return {
      dueToday,
      overdue,
      estimatedMinutes,
      byStatus,
      weeklyProjection
    };
  }

  async getReviewsForDate(date: Date): Promise<number> {
    return await this.repository.countDueReviews(date);
  }

  async estimateDailyStudyTime(averageSecondsPerReview: number = DEFAULT_CONFIG.averageSecondsPerReview): Promise<number> {
    const dueToday = await this.repository.countDueReviews();
    return Math.round((dueToday * averageSecondsPerReview) / 60);
  }

  // ==================== BULK OPERATIONS ====================

  async bulkSchedule(options: BulkScheduleOptions): Promise<ReviewSchedule[]> {
    const { conceptIds, folderId, skipExisting = true, batchSize = DEFAULT_CONFIG.defaultBatchSize } = options;
    
    const schedules: ReviewSchedule[] = [];
    const conceptsToSchedule: string[] = [];

    // Filter out existing schedules if skipExisting is true
    if (skipExisting) {
      for (const conceptId of conceptIds) {
        const existing = await this.repository.findByConceptId(conceptId);
        if (!existing) {
          conceptsToSchedule.push(conceptId);
        } else {
          schedules.push(existing);
        }
      }
    } else {
      conceptsToSchedule.push(...conceptIds);
    }

    // Process in batches
    for (let i = 0; i < conceptsToSchedule.length; i += batchSize) {
      const batch = conceptsToSchedule.slice(i, i + batchSize);
      
      const batchSchedules = batch.map(conceptId => 
        ReviewSchedule.createNew(conceptId)
      );
      
      await this.repository.saveMany(batchSchedules);
      schedules.push(...batchSchedules);
    }

    return schedules;
  }

  async suspend(conceptId: string): Promise<boolean> {
    return await this.repository.suspendByConceptId(conceptId);
  }

  async resume(conceptId: string): Promise<boolean> {
    return await this.repository.resumeByConceptId(conceptId);
  }

  // ==================== MAINTENANCE ====================

  async cleanupOrphaned(validConceptIds: string[]): Promise<number> {
    return await this.repository.cleanupOrphaned(validConceptIds);
  }

  async resetAbandoned(daysAbandoned: number = DEFAULT_CONFIG.defaultAbandonedDays): Promise<number> {
    return await this.repository.resetAbandoned(daysAbandoned);
  }

  async getSystemHealth(): Promise<{
    totalConcepts: number;
    totalReviews: number;
    averageEaseFactor: number;
    averageInterval: number;
    conceptsByStatus: Record<ReviewStatus, number>;
    overduePercentage: number;
    lastMaintenanceDate?: Date;
  }> {
    const stats = await this.repository.getStatistics();
    const totalConcepts = await this.repository.count();
    const overdueSchedules = await this.repository.findOverdue(1);
    const overdueCount = overdueSchedules.length;
    
    const overduePercentage = totalConcepts > 0 ? (overdueCount / totalConcepts) * 100 : 0;

    return {
      totalConcepts,
      totalReviews: stats.totalSchedules, // Note: using totalSchedules as totalReviews equivalent
      averageEaseFactor: stats.averageEaseFactor,
      averageInterval: stats.averageInterval,
      conceptsByStatus: {
        [ReviewStatus.NEW]: stats.newCount || 0,
        [ReviewStatus.LEARNING]: stats.learningCount || 0,
        [ReviewStatus.REVIEWING]: stats.reviewingCount || 0,
        [ReviewStatus.MATURE]: stats.matureCount || 0,
        [ReviewStatus.SUSPENDED]: stats.suspendedCount || 0,
        [ReviewStatus.LEECH]: stats.leechCount || 0
      },
      overduePercentage: Math.round(overduePercentage * 100) / 100 // Round to 2 decimal places
    };
  }
}