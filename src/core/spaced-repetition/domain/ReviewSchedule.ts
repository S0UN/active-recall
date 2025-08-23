/**
 * ReviewSchedule Domain Entity
 * 
 * Represents the spaced repetition schedule for a concept, tracking when it should
 * be reviewed next based on the SM-2 algorithm. This entity encapsulates all
 * the business logic for scheduling reviews and updating parameters.
 * 
 * Key responsibilities:
 * - Track SM-2 algorithm parameters (repetitions, ease factor, interval)
 * - Calculate when a concept is due for review
 * - Update schedule based on review performance
 * - Maintain review status and metadata
 */

import { createHash } from 'crypto';

/**
 * Response quality levels following Anki's 4-point scale
 */
export enum ResponseQuality {
  FORGOT = 0,   // Complete failure - reset to learning
  HARD = 1,     // Difficult but eventually correct
  GOOD = 2,     // Normal difficulty - no extra effort
  EASY = 3      // Too easy - could have waited longer
}

/**
 * Review status indicating the maturity level of the concept
 */
export enum ReviewStatus {
  NEW = 'new',           // Never reviewed
  LEARNING = 'learning', // In initial learning phase
  REVIEWING = 'reviewing', // Regular spaced repetition
  MATURE = 'mature',     // Long intervals, well learned
  SUSPENDED = 'suspended', // User has disabled reviews
  LEECH = 'leech'        // Problematic concept requiring attention
}

/**
 * Value object representing SM-2 algorithm parameters
 */
export class ReviewParameters {
  readonly repetitions: number;
  readonly easinessFactor: number;
  readonly interval: number;

  constructor(repetitions: number = 0, easinessFactor: number = 2.5, interval: number = 1) {
    if (repetitions < 0) {
      throw new Error('Repetitions cannot be negative');
    }
    if (easinessFactor < 1.3 || easinessFactor > 2.5) {
      throw new Error('Easiness factor must be between 1.3 and 2.5');
    }
    if (interval < 1) {
      throw new Error('Interval must be at least 1 day');
    }

    this.repetitions = repetitions;
    this.easinessFactor = Number(easinessFactor.toFixed(2));
    this.interval = Math.round(interval);
  }

  /**
   * Create initial parameters for a new concept
   */
  static initial(): ReviewParameters {
    return new ReviewParameters(0, 2.5, 1);
  }

  /**
   * Create updated parameters based on response quality
   * This is now just a simple data container - actual algorithm logic
   * should be in the SM2Algorithm class
   */
  updateForResponse(quality: ResponseQuality): ReviewParameters {
    // This method is deprecated - use SM2Algorithm.calculateNext() instead
    // Keeping minimal implementation for backward compatibility
    
    switch (quality) {
      case ResponseQuality.FORGOT:
        return new ReviewParameters(
          0, // Reset repetitions
          Math.max(1.3, this.easinessFactor - 0.2), // Reduce ease
          1 // Reset to 1 day
        );
      
      case ResponseQuality.HARD:
        return new ReviewParameters(
          this.repetitions + 1,
          Math.max(1.3, this.easinessFactor - 0.15),
          this.calculateNextInterval(Math.max(1.3, this.easinessFactor - 0.15))
        );
      
      case ResponseQuality.GOOD:
        return new ReviewParameters(
          this.repetitions + 1,
          this.easinessFactor, // No change
          this.calculateNextInterval(this.easinessFactor)
        );
      
      case ResponseQuality.EASY:
        const newEase = Math.min(2.5, this.easinessFactor + 0.15);
        const baseInterval = this.calculateNextInterval(newEase);
        return new ReviewParameters(
          this.repetitions + 1,
          newEase,
          Math.round(baseInterval * 1.3) // Easy bonus
        );
    }
  }

  private calculateNextInterval(easeFactor: number): number {
    if (this.repetitions === 0) {
      return 1; // First review: 1 day
    }
    if (this.repetitions === 1) {
      return 6; // Second review: 6 days
    }
    return Math.round(this.interval * easeFactor);
  }

  /**
   * Check if this represents a mature concept (21+ day intervals)
   */
  isMature(): boolean {
    return this.interval >= 21;
  }
}

/**
 * Value object representing review timing information
 */
export class ReviewTiming {
  readonly createdAt: Date;
  readonly lastReviewDate: Date | null;
  readonly nextReviewDate: Date;

  constructor(
    createdAt: Date = new Date(),
    lastReviewDate: Date | null = null,
    nextReviewDate: Date = new Date()
  ) {
    this.createdAt = createdAt;
    this.lastReviewDate = lastReviewDate;
    this.nextReviewDate = nextReviewDate;
  }

