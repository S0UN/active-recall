/**
 * Tests for QuestionManagementService
 * 
 * Comprehensive test suite for the question management service that orchestrates
 * question generation, storage, and review session management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionManagementService } from './QuestionManagementService';
import { 
  IQuestionGenerationService, 
  QuestionGenerationServiceRequest,
  QuestionGenerationResult
} from '../IQuestionGenerationService';
import { IQuestionRepository } from '../../repositories/IQuestionRepository';
import { IReviewSchedulerService } from '../../spaced-repetition/services/IReviewSchedulerService';
import { 
  GeneratedQuestion, 
  DistilledContent,
  QuestionResponse
} from '../../contracts/schemas';
import {
  QuestionManagementError,
  ConceptNotFoundError,
  InsufficientQuestionsError
} from '../IQuestionManagementService';

// Mock implementations
class MockQuestionGenerationService implements IQuestionGenerationService {
  generateQuestions = vi.fn();
  generateQuestionsForConcepts = vi.fn();
  validateQuestion = vi.fn();
  getRecommendedDifficulty = vi.fn();
  getProvider = vi.fn().mockReturnValue('mock');
  getRequestCount = vi.fn().mockReturnValue(0);
  resetDailyCounter = vi.fn();
}

class MockQuestionRepository implements IQuestionRepository {
  save = vi.fn();
  saveBatch = vi.fn();
  findById = vi.fn();
  findByConceptHash = vi.fn();
  search = vi.fn();
  getQuestionsForReview = vi.fn();
  update = vi.fn();
  delete = vi.fn();
  deleteByConceptHash = vi.fn();
  hasQuestionsForConcept = vi.fn();
  getStorageMetadata = vi.fn();
  getTotalQuestionCount = vi.fn();
  cleanup = vi.fn();
}

class MockReviewSchedulerService implements IReviewSchedulerService {
  recordReview = vi.fn();
  getConceptsForReview = vi.fn();
  scheduleNewConcept = vi.fn();
  getReviewSchedule = vi.fn();
  updateReviewSchedule = vi.fn();
  deleteReviewSchedule = vi.fn();
  getScheduleStatistics = vi.fn();
  getTotalScheduleCount = vi.fn();
}

describe('QuestionManagementService', () => {
  let service: QuestionManagementService;
  let mockQuestionGenerator: MockQuestionGenerationService;
  let mockQuestionRepository: MockQuestionRepository;
  let mockReviewScheduler: MockReviewSchedulerService;

  // Test data
  const sampleConcept: DistilledContent = {
    title: 'Binary Search Algorithm',
    summary: 'A search algorithm that finds the position of a target value within a sorted array by repeatedly dividing the search interval in half.',
    contentHash: 'concept_hash_123',
    cached: false,
    distilledAt: new Date('2023-01-01T00:00:00Z')
  };

  const sampleQuestion: GeneratedQuestion = {
    id: 'q_sample_123',
    type: 'flashcard',
    difficulty: 'intermediate',
    question: 'What is the time complexity of binary search?',
    correctAnswer: 'O(log n)',
    explanation: 'Binary search divides the search space in half with each iteration.',
    conceptArea: 'Binary Search Algorithm',
    sourceContentHash: 'concept_hash_123',
    confidence: 0.9,
    estimatedTimeSeconds: 30,
    tags: ['algorithms', 'complexity'],
    metadata: {
      generatedAt: new Date('2023-01-01T00:00:00Z'),
      model: 'gpt-3.5-turbo',
      promptVersion: 'v1.0',
      tokensUsed: 150
    }
  };

  const sampleQuestionResponse: QuestionResponse = {
    questionId: 'q_sample_123',
    correct: true,
    responseTime: 25,
    userAnswer: 'O(log n)',
    submittedAt: new Date()
  };

  beforeEach(() => {
    mockQuestionGenerator = new MockQuestionGenerationService();
    mockQuestionRepository = new MockQuestionRepository();
    mockReviewScheduler = new MockReviewSchedulerService();
    
    service = new QuestionManagementService(
      mockQuestionGenerator,
      mockQuestionRepository,
      mockReviewScheduler
    );

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('generateQuestionsForConcept()', () => {
    it('should return existing questions when available and not forcing regeneration', async () => {
      const existingQuestions = [sampleQuestion];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(existingQuestions);

      const request = {
        concept: sampleConcept,
        questionCount: 3
      };

      const result = await service.generateQuestionsForConcept(request);

      expect(result.fromCache).toBe(true);
      expect(result.questions).toEqual(existingQuestions);
      expect(result.conceptHash).toBe(sampleConcept.contentHash);
      expect(mockQuestionGenerator.generateQuestions).not.toHaveBeenCalled();
    });

    it('should generate new questions when none exist', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([]);
      
      const generationResult: QuestionGenerationResult = {
        questions: [sampleQuestion],
        requestedCount: 3,
        generatedCount: 1,
        qualityScore: 0.9,
        metadata: {
          processingTimeMs: 1500,
          model: 'gpt-3.5-turbo',
          tokensUsed: 150,
          promptVersion: 'v1.0',
          cached: false
        }
      };
      
      mockQuestionGenerator.generateQuestions.mockResolvedValue(generationResult);
      mockQuestionRepository.saveBatch.mockResolvedValue(void 0);

      const request = {
        concept: sampleConcept,
        questionCount: 3,
        questionTypes: ['flashcard', 'multiple_choice'] as const
      };

      const result = await service.generateQuestionsForConcept(request);

      expect(result.fromCache).toBe(false);
      expect(result.questions).toEqual([sampleQuestion]);
      expect(result.generatedCount).toBe(1);
      expect(mockQuestionGenerator.generateQuestions).toHaveBeenCalledWith({
        concept: sampleConcept,
        count: 3,
        questionTypes: ['flashcard', 'multiple_choice'],
        targetDifficulty: 'intermediate',
        additionalContext: undefined
      });
      expect(mockQuestionRepository.saveBatch).toHaveBeenCalledWith([sampleQuestion]);
    });

    it('should force regeneration when requested', async () => {
      const existingQuestions = [sampleQuestion];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(existingQuestions);
      
      const generationResult: QuestionGenerationResult = {
        questions: [{ ...sampleQuestion, id: 'q_new_456' }],
        requestedCount: 2,
        generatedCount: 1,
        qualityScore: 0.95,
        metadata: {
          processingTimeMs: 2000,
          model: 'gpt-4',
          tokensUsed: 200,
          promptVersion: 'v1.0',
          cached: false
        }
      };
      
      mockQuestionGenerator.generateQuestions.mockResolvedValue(generationResult);
      mockQuestionRepository.saveBatch.mockResolvedValue(void 0);

      const request = {
        concept: sampleConcept,
        questionCount: 2,
        forceRegenerate: true
      };

      const result = await service.generateQuestionsForConcept(request);

      expect(result.fromCache).toBe(false);
      expect(mockQuestionGenerator.generateQuestions).toHaveBeenCalled();
      expect(mockQuestionRepository.saveBatch).toHaveBeenCalled();
    });

    it('should handle generation errors gracefully', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([]);
      mockQuestionGenerator.generateQuestions.mockRejectedValue(new Error('Generation failed'));

      const request = { concept: sampleConcept };

      await expect(service.generateQuestionsForConcept(request))
        .rejects.toThrow(QuestionManagementError);
    });
  });

  describe('createReviewSession()', () => {
    it('should create a review session successfully', async () => {
      const questions = [
        sampleQuestion,
        { ...sampleQuestion, id: 'q_2', type: 'multiple_choice' as const }
      ];
      
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const request = {
        conceptHash: 'concept_hash_123',
        maxQuestions: 2
      };

      const result = await service.createReviewSession(request);

      expect(result.sessionId).toBeDefined();
      expect(result.conceptHash).toBe('concept_hash_123');
      expect(result.questions).toHaveLength(2);
      expect(result.metadata.maxQuestions).toBe(2);
      expect(result.metadata.sessionType).toBe('review');
    });

    it('should filter questions by preferred types', async () => {
      const questions = [
        { ...sampleQuestion, type: 'flashcard' as const },
        { ...sampleQuestion, id: 'q_2', type: 'multiple_choice' as const },
        { ...sampleQuestion, id: 'q_3', type: 'short_answer' as const }
      ];
      
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const request = {
        conceptHash: 'concept_hash_123',
        preferredTypes: ['flashcard', 'multiple_choice'] as const
      };

      const result = await service.createReviewSession(request);

      expect(result.questions).toHaveLength(2);
      expect(result.questions.every(q => ['flashcard', 'multiple_choice'].includes(q.type))).toBe(true);
    });

    it('should filter questions by target difficulty', async () => {
      const questions = [
        { ...sampleQuestion, difficulty: 'beginner' as const },
        { ...sampleQuestion, id: 'q_2', difficulty: 'intermediate' as const },
        { ...sampleQuestion, id: 'q_3', difficulty: 'advanced' as const }
      ];
      
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const request = {
        conceptHash: 'concept_hash_123',
        targetDifficulty: 'intermediate' as const
      };

      const result = await service.createReviewSession(request);

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].difficulty).toBe('intermediate');
    });

    it('should throw error when no questions are available', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([]);

      const request = { conceptHash: 'empty_concept' };

      await expect(service.createReviewSession(request))
        .rejects.toThrow(InsufficientQuestionsError);
    });

    it('should limit questions to max requested', async () => {
      const questions = Array.from({ length: 10 }, (_, i) => ({
        ...sampleQuestion,
        id: `q_${i}`
      }));
      
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const request = {
        conceptHash: 'concept_hash_123',
        maxQuestions: 3
      };

      const result = await service.createReviewSession(request);

      expect(result.questions).toHaveLength(3);
      expect(result.metadata.maxQuestions).toBe(3);
    });
  });

  describe('recordSessionResponses()', () => {
    it('should record session responses successfully', async () => {
      // First create a session
      const questions = [sampleQuestion];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);
      
      const session = await service.createReviewSession({
        conceptHash: 'concept_hash_123'
      });

      const responses = [sampleQuestionResponse];
      mockReviewScheduler.recordReview.mockResolvedValue(void 0);

      await service.recordSessionResponses(session.sessionId, responses);

      expect(mockReviewScheduler.recordReview).toHaveBeenCalledWith('concept_hash_123', 5);
    });

    it('should handle invalid session ID', async () => {
      const responses = [sampleQuestionResponse];

      await expect(service.recordSessionResponses('invalid_session', responses))
        .rejects.toThrow('Session not found or expired');
    });

    it('should validate responses match session questions', async () => {
      // Create a session
      const questions = [sampleQuestion];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);
      
      const session = await service.createReviewSession({
        conceptHash: 'concept_hash_123'
      });

      const invalidResponse = {
        ...sampleQuestionResponse,
        questionId: 'invalid_question_id'
      };

      await expect(service.recordSessionResponses(session.sessionId, [invalidResponse]))
        .rejects.toThrow(QuestionManagementError);
    });

    it('should calculate correct quality score based on performance', async () => {
      const questions = [sampleQuestion, { ...sampleQuestion, id: 'q_2' }];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);
      
      const session = await service.createReviewSession({
        conceptHash: 'concept_hash_123'
      });

      const responses = [
        { ...sampleQuestionResponse, correct: true },
        { ...sampleQuestionResponse, questionId: 'q_2', correct: false }
      ];
      
      mockReviewScheduler.recordReview.mockResolvedValue(void 0);

      await service.recordSessionResponses(session.sessionId, responses);

      // 50% success rate should map to quality 2
      expect(mockReviewScheduler.recordReview).toHaveBeenCalledWith('concept_hash_123', 2);
    });
  });

  describe('getQuestionsForConcept()', () => {
    it('should retrieve questions without criteria', async () => {
      const questions = [sampleQuestion];
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const result = await service.getQuestionsForConcept('concept_hash_123');

      expect(result).toEqual(questions);
      expect(mockQuestionRepository.findByConceptHash).toHaveBeenCalledWith('concept_hash_123');
    });

    it('should retrieve questions with search criteria', async () => {
      const questions = [sampleQuestion];
      mockQuestionRepository.search.mockResolvedValue(questions);

      const criteria = {
        questionTypes: ['flashcard'] as const,
        limit: 5
      };

      const result = await service.getQuestionsForConcept('concept_hash_123', criteria);

      expect(result).toEqual(questions);
      expect(mockQuestionRepository.search).toHaveBeenCalledWith({
        conceptHash: 'concept_hash_123',
        ...criteria
      });
    });
  });

  describe('updateQuestion()', () => {
    it('should update a question successfully', async () => {
      mockQuestionRepository.update.mockResolvedValue(void 0);

      const updates = { question: 'Updated question text' };
      await service.updateQuestion('q_sample_123', updates);

      expect(mockQuestionRepository.update).toHaveBeenCalledWith('q_sample_123', updates);
    });

    it('should handle update errors', async () => {
      mockQuestionRepository.update.mockRejectedValue(new Error('Update failed'));

      await expect(service.updateQuestion('q_sample_123', {}))
        .rejects.toThrow(QuestionManagementError);
    });
  });

  describe('deleteQuestionsForConcept()', () => {
    it('should delete questions for concept', async () => {
      mockQuestionRepository.deleteByConceptHash.mockResolvedValue(3);

      const result = await service.deleteQuestionsForConcept('concept_hash_123');

      expect(result).toBe(3);
      expect(mockQuestionRepository.deleteByConceptHash).toHaveBeenCalledWith('concept_hash_123');
    });
  });

  describe('getConceptAnalytics()', () => {
    it('should return comprehensive analytics', async () => {
      const metadata = {
        totalCount: 5,
        typeDistribution: {
          flashcard: 2,
          multiple_choice: 2,
          true_false: 0,
          short_answer: 1,
          matching: 0,
          fill_in_blank: 0
        },
        difficultyDistribution: {
          review: 0,
          beginner: 2,
          intermediate: 2,
          advanced: 1
        },
        firstCreated: new Date('2023-01-01'),
        lastCreated: new Date('2023-01-02'),
        storageSizeBytes: 1024
      };

      const questions = [sampleQuestion];
      
      mockQuestionRepository.getStorageMetadata.mockResolvedValue(metadata);
      mockQuestionRepository.findByConceptHash.mockResolvedValue(questions);

      const result = await service.getConceptAnalytics('concept_hash_123');

      expect(result.conceptHash).toBe('concept_hash_123');
      expect(result.totalQuestions).toBe(5);
      expect(result.questionTypeDistribution).toEqual(metadata.typeDistribution);
      expect(result.difficultyDistribution).toEqual(metadata.difficultyDistribution);
      expect(result.performance).toBeDefined();
      expect(result.quality).toBeDefined();
    });
  });

  describe('hasQuestionsForConcept()', () => {
    it('should check if questions exist for concept', async () => {
      mockQuestionRepository.hasQuestionsForConcept.mockResolvedValue(true);

      const result = await service.hasQuestionsForConcept('concept_hash_123');

      expect(result).toBe(true);
      expect(mockQuestionRepository.hasQuestionsForConcept).toHaveBeenCalledWith('concept_hash_123');
    });
  });

  describe('getRecommendedDifficulty()', () => {
    it('should return beginner for concepts with no questions', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([]);

      const result = await service.getRecommendedDifficulty('empty_concept');

      expect(result).toBe('beginner');
    });

    it('should return intermediate for concepts with existing questions', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([sampleQuestion]);

      const result = await service.getRecommendedDifficulty('concept_hash_123');

      expect(result).toBe('intermediate');
    });
  });

  describe('cleanup()', () => {
    it('should clean up old questions', async () => {
      mockQuestionRepository.cleanup.mockResolvedValue(10);

      const result = await service.cleanup(30);

      expect(result).toBe(10);
      expect(mockQuestionRepository.cleanup).toHaveBeenCalledWith(30);
    });
  });

  describe('error handling', () => {
    it('should wrap repository errors appropriately', async () => {
      mockQuestionRepository.findByConceptHash.mockRejectedValue(new Error('Database error'));

      await expect(service.getQuestionsForConcept('concept_hash_123'))
        .rejects.toThrow(QuestionManagementError);
    });

    it('should preserve specific error types where appropriate', async () => {
      mockQuestionRepository.findByConceptHash.mockResolvedValue([]);

      await expect(service.createReviewSession({ conceptHash: 'empty_concept' }))
        .rejects.toThrow(InsufficientQuestionsError);
    });
  });
});