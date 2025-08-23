/**
 * IQuestionManagementService - Orchestrates question generation and spaced repetition
 * 
 * This service acts as the bridge between the question generation system and the
 * spaced repetition system, providing a unified interface for managing the complete
 * question lifecycle from generation to review.
 * 
 * Core responsibilities:
 * - Generate questions when concepts are ready for review
 * - Store and retrieve questions for spaced repetition sessions
 * - Track question performance and adapt difficulty
 * - Manage question lifecycle (creation, updates, archival)
 * - Provide analytics on question performance
 * 
 * Integration points:
 * - Uses IQuestionGenerationService for LLM-based question creation
 * - Uses IQuestionRepository for question persistence
 * - Integrates with ReviewScheduler for spaced repetition timing
 * - Coordinates with concept management system
 */

import { 
  GeneratedQuestion, 
  QuestionType, 
  QuestionDifficulty,
  DistilledContent,
  QuestionResponse,
  QuestionReviewSession
} from '../contracts/schemas';
import { QuestionSearchCriteria } from '../repositories/IQuestionRepository';

/**
 * Request for generating questions for a concept
 */
export interface ConceptQuestionGenerationRequest {
  /** The distilled concept to generate questions for */
  concept: DistilledContent;
  
  /** Number of questions to generate */
  questionCount?: number;
  
  /** Types of questions to generate */
  questionTypes?: QuestionType[];
  
  /** Target difficulty for the questions */
  targetDifficulty?: QuestionDifficulty;
  
  /** Force regeneration even if questions already exist */
  forceRegenerate?: boolean;
  
  /** Additional context for question generation */
  additionalContext?: string;
}

/**
 * Result of concept question generation
 */
export interface ConceptQuestionGenerationResult {
  /** The concept that questions were generated for */
  conceptHash: string;
  
  /** Generated questions */
  questions: GeneratedQuestion[];
  
  /** Number of questions requested vs generated */
  requestedCount: number;
  generatedCount: number;
  
  /** Whether questions were retrieved from cache */
  fromCache: boolean;
  
  /** Generation metadata */
  metadata: {
    processingTimeMs: number;
    model?: string;
    tokensUsed?: number;
    qualityScore?: number;
    cached: boolean;
  };
}

/**
 * Request for creating a review session
 */
export interface ReviewSessionRequest {
  /** Content hash of concept to review */
  conceptHash: string;
  
  /** Maximum number of questions in the session */
  maxQuestions?: number;
  
  /** Preferred question types for this session */
  preferredTypes?: QuestionType[];
  
  /** Target difficulty based on user performance */
  targetDifficulty?: QuestionDifficulty;
  
  /** Include performance context for adaptive questioning */
  includePerformanceContext?: boolean;
}

/**
 * Review session with questions ready for presentation
 */
export interface ReviewSession {
  /** Unique session identifier */
  sessionId: string;
  
  /** Concept being reviewed */
  conceptHash: string;
  conceptTitle: string;
  
  /** Questions for this session */
  questions: GeneratedQuestion[];
  
  /** Session metadata */
  metadata: {
    createdAt: Date;
    maxQuestions: number;
    expectedDuration: number; // in seconds
    difficulty: QuestionDifficulty;
    sessionType: 'review' | 'learning' | 'reinforcement';
  };
}

/**
 * Performance analytics for a concept's questions
 */
export interface ConceptQuestionAnalytics {
  /** Concept identifier */
  conceptHash: string;
  
  /** Total questions available */
  totalQuestions: number;
  
  /** Questions by type breakdown */
  questionTypeDistribution: Record<QuestionType, number>;
  
  /** Questions by difficulty breakdown */
  difficultyDistribution: Record<QuestionDifficulty, number>;
  
  /** Performance metrics */
  performance: {
    averageResponseTime: number;
    successRate: number;
    totalAttempts: number;
    lastReviewDate?: Date;
    nextReviewDate?: Date;
  };
  
  /** Quality metrics */
  quality: {
    averageQualityScore: number;
    userFeedbackScore?: number;
    flaggedQuestions: number;
  };
}

/**
 * Main service interface for question management
 */