  /**
   * Create initial timing for a new schedule
   */
  static initial(): ReviewTiming {
    const now = new Date();
    // New schedules are due immediately for the first review
    return new ReviewTiming(now, null, now);
  }

  /**
   * Update timing after a review
   */
  updateAfterReview(intervalDays: number): ReviewTiming {
    const now = new Date();
    const nextReview = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    
    return new ReviewTiming(this.createdAt, now, nextReview);
  }

  /**
   * Check if the concept is currently due for review
   */
  isDue(currentTime: Date = new Date()): boolean {
    return this.nextReviewDate <= currentTime;
  }

  /**
   * Get number of days overdue (negative if not overdue)
   */
  getDaysOverdue(currentTime: Date = new Date()): number {
    const timeDiff = currentTime.getTime() - this.nextReviewDate.getTime();
    return Math.floor(timeDiff / (24 * 60 * 60 * 1000));
  }

  /**
   * Check if the concept is overdue by more than specified days
   */
  isOverdue(days: number = 1, currentTime: Date = new Date()): boolean {
    return this.getDaysOverdue(currentTime) >= days;
  }
}

/**
 * ReviewSchedule Domain Entity
 */
export class ReviewSchedule {
  private readonly _id: string;
  private readonly _conceptId: string;
  private _parameters: ReviewParameters;
  private _timing: ReviewTiming;
  private _status: ReviewStatus;
  private _totalReviews: number;
  private _consecutiveCorrect: number;
  private _consecutiveIncorrect: number;

  private constructor(
    id: string,
    conceptId: string,
    parameters: ReviewParameters,
    timing: ReviewTiming,
    status: ReviewStatus,
    totalReviews: number = 0,
    consecutiveCorrect: number = 0,
    consecutiveIncorrect: number = 0
  ) {
    this._id = id;
    this._conceptId = conceptId;
    this._parameters = parameters;
    this._timing = timing;
    this._status = status;
    this._totalReviews = totalReviews;
    this._consecutiveCorrect = consecutiveCorrect;
    this._consecutiveIncorrect = consecutiveIncorrect;
  }

  // Getters
  get id(): string { return this._id; }
  get conceptId(): string { return this._conceptId; }
  get parameters(): ReviewParameters { return this._parameters; }
  get timing(): ReviewTiming { return this._timing; }
  get status(): ReviewStatus { return this._status; }
  get totalReviews(): number { return this._totalReviews; }
  get consecutiveCorrect(): number { return this._consecutiveCorrect; }
  get consecutiveIncorrect(): number { return this._consecutiveIncorrect; }

  /**
   * Factory method to create a new review schedule
   */
  static createNew(conceptId: string): ReviewSchedule {
    const id = ReviewSchedule.generateId(conceptId);
    
    return new ReviewSchedule(
      id,
      conceptId,
      ReviewParameters.initial(),
      ReviewTiming.initial(),
      ReviewStatus.NEW
    );
  }

  /**
   * Factory method to restore from persisted data
   */
  static restore(data: {
    id: string;
    conceptId: string;
    parameters: ReviewParameters;
    timing: ReviewTiming;
    status: ReviewStatus;
    totalReviews?: number;
    consecutiveCorrect?: number;
    consecutiveIncorrect?: number;
  }): ReviewSchedule {
    return new ReviewSchedule(
      data.id,
      data.conceptId,
      data.parameters,
      data.timing,
      data.status,
      data.totalReviews || 0,
      data.consecutiveCorrect || 0,
      data.consecutiveIncorrect || 0
    );
  }

  /**
   * Generate deterministic ID based on concept ID
   */
  private static generateId(conceptId: string): string {
    const hash = createHash('sha256')
      .update(`review_schedule:${conceptId}`)
      .digest('hex');
    
    return `rs_${hash.substring(0, 16)}`;
  }

  /**
   * Record a review response and update the schedule
   */
  recordReview(quality: ResponseQuality): void {
    // Update parameters based on response
    this._parameters = this._parameters.updateForResponse(quality);
    
    // Update timing
    this._timing = this._timing.updateAfterReview(this._parameters.interval);
    
    // Update counters
    this._totalReviews++;
    
    if (quality === ResponseQuality.FORGOT) {
      this._consecutiveCorrect = 0;
      this._consecutiveIncorrect++;
    } else {
      this._consecutiveCorrect++;
      this._consecutiveIncorrect = 0;
    }
    
    // Update status based on progress
    this.updateStatus();
    
    // Check for leech status
    this.checkForLeech();
  }

