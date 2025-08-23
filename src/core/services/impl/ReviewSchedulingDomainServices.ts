/**
 * Domain Services for Review Scheduling
 * 
 * These services encapsulate complex business logic that doesn't naturally
 * belong to any single entity. They make the main service easier to understand
 * by extracting specialized concerns into focused, well-named classes.
 */

import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus,
  ReviewParameters 
} from '../../spaced-repetition/domain/ReviewSchedule';

import { 
  IReviewScheduleRepository,
  ScheduleStatistics 
} from '../../spaced-repetition/contracts/IReviewScheduleRepository';

import { 
  ConceptIdentifier,
  StudySessionLimit,
  DifficultyPrioritization,
  ReviewSessionQuery,
  ConceptBatch,
  TimeWindow,
  OverdueThreshold,
  AbandonmentThreshold
} from './ReviewSchedulingValueObjects';

import { ReviewPlan } from '../IReviewSchedulerService';

export interface ScheduleCreationParameters {
  readonly conceptId: ConceptIdentifier;
  readonly initialEaseFactor?: number;
  readonly initialInterval?: number;
}

export class ConceptSchedulingService {
  constructor(private readonly repository: IReviewScheduleRepository) {}

  async createScheduleForNewConcept(parameters: ScheduleCreationParameters): Promise<ReviewSchedule> {
    const existingSchedule = await this.findExistingScheduleFor(parameters.conceptId);
    if (existingSchedule) {
      return existingSchedule;
    }

    const newSchedule = this.buildNewScheduleWith(parameters);
    await this.repository.save(newSchedule);
    
    return newSchedule;
  }

  async scheduleMultipleConceptsInBatches(conceptBatch: ConceptBatch): Promise<ReviewSchedule[]> {
    const conceptsToSchedule = await this.filterOutExistingConceptsIfNeeded(conceptBatch);
    const allSchedules = await this.gatherExistingSchedules(conceptBatch);
    
    const newSchedules = await this.createSchedulesInBatches(conceptsToSchedule, conceptBatch);
    
    return [...allSchedules, ...newSchedules];
  }

  private async findExistingScheduleFor(conceptId: ConceptIdentifier): Promise<ReviewSchedule | null> {
    return await this.repository.findByConceptId(conceptId.toString());
  }

  private buildNewScheduleWith(parameters: ScheduleCreationParameters): ReviewSchedule {
    let schedule = ReviewSchedule.createNew(parameters.conceptId.toString());
    
    if (this.hasCustomParameters(parameters)) {
      schedule = this.applyCustomParametersTo(schedule, parameters);
    }
    
    return schedule;
  }

  private hasCustomParameters(parameters: ScheduleCreationParameters): boolean {
    return parameters.initialEaseFactor !== undefined || parameters.initialInterval !== undefined;
  }

  private applyCustomParametersTo(schedule: ReviewSchedule, parameters: ScheduleCreationParameters): ReviewSchedule {
    const currentParams = schedule.parameters;
    const customParams = new ReviewParameters(
      currentParams.repetitions,
      parameters.initialEaseFactor ?? currentParams.easinessFactor,
      parameters.initialInterval ?? currentParams.interval
    );
    return schedule.withUpdatedParameters(customParams);
  }

  private async filterOutExistingConceptsIfNeeded(conceptBatch: ConceptBatch): Promise<string[]> {
    if (!conceptBatch.shouldSkipExisting()) {
      return conceptBatch.getConceptIds();
    }

    const conceptsToSchedule: string[] = [];
    for (const conceptId of conceptBatch.getConceptIds()) {
      const existing = await this.repository.findByConceptId(conceptId);
      if (!existing) {
        conceptsToSchedule.push(conceptId);
      }
    }
    
    return conceptsToSchedule;
  }

  private async gatherExistingSchedules(conceptBatch: ConceptBatch): Promise<ReviewSchedule[]> {
    if (!conceptBatch.shouldSkipExisting()) {
      return [];
    }

    const existingSchedules: ReviewSchedule[] = [];
    for (const conceptId of conceptBatch.getConceptIds()) {
      const existing = await this.repository.findByConceptId(conceptId);
      if (existing) {
        existingSchedules.push(existing);
      }
    }
    
    return existingSchedules;
  }

