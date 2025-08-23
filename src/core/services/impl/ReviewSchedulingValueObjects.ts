/**
 * Value Objects for Review Scheduling
 * 
 * These value objects encapsulate related data and behavior,
 * making the service layer more expressive and type-safe.
 * They eliminate primitive obsession and create meaningful abstractions.
 */

import { ReviewStatus } from '../../spaced-repetition/domain/ReviewSchedule';

export class ConceptIdentifier {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('ConceptIdentifier cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: ConceptIdentifier): boolean {
    return this.value === other.value;
  }
}

export class StudySessionLimit {
  constructor(private readonly maxReviews: number) {
    if (maxReviews < 1) {
      throw new Error('Study session must allow at least 1 review');
    }
  }

  getValue(): number {
    return this.maxReviews;
  }

  isUnlimited(): boolean {
    return this.maxReviews === Number.MAX_SAFE_INTEGER;
  }

  static unlimited(): StudySessionLimit {
    return new StudySessionLimit(Number.MAX_SAFE_INTEGER);
  }

  static of(count: number): StudySessionLimit {
    return new StudySessionLimit(count);
  }
}

export class DifficultyPrioritization {
  constructor(private readonly enabled: boolean) {}

  static enabled(): DifficultyPrioritization {
    return new DifficultyPrioritization(true);
  }

