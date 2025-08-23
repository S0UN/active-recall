/**
 * Readable Review Scheduler Service
 * 
 * This service orchestrates spaced repetition functionality with maximum readability.
 * Every method tells a clear story about what it does, and complex logic is extracted
 * into focused domain services and value objects.
 * 
 * A new developer should be able to understand the high-level flow of any operation
 * just by reading the method names and structure, without relying on comments.
 */

import { 
  IReviewSchedulerService,
  ScheduleConceptInput,
  ProcessReviewInput,
  ReviewProcessingResult as ServiceReviewResult,
  DueReviewsOptions,
  ReviewPlan,
  BulkScheduleOptions
} from '../IReviewSchedulerService';

import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus 
} from '../../spaced-repetition/domain/ReviewSchedule';

import { 
  IReviewScheduleRepository 
} from '../../spaced-repetition/contracts/IReviewScheduleRepository';

import { SM2Algorithm } from '../../spaced-repetition/algorithms/SM2Algorithm';

import {
  ConceptIdentifier,
  StudySessionLimit,
  DifficultyPrioritization,
  FolderScope,
  ReviewSessionQuery,
  ConceptBatch,
  BatchSize,
  TimeWindow,
  OverdueThreshold,
  AbandonmentThreshold
} from './ReviewSchedulingValueObjects';

import {
  ConceptSchedulingService,
  ScheduleCreationParameters,
  ReviewProcessingService,
  ReviewQueryService,
  ReviewPlanningService,
  SystemMaintenanceService
} from './ReviewSchedulingDomainServices';

export class ReadableReviewSchedulerService implements IReviewSchedulerService {
  
  private readonly conceptScheduling: ConceptSchedulingService;
  private readonly reviewProcessing: ReviewProcessingService;
  private readonly reviewQuerying: ReviewQueryService;
  private readonly reviewPlanning: ReviewPlanningService;
  private readonly systemMaintenance: SystemMaintenanceService;

  constructor(
    private readonly repository: IReviewScheduleRepository,
    private readonly algorithm: SM2Algorithm = new SM2Algorithm()
  ) {
    this.conceptScheduling = new ConceptSchedulingService(repository);
    this.reviewProcessing = new ReviewProcessingService(repository);
    this.reviewQuerying = new ReviewQueryService(repository);
    this.reviewPlanning = new ReviewPlanningService(repository);
    this.systemMaintenance = new SystemMaintenanceService(repository);
  }

  async scheduleForReview(input: ScheduleConceptInput): Promise<ReviewSchedule> {
    const conceptId = new ConceptIdentifier(input.conceptId);
    const scheduleParameters = this.buildScheduleParametersFrom(input, conceptId);
    
    return await this.conceptScheduling.createScheduleForNewConcept(scheduleParameters);
  }

  async processReview(input: ProcessReviewInput): Promise<ServiceReviewResult> {
    const conceptId = new ConceptIdentifier(input.conceptId);
    const processingResult = await this.reviewProcessing.processReviewResponse(conceptId, input.responseQuality);
    
    return this.adaptProcessingResultForService(processingResult);
  }

  async getSchedule(conceptId: string): Promise<ReviewSchedule | null> {
    const identifier = new ConceptIdentifier(conceptId);
    return await this.repository.findByConceptId(identifier.toString());
  }

  async unschedule(conceptId: string): Promise<boolean> {
    const identifier = new ConceptIdentifier(conceptId);
    return await this.systemMaintenance.deleteScheduleFor(identifier);
  }

  async getDueReviews(options: DueReviewsOptions = {}): Promise<ReviewSchedule[]> {
    const studySessionQuery = this.buildStudySessionQueryFrom(options);
    return await this.reviewQuerying.findDueReviewsForStudySession(studySessionQuery);
  }

  async isDue(conceptId: string, currentTime?: Date): Promise<boolean> {
    const identifier = new ConceptIdentifier(conceptId);
    return await this.reviewQuerying.checkIfConceptIsDue(identifier, currentTime);
  }

  async getOverdueReviews(daysPastDue: number = 1, limit?: number): Promise<ReviewSchedule[]> {
    const overdueThreshold = OverdueThreshold.of(daysPastDue);
    const studySessionLimit = limit ? StudySessionLimit.of(limit) : StudySessionLimit.unlimited();
    
    return await this.reviewQuerying.findOverdueReviews(overdueThreshold, studySessionLimit);
  }