  private async createSchedulesInBatches(conceptIds: string[], conceptBatch: ConceptBatch): Promise<ReviewSchedule[]> {
    const schedules: ReviewSchedule[] = [];
    const batchSize = conceptBatch.getBatchSize();
    
    for (let i = 0; i < conceptIds.length; i += batchSize) {
      const batch = conceptIds.slice(i, i + batchSize);
      const batchSchedules = batch.map(conceptId => ReviewSchedule.createNew(conceptId));
      
      await this.repository.saveMany(batchSchedules);
      schedules.push(...batchSchedules);
    }
    
    return schedules;
  }
}

export interface ReviewProcessingResult {
  readonly updatedSchedule: ReviewSchedule;
  readonly progressSummary: ReviewProgressSummary;
}

export interface ReviewProgressSummary {
  readonly nextReviewDate: Date;
  readonly statusChanged: boolean;
  readonly intervalProgression: IntervalProgression;
  readonly difficultyProgression: DifficultyProgression;
}

export interface IntervalProgression {
  readonly previousInterval: number;
  readonly currentInterval: number;
  readonly changeInDays: number;
}

export interface DifficultyProgression {
  readonly previousEaseFactor: number;
  readonly currentEaseFactor: number;
  readonly difficultyChange: number;
}

export class ReviewProcessingService {
  constructor(private readonly repository: IReviewScheduleRepository) {}

  async processReviewResponse(conceptId: ConceptIdentifier, responseQuality: ResponseQuality): Promise<ReviewProcessingResult> {
    const currentSchedule = await this.getScheduleOrThrow(conceptId);
    const previousState = this.captureCurrentState(currentSchedule);
    
    const updatedSchedule = this.applyReviewResponse(currentSchedule, responseQuality);
    await this.repository.save(updatedSchedule);
    
    const progressSummary = this.createProgressSummary(previousState, updatedSchedule);
    
    return {
      updatedSchedule,
      progressSummary
    };
  }

  private async getScheduleOrThrow(conceptId: ConceptIdentifier): Promise<ReviewSchedule> {
    const schedule = await this.repository.findByConceptId(conceptId.toString());
    if (!schedule) {
      throw new ConceptNotScheduledError(conceptId);
    }
    return schedule;
  }

  private captureCurrentState(schedule: ReviewSchedule) {
    return {
      interval: schedule.parameters.interval,
      easeFactor: schedule.parameters.easinessFactor,
      status: schedule.status
    };
  }

  private applyReviewResponse(schedule: ReviewSchedule, responseQuality: ResponseQuality): ReviewSchedule {
    schedule.recordReview(responseQuality);
    return schedule;
  }

  private createProgressSummary(previousState: any, updatedSchedule: ReviewSchedule): ReviewProgressSummary {
    return {
      nextReviewDate: updatedSchedule.timing.nextReviewDate,
      statusChanged: updatedSchedule.status !== previousState.status,
      intervalProgression: {
        previousInterval: previousState.interval,
        currentInterval: updatedSchedule.parameters.interval,
        changeInDays: updatedSchedule.parameters.interval - previousState.interval
      },
      difficultyProgression: {
        previousEaseFactor: previousState.easeFactor,
        currentEaseFactor: updatedSchedule.parameters.easinessFactor,
        difficultyChange: updatedSchedule.parameters.easinessFactor - previousState.easeFactor
      }
    };
  }
}

export class ConceptNotScheduledError extends Error {
  constructor(conceptId: ConceptIdentifier) {
    super(`No review schedule found for concept: ${conceptId.toString()}`);
    this.name = 'ConceptNotScheduledError';
  }
}

export class ReviewQueryService {
  constructor(private readonly repository: IReviewScheduleRepository) {}

  async findDueReviewsForStudySession(query: ReviewSessionQuery): Promise<ReviewSchedule[]> {
    const repositoryQuery = this.translateToRepositoryQuery(query);
    const dueReviews = await this.repository.findDueReviews(repositoryQuery);
    
    return this.applyAdditionalFiltering(dueReviews, query);
  }

  async checkIfConceptIsDue(conceptId: ConceptIdentifier, currentTime?: Date): Promise<boolean> {
    const schedule = await this.repository.findByConceptId(conceptId.toString());
    return schedule?.isDue(currentTime) ?? false;
  }

  async findOverdueReviews(threshold: OverdueThreshold, limit?: StudySessionLimit): Promise<ReviewSchedule[]> {
    const repositoryLimit = limit?.isUnlimited() ? undefined : limit?.getValue();
    return await this.repository.findOverdue(threshold.getDays(), repositoryLimit);
  }

  private translateToRepositoryQuery(query: ReviewSessionQuery) {
    return {
      limit: query.getLimit(),
      folderId: query.getFolderId(),
      statuses: query.getStatusFilter(),
      currentTime: query.getCurrentTime()
    };
  }