  static disabled(): DifficultyPrioritization {
    return new DifficultyPrioritization(false);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export class FolderScope {
  constructor(private readonly folderId?: string) {}

  static allFolders(): FolderScope {
    return new FolderScope();
  }

  static specificFolder(folderId: string): FolderScope {
    return new FolderScope(folderId);
  }

  getFolderId(): string | undefined {
    return this.folderId;
  }

  isScoped(): boolean {
    return this.folderId !== undefined;
  }
}

export class ReviewSessionQuery {
  constructor(
    private readonly sessionLimit: StudySessionLimit,
    private readonly folderScope: FolderScope,
    private readonly statusFilter: ReviewStatus[],
    private readonly difficultyPrioritization: DifficultyPrioritization,
    private readonly currentMoment: Date
  ) {}

  static builder() {
    return new ReviewSessionQueryBuilder();
  }

  getLimit(): number | undefined {
    return this.sessionLimit.isUnlimited() ? undefined : this.sessionLimit.getValue();
  }

  getFolderId(): string | undefined {
    return this.folderScope.getFolderId();
  }

  getStatusFilter(): ReviewStatus[] {
    return this.statusFilter;
  }

  shouldPrioritizeByDifficulty(): boolean {
    return this.difficultyPrioritization.isEnabled();
  }

  getCurrentTime(): Date {
    return this.currentMoment;
  }
}

class ReviewSessionQueryBuilder {
  private sessionLimit = StudySessionLimit.unlimited();
  private folderScope = FolderScope.allFolders();
  private statusFilter: ReviewStatus[] = [];
  private difficultyPrioritization = DifficultyPrioritization.disabled();
  private currentMoment = new Date();

  limitTo(count: number): ReviewSessionQueryBuilder {
    this.sessionLimit = StudySessionLimit.of(count);
    return this;
  }

  inFolder(folderId: string): ReviewSessionQueryBuilder {
    this.folderScope = FolderScope.specificFolder(folderId);
    return this;
  }

  withStatuses(statuses: ReviewStatus[]): ReviewSessionQueryBuilder {
    this.statusFilter = [...statuses];
    return this;
  }

  prioritizingDifficulty(): ReviewSessionQueryBuilder {
    this.difficultyPrioritization = DifficultyPrioritization.enabled();
    return this;
  }

  atTime(time: Date): ReviewSessionQueryBuilder {
    this.currentMoment = time;
    return this;
  }

  build(): ReviewSessionQuery {
    return new ReviewSessionQuery(
      this.sessionLimit,
      this.folderScope,
      this.statusFilter,
      this.difficultyPrioritization,
      this.currentMoment
    );
  }
}

export class BatchSize {
  constructor(private readonly size: number) {
    if (size < 1) {
      throw new Error('Batch size must be at least 1');
    }
  }

  getValue(): number {
    return this.size;
  }

  static small(): BatchSize {
    return new BatchSize(10);
  }

  static medium(): BatchSize {
    return new BatchSize(50);
  }

  static large(): BatchSize {
    return new BatchSize(100);
  }

  static of(size: number): BatchSize {
    return new BatchSize(size);
  }
}

export class ConceptBatch {
  constructor(
    private readonly conceptIds: ConceptIdentifier[],
    private readonly folderScope: FolderScope,
    private readonly batchSize: BatchSize,
    private readonly skipExisting: boolean
  ) {}

  static builder() {
    return new ConceptBatchBuilder();
  }

  getConceptIds(): string[] {
    return this.conceptIds.map(id => id.toString());
  }

  getFolderId(): string | undefined {
    return this.folderScope.getFolderId();
  }

  getBatchSize(): number {
    return this.batchSize.getValue();
  }

  shouldSkipExisting(): boolean {
    return this.skipExisting;
  }

  getTotalCount(): number {
    return this.conceptIds.length;
  }
}

class ConceptBatchBuilder {
  private conceptIds: ConceptIdentifier[] = [];
  private folderScope = FolderScope.allFolders();
  private batchSize = BatchSize.medium();
  private skipExisting = true;

  withConcepts(conceptIds: string[]): ConceptBatchBuilder {
    this.conceptIds = conceptIds.map(id => new ConceptIdentifier(id));
    return this;
  }

  inFolder(folderId: string): ConceptBatchBuilder {
    this.folderScope = FolderScope.specificFolder(folderId);
    return this;
  }

  usingBatchSize(size: BatchSize): ConceptBatchBuilder {
    this.batchSize = size;
    return this;
  }

  allowingDuplicates(): ConceptBatchBuilder {
    this.skipExisting = false;
    return this;
  }

  build(): ConceptBatch {
    if (this.conceptIds.length === 0) {
      throw new Error('ConceptBatch must contain at least one concept');
    }
    return new ConceptBatch(
      this.conceptIds,
      this.folderScope,
      this.batchSize,
      this.skipExisting
    );
  }
}

export class TimeWindow {
  constructor(private readonly days: number) {
    if (days < 1) {
      throw new Error('Time window must be at least 1 day');
    }
  }

  getDays(): number {
    return this.days;
  }

  static oneDay(): TimeWindow {
    return new TimeWindow(1);
  }

  static oneWeek(): TimeWindow {
    return new TimeWindow(7);
  }

  static twoWeeks(): TimeWindow {
    return new TimeWindow(14);
  }

  static oneMonth(): TimeWindow {
    return new TimeWindow(30);
  }

  static of(days: number): TimeWindow {
    return new TimeWindow(days);
  }
}

export class OverdueThreshold {
  constructor(private readonly daysPastDue: number) {
    if (daysPastDue < 0) {
      throw new Error('Overdue threshold cannot be negative');
    }
  }

  getDays(): number {
    return this.daysPastDue;
  }

  static immediately(): OverdueThreshold {
    return new OverdueThreshold(0);
  }

  static afterOneDay(): OverdueThreshold {
    return new OverdueThreshold(1);
  }

  static afterOneWeek(): OverdueThreshold {
    return new OverdueThreshold(7);
  }

  static of(days: number): OverdueThreshold {
    return new OverdueThreshold(days);
  }
}

export class AbandonmentThreshold {
  constructor(private readonly daysWithoutReview: number) {
    if (daysWithoutReview < 1) {
      throw new Error('Abandonment threshold must be at least 1 day');
    }
  }

  getDays(): number {
    return this.daysWithoutReview;
  }

  static oneMonth(): AbandonmentThreshold {
    return new AbandonmentThreshold(30);
  }

  static threeMonths(): AbandonmentThreshold {
    return new AbandonmentThreshold(90);
  }

  static sixMonths(): AbandonmentThreshold {
    return new AbandonmentThreshold(180);
  }

  static oneYear(): AbandonmentThreshold {
    return new AbandonmentThreshold(365);
  }

  static of(days: number): AbandonmentThreshold {
    return new AbandonmentThreshold(days);
  }
}