  async getReviewPlan(currentTime: Date = new Date()): Promise<ReviewPlan> {
    const planningWindow = TimeWindow.oneWeek();
    return await this.reviewPlanning.createReviewPlanFor(planningWindow);
  }

  async getReviewsForDate(date: Date): Promise<number> {
    return await this.repository.countDueReviews(date);
  }

  async estimateDailyStudyTime(averageSecondsPerReview: number = 15): Promise<number> {
    const today = new Date();
    return await this.reviewPlanning.estimateStudyTimeForDate(today);
  }

  async bulkSchedule(options: BulkScheduleOptions): Promise<ReviewSchedule[]> {
    const conceptBatch = this.buildConceptBatchFrom(options);
    return await this.conceptScheduling.scheduleMultipleConceptsInBatches(conceptBatch);
  }

  async suspend(conceptId: string): Promise<boolean> {
    const identifier = new ConceptIdentifier(conceptId);
    return await this.systemMaintenance.suspendScheduleFor(identifier);
  }

  async resume(conceptId: string): Promise<boolean> {
    const identifier = new ConceptIdentifier(conceptId);
    return await this.systemMaintenance.resumeScheduleFor(identifier);
  }

  async cleanupOrphaned(validConceptIds: string[]): Promise<number> {
    const identifiers = validConceptIds.map(id => new ConceptIdentifier(id));
    return await this.systemMaintenance.removeOrphanedSchedules(identifiers);
  }

  async resetAbandoned(daysAbandoned: number = 90): Promise<number> {
    const abandonmentThreshold = AbandonmentThreshold.of(daysAbandoned);
    return await this.systemMaintenance.resetAbandonedConcepts(abandonmentThreshold);
  }

  async getSystemHealth() {
    return await this.systemMaintenance.generateSystemHealthReport();
  }

  private buildScheduleParametersFrom(input: ScheduleConceptInput, conceptId: ConceptIdentifier): ScheduleCreationParameters {
    return {
      conceptId,
      initialEaseFactor: input.customParameters?.initialEaseFactor,
      initialInterval: input.customParameters?.initialInterval
    };
  }

  private adaptProcessingResultForService(domainResult: any): ServiceReviewResult {
    return {
      schedule: domainResult.updatedSchedule,
      nextReviewDate: domainResult.progressSummary.nextReviewDate,
      statusChanged: domainResult.progressSummary.statusChanged,
      intervalChange: {
        previous: domainResult.progressSummary.intervalProgression.previousInterval,
        current: domainResult.progressSummary.intervalProgression.currentInterval,
        change: domainResult.progressSummary.intervalProgression.changeInDays
      },
      easeChange: {
        previous: domainResult.progressSummary.difficultyProgression.previousEaseFactor,
        current: domainResult.progressSummary.difficultyProgression.currentEaseFactor,
        change: domainResult.progressSummary.difficultyProgression.difficultyChange
      }
    };
  }

  private buildStudySessionQueryFrom(options: DueReviewsOptions): ReviewSessionQuery {
    const queryBuilder = ReviewSessionQuery.builder();

    if (options.limit) {
      queryBuilder.limitTo(options.limit);
    }

    if (options.folderId) {
      queryBuilder.inFolder(options.folderId);
    }

    if (options.status && options.status.length > 0) {
      queryBuilder.withStatuses(options.status);
    }

    if (options.prioritizeByDifficulty) {
      queryBuilder.prioritizingDifficulty();
    }

    if (options.currentTime) {
      queryBuilder.atTime(options.currentTime);
    }

    return queryBuilder.build();
  }

  private buildConceptBatchFrom(options: BulkScheduleOptions): ConceptBatch {
    const batchBuilder = ConceptBatch.builder()
      .withConcepts(options.conceptIds);

    if (options.folderId) {
      batchBuilder.inFolder(options.folderId);
    }

    if (options.batchSize) {
      batchBuilder.usingBatchSize(BatchSize.of(options.batchSize));
    }

    if (options.skipExisting === false) {
      batchBuilder.allowingDuplicates();
    }

    return batchBuilder.build();
  }
}