  private applyAdditionalFiltering(reviews: ReviewSchedule[], query: ReviewSessionQuery): ReviewSchedule[] {
    if (query.shouldPrioritizeByDifficulty()) {
      return this.sortByIncreasingDifficulty(reviews);
    }
    return reviews;
  }

  private sortByIncreasingDifficulty(reviews: ReviewSchedule[]): ReviewSchedule[] {
    return reviews.sort((a, b) => a.parameters.easinessFactor - b.parameters.easinessFactor);
  }
}

export class ReviewPlanningService {
  private static readonly AVERAGE_SECONDS_PER_REVIEW = 15;

  constructor(private readonly repository: IReviewScheduleRepository) {}

  async createReviewPlanFor(timeWindow: TimeWindow): Promise<ReviewPlan> {
    const currentTime = new Date();
    const systemStatistics = await this.repository.getStatistics();
    
    const currentDemand = await this.calculateCurrentReviewDemand(currentTime);
    const statusBreakdown = this.extractStatusBreakdownFrom(systemStatistics);
    const weeklyProjection = await this.projectReviewsOverNextWeek(currentTime);
    
    return {
      dueToday: currentDemand.dueCount,
      overdue: currentDemand.overdueCount,
      estimatedMinutes: this.estimateStudyTime(currentDemand.dueCount),
      byStatus: statusBreakdown,
      weeklyProjection
    };
  }

  async estimateStudyTimeForDate(date: Date): Promise<number> {
    const reviewCount = await this.repository.countDueReviews(date);
    return this.estimateStudyTime(reviewCount);
  }

  private async calculateCurrentReviewDemand(currentTime: Date) {
    const [dueCount, overdueSchedules] = await Promise.all([
      this.repository.countDueReviews(currentTime),
      this.repository.findOverdue(1)
    ]);
    
    return {
      dueCount,
      overdueCount: overdueSchedules.length
    };
  }

  private extractStatusBreakdownFrom(stats: ScheduleStatistics) {
    return {
      [ReviewStatus.NEW]: stats.newCount || 0,
      [ReviewStatus.LEARNING]: stats.learningCount || 0,
      [ReviewStatus.REVIEWING]: stats.reviewingCount || 0,
      [ReviewStatus.MATURE]: stats.matureCount || 0,
      [ReviewStatus.SUSPENDED]: stats.suspendedCount || 0,
      [ReviewStatus.LEECH]: stats.leechCount || 0
    };
  }

  private async projectReviewsOverNextWeek(startDate: Date) {
    const projection = [];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + dayOffset);
      
      const reviewCount = await this.repository.countDueReviews(targetDate);
      
      projection.push({
        date: targetDate.toISOString().split('T')[0],
        count: reviewCount,
        estimatedMinutes: this.estimateStudyTime(reviewCount)
      });
    }
    
    return projection;
  }

  private estimateStudyTime(reviewCount: number): number {
    return Math.round((reviewCount * ReviewPlanningService.AVERAGE_SECONDS_PER_REVIEW) / 60);
  }
}

export class SystemMaintenanceService {
  constructor(private readonly repository: IReviewScheduleRepository) {}

  async removeOrphanedSchedules(validConceptIds: ConceptIdentifier[]): Promise<number> {
    const validIds = validConceptIds.map(id => id.toString());
    return await this.repository.cleanupOrphaned(validIds);
  }

  async resetAbandonedConcepts(threshold: AbandonmentThreshold): Promise<number> {
    return await this.repository.resetAbandoned(threshold.getDays());
  }

  async suspendScheduleFor(conceptId: ConceptIdentifier): Promise<boolean> {
    return await this.repository.suspendByConceptId(conceptId.toString());
  }

  async resumeScheduleFor(conceptId: ConceptIdentifier): Promise<boolean> {
    return await this.repository.resumeByConceptId(conceptId.toString());
  }

  async deleteScheduleFor(conceptId: ConceptIdentifier): Promise<boolean> {
    return await this.repository.deleteByConceptId(conceptId.toString());
  }

  async generateSystemHealthReport() {
    const [stats, totalConcepts, overdueSchedules] = await Promise.all([
      this.repository.getStatistics(),
      this.repository.count(),
      this.repository.findOverdue(1)
    ]);

    const overduePercentage = totalConcepts > 0 
      ? Math.round((overdueSchedules.length / totalConcepts) * 100 * 100) / 100 
      : 0;

    return {
      totalConcepts,
      totalReviews: stats.totalSchedules,
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
      overduePercentage
    };
  }
}