export interface IQuestionManagementService {
  /**
   * Generate questions for a concept
   * 
   * Creates questions using the LLM service and stores them in the repository.
   * Will check for existing questions first unless force regeneration is requested.
   * 
   * @param request - Question generation parameters
   * @returns Promise resolving to generation result
   * @throws QuestionManagementError for generation or storage failures
   */
  generateQuestionsForConcept(request: ConceptQuestionGenerationRequest): Promise<ConceptQuestionGenerationResult>;

  /**
   * Create a review session for a concept
   * 
   * Retrieves appropriate questions for review based on spaced repetition
   * scheduling and user performance data.
   * 
   * @param request - Review session parameters
   * @returns Promise resolving to configured review session
   * @throws QuestionManagementError if no questions available or concept not found
   */
  createReviewSession(request: ReviewSessionRequest): Promise<ReviewSession>;

  /**
   * Record responses to questions in a review session
   * 
   * Updates question performance data and triggers spaced repetition
   * algorithm updates for scheduling the next review.
   * 
   * @param sessionId - Review session identifier
   * @param responses - User responses to questions
   * @returns Promise resolving when responses are recorded
   * @throws QuestionManagementError for invalid session or response data
   */
  recordSessionResponses(sessionId: string, responses: QuestionResponse[]): Promise<void>;

  /**
   * Get questions for a concept with flexible search criteria
   * 
   * @param conceptHash - Content hash of concept
   * @param criteria - Additional search criteria
   * @returns Promise resolving to matching questions
   */
  getQuestionsForConcept(conceptHash: string, criteria?: QuestionSearchCriteria): Promise<GeneratedQuestion[]>;

  /**
   * Update a question (for corrections or improvements)
   * 
   * @param questionId - ID of question to update
   * @param updates - Question updates
   * @returns Promise resolving when update is complete
   * @throws QuestionManagementError if question not found
   */
  updateQuestion(questionId: string, updates: Partial<GeneratedQuestion>): Promise<void>;

  /**
   * Delete questions for a concept
   * 
   * @param conceptHash - Content hash of concept
   * @returns Promise resolving to number of questions deleted
   */
  deleteQuestionsForConcept(conceptHash: string): Promise<number>;

  /**
   * Get performance analytics for a concept
   * 
   * @param conceptHash - Content hash of concept
   * @returns Promise resolving to analytics data
   */
  getConceptAnalytics(conceptHash: string): Promise<ConceptQuestionAnalytics>;

  /**
   * Check if questions exist for a concept
   * 
   * @param conceptHash - Content hash of concept
   * @returns Promise resolving to true if questions exist
   */
  hasQuestionsForConcept(conceptHash: string): Promise<boolean>;

  /**
   * Get recommended difficulty for next questions based on performance
   * 
   * @param conceptHash - Content hash of concept
   * @returns Promise resolving to recommended difficulty
   */
  getRecommendedDifficulty(conceptHash: string): Promise<QuestionDifficulty>;

  /**
   * Cleanup old or unused questions
   * 
   * @param olderThanDays - Remove questions older than this many days
   * @returns Promise resolving to number of questions cleaned up
   */
  cleanup(olderThanDays: number): Promise<number>;
}

/**
 * Error classes for question management operations
 */
export class QuestionManagementError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QuestionManagementError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QuestionManagementError);
    }
  }

  static withContext(message: string, context: Record<string, unknown>, cause?: Error): QuestionManagementError {
    return new QuestionManagementError(message, cause, context);
  }
}

export class ConceptNotFoundError extends QuestionManagementError {
  constructor(conceptHash: string) {
    super(`Concept not found: ${conceptHash}`);
    this.name = 'ConceptNotFoundError';
  }
}

export class ReviewSessionError extends QuestionManagementError {
  constructor(sessionId: string, message: string) {
    super(`Review session ${sessionId}: ${message}`);
    this.name = 'ReviewSessionError';
  }
}

export class InsufficientQuestionsError extends QuestionManagementError {
  constructor(conceptHash: string, requested: number, available: number) {
    super(`Insufficient questions for concept ${conceptHash}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientQuestionsError';
  }
}