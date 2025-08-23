# Spaced Repetition System - API Reference

## Table of Contents
1. [Quick Start](#quick-start)
2. [Core Domain API](#core-domain-api)
3. [Repository Interfaces](#repository-interfaces)
4. [Service Layer API](#service-layer-api)
5. [Question Generation API](#question-generation-api)
6. [Configuration](#configuration)
7. [Error Handling](#error-handling)
8. [Type Definitions](#type-definitions)

## Quick Start

### Basic Setup

```typescript
import { 
  ReviewSchedule, 
  FileSystemReviewScheduleRepository,
  ReadableReviewSchedulerService,
  ResponseQuality 
} from '@/core/spaced-repetition';

// Initialize repository
const repository = new FileSystemReviewScheduleRepository('./data/schedules');

// Initialize service
const schedulerService = new ReadableReviewSchedulerService(repository);

// Create a new review schedule
const schedule = ReviewSchedule.createNew('linear-algebra-basics');

// Record a review session
schedule.recordReview(ResponseQuality.GOOD);

// Save to persistence
await repository.save(schedule);
```

### With Question Generation

```typescript
import { 
  OpenAIQuestionGenerationService,
  FileSystemQuestionRepository,
  QuestionManagementService 
} from '@/core';

// Setup question generation
const questionGeneration = new OpenAIQuestionGenerationService();
const questionRepository = new FileSystemQuestionRepository('./data/questions');
const questionService = new QuestionManagementService(
  questionGeneration,
  questionRepository,
  repository
);

// Generate questions and create review schedules
const result = await questionService.generateAndScheduleQuestions(
  "Linear algebra is the study of vectors and linear transformations..."
);
```

## Core Domain API

### ReviewSchedule

The main aggregate root for managing spaced repetition schedules.

#### Factory Methods

```typescript
class ReviewSchedule {
  /** Create a new review schedule for a concept */
  static createNew(conceptId: string): ReviewSchedule;
  
  /** Restore from persisted data */
  static fromData(data: ReviewScheduleData): ReviewSchedule;
}
```

#### Primary Operations

```typescript
/** Record the outcome of a review session */
recordReview(quality: ResponseQuality): void;

/** Calculate when the next review should occur */
calculateNextReview(currentTime?: Date): void;

/** Check if this schedule is due for review */
isDue(currentTime?: Date): boolean;

/** Check if review is allowed (not too early) */
canBeReviewed(): boolean;
```

#### Getters (Read-Only Access)

```typescript
get id(): string;
get conceptId(): string;
get status(): ReviewStatus;
get totalReviews(): number;
get createdAt(): Date;
get lastReviewedAt(): Date | undefined;
get parameters(): ReviewParameters;
get timing(): ReviewTiming;

// Computed properties
getDaysUntilNextReview(): number;
getDaysSinceLastReview(): number;
getSuccessRate(): number;
```

#### Data Export

```typescript
/** Export schedule data for persistence or transfer */
toData(): ReviewScheduleData;

/** Export minimal data for API responses */
toSummary(): ReviewScheduleSummary;
```

### ReviewParameters

Value object encapsulating SM-2 algorithm state.

```typescript
class ReviewParameters {
  constructor(
    repetitions: number,      // Number of successful reviews
    easinessFactor: number,   // 1.3 - 3.0, affects interval growth
    interval: number          // Days until next review
  );
  
  // Getters
  get repetitions(): number;
  get easinessFactor(): number;
  get interval(): number;
  
  // Status checks
  isLearning(): boolean;     // repetitions < 2
  isMature(): boolean;       // interval >= 21 days
  isYoung(): boolean;        // graduated but interval < 21 days
  
  // Data export
  toData(): ReviewParametersData;
}
```

### ReviewTiming

Value object for time-related calculations.

```typescript
class ReviewTiming {
  constructor(
    nextReviewDate: Date,
    isOverdue: boolean
  );
  
  // Static factory method
  static calculateNext(
    parameters: ReviewParameters,
    quality: ResponseQuality,
    algorithm: SM2Algorithm,
    currentTime?: Date
  ): ReviewTiming;
  
  // Getters
  get nextReviewDate(): Date;
  get isOverdue(): boolean;
  
  // Calculations
  getDaysUntilReview(currentTime?: Date): number;
  getDaysSinceScheduled(scheduledAt: Date, currentTime?: Date): number;
  
  // Status checks
  isDue(currentTime?: Date): boolean;
  isOverdue(currentTime?: Date): boolean;
  
  // Data export
  toData(): ReviewTimingData;
}
```

### Enums

```typescript
enum ResponseQuality {
  FORGOT = 'forgot',    // Reset to learning, reduce ease
  HARD = 'hard',        // Reduce ease, shorter interval
  GOOD = 'good',        // Maintain ease, normal interval
  EASY = 'easy'         // Increase ease, longer interval
}

enum ReviewStatus {
  NEW = 'new',          // Never reviewed
  LEARNING = 'learning', // In learning phase (< 2 successful reviews)
  REVIEWING = 'reviewing', // Regular review phase
  RELEARNING = 'relearning' // Reset due to forgot response
}
```

## Repository Interfaces

### IReviewScheduleRepository

Primary repository interface for review schedule persistence.

#### Core CRUD Operations

```typescript
interface IReviewScheduleRepository {
  /** Save a single review schedule */
  save(schedule: ReviewSchedule): Promise<void>;
  
  /** Save multiple schedules efficiently */
  saveMany(schedules: ReviewSchedule[]): Promise<void>;
  
  /** Find schedule by unique ID */
  findById(id: string): Promise<ReviewSchedule | null>;
  
  /** Find schedule for a specific concept */
  findByConceptId(conceptId: string): Promise<ReviewSchedule | null>;
  
  /** Check if schedule exists */
  exists(id: string): Promise<boolean>;
  
  /** Delete a schedule */
  delete(id: string): Promise<void>;
}
```

#### Query Operations

```typescript
interface DueReviewOptions {
  maxCards?: number;           // Limit number of results
  prioritizeDifficult?: boolean; // Show difficult cards first
  includeOverdue?: boolean;    // Include overdue reviews
  currentTime?: Date;          // Override current time for testing
}

/** Find schedules due for review */
findDueReviews(options?: DueReviewOptions): Promise<ReviewSchedule[]>;

/** Count total due reviews */
countDueReviews(currentTime?: Date): Promise<number>;

/** Find schedules by status */
findByStatus(status: ReviewStatus): Promise<ReviewSchedule[]>;

/** Count schedules by status */
countByStatus(status: ReviewStatus): Promise<number>;

/** Get total schedule count */
count(): Promise<number>;
```

#### Analytics Operations

```typescript
interface EaseFactorDistribution {
  easeFactor: number;    // Ease factor range (e.g., 1.3-1.4)
  count: number;         // Number of schedules in this range
  percentage: number;    // Percentage of total schedules
}

interface IntervalDistribution {
  intervalRange: string; // Human readable range (e.g., "1-7 days")
  count: number;
  percentage: number;
}

interface RepositoryStatistics {
  totalSchedules: number;
  averageEaseFactor: number;
  averageInterval: number;
  statusDistribution: Record<ReviewStatus, number>;
  lastUpdated: Date;
}

/** Get ease factor distribution across all schedules */
getEaseFactorDistribution(): Promise<EaseFactorDistribution[]>;

/** Get interval distribution for analysis */
getIntervalDistribution(): Promise<IntervalDistribution[]>;

/** Find concepts with consistently poor performance */
findProblematicConcepts(threshold?: number): Promise<string[]>;

/** Get comprehensive repository statistics */
getStatistics(): Promise<RepositoryStatistics>;
```

#### Data Management Operations

```typescript
interface ReviewScheduleExport {
  version: string;
  exportDate: Date;
  schedules: ReviewScheduleData[];
  metadata: {
    totalCount: number;
    conceptIds: string[];
    dateRange: { earliest: Date; latest: Date };
  };
}

/** Export schedules for backup or transfer */
exportSchedules(conceptIds?: string[]): Promise<ReviewScheduleExport>;

/** Import schedules from backup */
importSchedules(data: ReviewScheduleExport): Promise<void>;

/** Cleanup old or invalid schedules */
cleanup(): Promise<number>;
```

### IQuestionRepository

Repository interface for question persistence.

#### Core Operations

```typescript
interface IQuestionRepository {
  /** Save a generated question */
  save(question: GeneratedQuestion): Promise<void>;
  
  /** Save multiple questions in batch */
  saveBatch(questions: GeneratedQuestion[]): Promise<void>;
  
  /** Find question by ID */
  findById(questionId: string): Promise<GeneratedQuestion | null>;
  
  /** Find all questions for a concept */
  findByConceptHash(conceptHash: string): Promise<GeneratedQuestion[]>;
  
  /** Update existing question */
  update(questionId: string, updates: Partial<GeneratedQuestion>): Promise<void>;
  
  /** Delete question */
  delete(questionId: string): Promise<void>;
  
  /** Delete all questions for a concept */
  deleteByConceptHash(conceptHash: string): Promise<number>;
}
```

#### Search and Query Operations

```typescript
interface QuestionSearchCriteria {
  conceptHash?: string;
  types?: QuestionType[];
  difficulties?: QuestionDifficulty[];
  conceptArea?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/** Search questions with flexible criteria */
search(criteria: QuestionSearchCriteria): Promise<GeneratedQuestion[]>;

/** Get questions ready for review */
getQuestionsForReview(conceptHash: string, maxQuestions?: number): Promise<GeneratedQuestion[]>;

/** Check if questions exist for concept */
hasQuestionsForConcept(conceptHash: string): Promise<boolean>;

/** Get total question count */
getTotalQuestionCount(): Promise<number>;
```

#### Metadata and Analytics

```typescript
interface QuestionStorageMetadata {
  totalCount: number;
  typeDistribution: Record<QuestionType, number>;
  difficultyDistribution: Record<QuestionDifficulty, number>;
  firstCreated: Date;
  lastCreated: Date;
  storageSizeBytes: number;
}

/** Get storage metadata for a concept */
getStorageMetadata(conceptHash: string): Promise<QuestionStorageMetadata>;

/** Cleanup old questions based on age */
cleanup(maxAgeInDays: number): Promise<number>;
```

## Service Layer API

### IReviewSchedulerService

High-level service for managing review workflows.

#### Study Session Management

```typescript
interface StudySessionOptions {
  maxCards: number;
  timeConstraintMinutes?: number;
  prioritizeDifficult: boolean;
  includeNewCards: boolean;
  conceptIds?: string[];
}

interface StudySession {
  schedules: ReviewSchedule[];
  estimatedDurationMinutes: number;
  newCardsCount: number;
  reviewCardsCount: number;
  overdueCardsCount: number;
}

/** Get schedules for a study session */
getStudySession(options: StudySessionOptions): Promise<StudySession>;
```

#### Review Processing

```typescript
interface ReviewOutcome {
  scheduleId: string;
  quality: ResponseQuality;
  timeSpentSeconds?: number;
  reviewedAt?: Date;
}

interface ReviewSessionResult {
  processedCount: number;
  updatedSchedules: ReviewSchedule[];
  nextSessionRecommendation: Date;
  performanceSummary: {
    averageQuality: number;
    totalTimeSpent: number;
    conceptsReviewed: string[];
  };
}

/** Process review outcomes and reschedule */
recordReviewOutcomesAndReschedule(outcomes: ReviewOutcome[]): Promise<ReviewSessionResult>;
```

#### Analytics and Reporting

```typescript
interface LearningProgressReport {
  totalConcepts: number;
  dueToday: number;
  overdueCount: number;
  averageEaseFactor: number;
  problematicConcepts: string[];
  estimatedStudyMinutes: number;
  retentionRate: number;
  streakDays: number;
  lastStudyDate?: Date;
}

/** Generate comprehensive progress report */
generateComprehensiveProgressReport(): Promise<LearningProgressReport>;

/** Get upcoming review schedule */
getUpcomingReviews(days: number): Promise<Map<Date, number>>;

/** Calculate study load for planning */
calculateStudyLoad(fromDate: Date, toDate: Date): Promise<number[]>;
```

### IQuestionGenerationService

Service for generating questions from content.

#### Core Generation

```typescript
interface QuestionGenerationServiceRequest {
  content: string;
  conceptArea?: string;
  difficulty?: QuestionDifficulty;
  questionCount?: number;
  questionTypes?: QuestionType[];
  learningObjectives?: string[];
}

interface QuestionGenerationResult {
  questions: GeneratedQuestion[];
  metadata: {
    sourceContentHash: string;
    generationTime: number;
    tokensUsed: number;
    cacheHit: boolean;
  };
  warnings: string[];
  errors: string[];
}

/** Generate questions from text content */
generateQuestions(request: QuestionGenerationServiceRequest): Promise<QuestionGenerationResult>;
```

#### Batch and Advanced Operations

```typescript
/** Generate questions for multiple content pieces */
generateQuestionsInBatch(requests: QuestionGenerationServiceRequest[]): Promise<QuestionGenerationResult[]>;

/** Check if questions exist in cache */
hasQuestionsInCache(contentHash: string): Promise<boolean>;

/** Get cached questions */
getCachedQuestions(contentHash: string): Promise<GeneratedQuestion[] | null>;

/** Clear generation cache */
clearCache(): Promise<void>;
```

### IQuestionManagementService

Integrated service combining question generation with spaced repetition.

```typescript
interface QuestionManagementService {
  /** Generate questions and create review schedules */
  generateAndScheduleQuestions(content: string, options?: QuestionGenerationServiceRequest): Promise<{
    questions: GeneratedQuestion[];
    schedules: ReviewSchedule[];
    result: QuestionGenerationResult;
  }>;
  
  /** Get questions ready for review with their schedules */
  getQuestionsForReview(conceptHash: string, maxQuestions?: number): Promise<{
    questions: GeneratedQuestion[];
    schedules: ReviewSchedule[];
  }>;
  
  /** Process question review and update schedule */
  processQuestionReview(questionId: string, quality: ResponseQuality): Promise<void>;
  
  /** Delete questions and their associated schedules */
  deleteQuestionsAndSchedules(conceptHash: string): Promise<number>;
}
```

## Question Generation API

### Question Types

```typescript
type QuestionType = 
  | 'flashcard'
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'matching'
  | 'fill_in_blank';

type QuestionDifficulty = 
  | 'review'         // Simple recall
  | 'beginner'       // Basic understanding
  | 'intermediate'   // Application
  | 'advanced';      // Analysis/synthesis
```

### Question Schema

```typescript
interface GeneratedQuestion {
  id: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  question: string;
  correctAnswer: string | string[];
  
  // Optional fields based on question type
  explanation?: string;
  options?: string[];           // For multiple choice
  distractors?: string[];       // Alternative wrong answers
  hints?: string[];
  
  // Metadata
  conceptArea: string;
  sourceContentHash: string;
  confidence: number;           // 0-1, generation confidence
  estimatedTimeSeconds: number;
  tags: string[];
  
  // Generation metadata
  metadata: {
    generatedAt: Date;
    model: string;
    promptVersion: string;
    tokensUsed: number;
  };
}
```

## Configuration

### Review Scheduler Configuration

```typescript
interface SM2Config {
  minEase: number;              // Default: 1.3
  maxEase: number;              // Default: 3.0
  easyBonus: number;            // Default: 1.3
  intervalModifier: number;     // Default: 1.0
  learningSteps: number[];      // Default: [1, 10] (minutes)
  graduatingInterval: number;   // Default: 1 (day)
  easyInterval: number;         // Default: 4 (days)
  hardFactor: number;           // Default: 0.15
  forgotFactor: number;         // Default: 0.2
  easyFactor: number;           // Default: 0.15
}
```

### Question Generation Configuration

```typescript
interface QuestionGenerationConfig {
  openai: {
    apiKey: string;
    model: string;              // Default: 'gpt-3.5-turbo'
    maxTokens: number;          // Default: 2000
    temperature: number;        // Default: 0.7
  };
  generation: {
    questionsPerConcept: number;  // Default: 5
    difficultyDistribution: {
      review: number;           // Default: 0.3
      beginner: number;         // Default: 0.4
      intermediate: number;     // Default: 0.2
      advanced: number;         // Default: 0.1
    };
    enableCaching: boolean;     // Default: true
    cacheExpiryHours: number;   // Default: 24
  };
  performance: {
    requestTimeoutMs: number;   // Default: 30000
    maxRetries: number;         // Default: 3
    batchSize: number;          // Default: 10
  };
}
```

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_api_key_here

# Optional (with defaults)
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7

# Storage paths
SPACED_REPETITION_DATA_PATH=./data/schedules
QUESTION_DATA_PATH=./data/questions

# Performance tuning
QUESTION_CACHE_ENABLED=true
QUESTION_CACHE_EXPIRY_HOURS=24
MAX_CONCURRENT_REQUESTS=5
```

## Error Handling

### Error Hierarchy

```typescript
// Base error classes
abstract class SpacedRepetitionError extends Error {
  abstract readonly code: string;
  abstract readonly recoverable: boolean;
}

abstract class QuestionGenerationError extends Error {
  abstract readonly code: string;
  abstract readonly recoverable: boolean;
}

// Specific error types
class ReviewScheduleValidationError extends SpacedRepetitionError {
  readonly code = 'SCHEDULE_VALIDATION_ERROR';
  readonly recoverable = false;
}

class ReviewScheduleNotFoundError extends SpacedRepetitionError {
  readonly code = 'SCHEDULE_NOT_FOUND';
  readonly recoverable = false;
}

class RepositoryConnectionError extends SpacedRepetitionError {
  readonly code = 'REPOSITORY_CONNECTION_ERROR';
  readonly recoverable = true;
}

class OpenAIServiceError extends QuestionGenerationError {
  readonly code = 'OPENAI_SERVICE_ERROR';
  readonly recoverable = true;
}

class QuestionValidationError extends QuestionGenerationError {
  readonly code = 'QUESTION_VALIDATION_ERROR';
  readonly recoverable = false;
}
```

### Error Context

All errors include rich context for debugging:

```typescript
interface ErrorContext {
  timestamp: Date;
  operation: string;
  parameters?: Record<string, any>;
  stackTrace: string;
  correlationId?: string;
}

class SpacedRepetitionError extends Error {
  constructor(
    message: string,
    public readonly context: ErrorContext
  ) {
    super(message);
  }
}
```

### Error Handling Patterns

```typescript
try {
  const result = await questionService.generateQuestions(request);
  return result;
} catch (error) {
  if (error instanceof OpenAIServiceError && error.recoverable) {
    // Retry with exponential backoff
    return await retryWithBackoff(() => questionService.generateQuestions(request));
  }
  
  if (error instanceof QuestionValidationError) {
    // Log validation failure and return partial results
    logger.warn('Question validation failed', { error: error.context });
    return { questions: [], warnings: [error.message] };
  }
  
  // Re-throw unhandled errors
  throw error;
}
```

## Type Definitions

### Core Data Types

```typescript
interface ReviewScheduleData {
  id: string;
  conceptId: string;
  parameters: ReviewParametersData;
  timing: ReviewTimingData;
  status: ReviewStatus;
  totalReviews: number;
  createdAt: string;          // ISO date string
  lastReviewedAt?: string;    // ISO date string
}

interface ReviewParametersData {
  repetitions: number;
  easinessFactor: number;
  interval: number;
}

interface ReviewTimingData {
  nextReviewDate: string;     // ISO date string
  isOverdue: boolean;
}

interface ReviewScheduleSummary {
  id: string;
  conceptId: string;
  status: ReviewStatus;
  nextReviewDate: string;
  isOverdue: boolean;
  totalReviews: number;
}
```

### Utility Types

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type WithMetadata<T> = T & {
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

type AsyncResult<T, E = Error> = Promise<{ data: T; error: null } | { data: null; error: E }>;
```

---

This API reference provides comprehensive documentation for all public interfaces and methods in the spaced repetition system. Use it alongside the [implementation guide](./SPACED_REPETITION_SYSTEM.md) for complete system understanding.