  /**
   * Check if this concept is currently due for review
   */
  isDue(currentTime: Date = new Date()): boolean {
    return this._status !== ReviewStatus.SUSPENDED && 
           this._timing.isDue(currentTime);
  }

  /**
   * Check if this concept is overdue
   */
  isOverdue(days: number = 1, currentTime: Date = new Date()): boolean {
    return this._timing.isOverdue(days, currentTime);
  }

  /**
   * Get the number of days until next review (negative if overdue)
   */
  getDaysUntilReview(currentTime: Date = new Date()): number {
    return -this._timing.getDaysOverdue(currentTime);
  }

  /**
   * Suspend reviews for this concept
   */
  suspend(): void {
    this._status = ReviewStatus.SUSPENDED;
  }

  /**
   * Resume reviews for this concept
   */
  resume(): void {
    if (this._status === ReviewStatus.SUSPENDED) {
      this._status = this.calculateStatusFromParameters();
    }
  }

  /**
   * Get success rate as a decimal (0.0 to 1.0)
   */
  getSuccessRate(): number {
    if (this._totalReviews === 0) return 0;
    
    // Count non-forgot responses as successes
    const failures = this._consecutiveIncorrect; // This is an approximation
    const successes = Math.max(0, this._totalReviews - failures);
    
    return successes / this._totalReviews;
  }

  /**
   * Update status based on current parameters
   */
  private updateStatus(): void {
    if (this._status === ReviewStatus.SUSPENDED || this._status === ReviewStatus.LEECH) {
      return; // Don't change these statuses automatically
    }
    
    this._status = this.calculateStatusFromParameters();
  }

  private calculateStatusFromParameters(): ReviewStatus {
    if (this._parameters.repetitions === 0) {
      return ReviewStatus.NEW;
    }
    
    if (this._parameters.repetitions < 3) {
      return ReviewStatus.LEARNING;
    }
    
    if (this._parameters.isMature()) {
      return ReviewStatus.MATURE;
    }
    
    return ReviewStatus.REVIEWING;
  }

  /**
   * Check if concept should be marked as a leech
   * A leech is a concept that has been forgotten many times
   */
  private checkForLeech(): void {
    const LEECH_THRESHOLD = 8; // Number of consecutive failures
    
    if (this._consecutiveIncorrect >= LEECH_THRESHOLD) {
      this._status = ReviewStatus.LEECH;
    }
  }

  /**
   * Create a copy of this schedule with updated parameters (immutable update)
   */
  withUpdatedParameters(parameters: ReviewParameters): ReviewSchedule {
    return new ReviewSchedule(
      this._id,
      this._conceptId,
      parameters,
      this._timing,
      this._status,
      this._totalReviews,
      this._consecutiveCorrect,
      this._consecutiveIncorrect
    );
  }

  /**
   * Create a copy with updated timing
   */
  withUpdatedTiming(timing: ReviewTiming): ReviewSchedule {
    return new ReviewSchedule(
      this._id,
      this._conceptId,
      this._parameters,
      timing,
      this._status,
      this._totalReviews,
      this._consecutiveCorrect,
      this._consecutiveIncorrect
    );
  }

  /**
   * Serialize to plain object for persistence
   */
  toPlainObject(): Record<string, any> {
    return {
      id: this._id,
      conceptId: this._conceptId,
      parameters: {
        repetitions: this._parameters.repetitions,
        easinessFactor: this._parameters.easinessFactor,
        interval: this._parameters.interval
      },
      timing: {
        createdAt: this._timing.createdAt.toISOString(),
        lastReviewDate: this._timing.lastReviewDate?.toISOString() || null,
        nextReviewDate: this._timing.nextReviewDate.toISOString()
      },
      status: this._status,
      totalReviews: this._totalReviews,
      consecutiveCorrect: this._consecutiveCorrect,
      consecutiveIncorrect: this._consecutiveIncorrect
    };
  }

  /**
   * Restore from plain object
   */
  static fromPlainObject(data: Record<string, any>): ReviewSchedule {
    return ReviewSchedule.restore({
      id: data.id,
      conceptId: data.conceptId,
      parameters: new ReviewParameters(
        data.parameters.repetitions,
        data.parameters.easinessFactor,
        data.parameters.interval
      ),
      timing: new ReviewTiming(
        new Date(data.timing.createdAt),
        data.timing.lastReviewDate ? new Date(data.timing.lastReviewDate) : null,
        new Date(data.timing.nextReviewDate)
      ),
      status: data.status as ReviewStatus,
      totalReviews: data.totalReviews || 0,
      consecutiveCorrect: data.consecutiveCorrect || 0,
      consecutiveIncorrect: data.consecutiveIncorrect || 0
    });
  }
}