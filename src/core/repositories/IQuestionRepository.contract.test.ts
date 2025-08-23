/**
 * Contract Tests for IQuestionRepository
 * 
 * These tests define the expected behavior that any implementation of
 * IQuestionRepository must satisfy. They serve as a contract that ensures
 * all implementations behave consistently and correctly.
 * 
 * Run these tests against any IQuestionRepository implementation to verify
 * it meets the interface requirements.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  IQuestionRepository, 
  QuestionSearchCriteria,
  QuestionRepositoryError, 
  QuestionNotFoundError,
  QuestionValidationError 
} from './IQuestionRepository';
import { GeneratedQuestion } from '../contracts/schemas';

/**
 * Contract test suite that any IQuestionRepository implementation must pass
 * 
 * @param createRepository - Factory function that creates a fresh repository instance
 * @param cleanup - Optional cleanup function called after each test
 */
export function runQuestionRepositoryContractTests(
  createRepository: () => Promise<IQuestionRepository> | IQuestionRepository,
  cleanup?: () => Promise<void> | void
) {
  describe('IQuestionRepository Contract Tests', () => {
    let repository: IQuestionRepository;

    // Test data
    const createSampleQuestion = (overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion => ({
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
      },
      ...overrides
    });

    const createMultipleChoiceQuestion = (overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion => createSampleQuestion({
      id: 'q_mc_456',
      type: 'multiple_choice',
      question: 'Which requirement must be met for binary search to work?',
      correctAnswer: 'The array must be sorted',
      distractors: ['The array must be large', 'The array must contain numbers only', 'The array must have even length'],
      confidence: 0.85,
      ...overrides
    });

    const createShortAnswerQuestion = (overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion => createSampleQuestion({
      id: 'q_sa_789',
      type: 'short_answer',
      difficulty: 'advanced',
      question: 'Explain the divide-and-conquer approach used in binary search.',
      correctAnswer: 'Binary search repeatedly divides the search interval in half by comparing the target with the middle element.',
      sourceContentHash: 'concept_hash_456',
      ...overrides
    });

    beforeEach(async () => {
      repository = await createRepository();
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    describe('save()', () => {
      it('should save a valid question successfully', async () => {
        const question = createSampleQuestion();
        
        await expect(repository.save(question)).resolves.not.toThrow();
        
        // Verify the question was saved
        const retrieved = await repository.findById(question.id);
        expect(retrieved).toEqual(question);
      });

      it('should handle saving questions with different types', async () => {
        const flashcard = createSampleQuestion();
        const multipleChoice = createMultipleChoiceQuestion();
        const shortAnswer = createShortAnswerQuestion();

        await repository.save(flashcard);
        await repository.save(multipleChoice);
        await repository.save(shortAnswer);

        expect(await repository.findById(flashcard.id)).toEqual(flashcard);
        expect(await repository.findById(multipleChoice.id)).toEqual(multipleChoice);
        expect(await repository.findById(shortAnswer.id)).toEqual(shortAnswer);
      });

      it('should overwrite existing question when saving with same ID', async () => {
        const originalQuestion = createSampleQuestion();
        const updatedQuestion = { ...originalQuestion, question: 'Updated question text' };

        await repository.save(originalQuestion);
        await repository.save(updatedQuestion);

        const retrieved = await repository.findById(originalQuestion.id);
        expect(retrieved?.question).toBe('Updated question text');
      });
    });

    describe('saveBatch()', () => {
      it('should save multiple questions in batch', async () => {
        const questions = [
          createSampleQuestion(),
          createMultipleChoiceQuestion(),
          createShortAnswerQuestion()
        ];

        await repository.saveBatch(questions);

        for (const question of questions) {
          const retrieved = await repository.findById(question.id);
          expect(retrieved).toEqual(question);
        }
      });

      it('should handle empty batch gracefully', async () => {
        await expect(repository.saveBatch([])).resolves.not.toThrow();
      });

      it('should be atomic - all or nothing on failure', async () => {
        const validQuestion = createSampleQuestion();
        const invalidQuestion = { ...createSampleQuestion(), id: '' }; // Invalid ID

        await expect(repository.saveBatch([validQuestion, invalidQuestion as any]))
          .rejects.toThrow();

        // Neither question should be saved if batch fails
        const retrieved = await repository.findById(validQuestion.id);
        expect(retrieved).toBeNull();
      });
    });

    describe('findById()', () => {
      it('should return question when it exists', async () => {
        const question = createSampleQuestion();
        await repository.save(question);

        const retrieved = await repository.findById(question.id);
        expect(retrieved).toEqual(question);
      });

      it('should return null when question does not exist', async () => {
        const retrieved = await repository.findById('non_existent_id');
        expect(retrieved).toBeNull();
      });

      it('should handle special characters in question ID', async () => {
        const question = createSampleQuestion({ id: 'q_special-chars_123!@#' });
        await repository.save(question);

        const retrieved = await repository.findById(question.id);
        expect(retrieved).toEqual(question);
      });
    });

    describe('findByConceptHash()', () => {
      it('should return all questions for a concept', async () => {
        const conceptHash = 'shared_concept_hash';
        const questions = [
          createSampleQuestion({ sourceContentHash: conceptHash }),
          createMultipleChoiceQuestion({ sourceContentHash: conceptHash }),
          createShortAnswerQuestion({ sourceContentHash: conceptHash })
        ];

        for (const question of questions) {
          await repository.save(question);
        }

        const retrieved = await repository.findByConceptHash(conceptHash);
        expect(retrieved).toHaveLength(3);
        
        // Should contain all saved questions
        const retrievedIds = retrieved.map(q => q.id).sort();
        const expectedIds = questions.map(q => q.id).sort();
        expect(retrievedIds).toEqual(expectedIds);
      });

      it('should return empty array when no questions exist for concept', async () => {
        const retrieved = await repository.findByConceptHash('non_existent_hash');
        expect(retrieved).toEqual([]);
      });

      it('should not return questions from other concepts', async () => {
        const concept1Hash = 'concept_1';
        const concept2Hash = 'concept_2';
        
        await repository.save(createSampleQuestion({ sourceContentHash: concept1Hash }));
        await repository.save(createSampleQuestion({ 
          id: 'different_id',
          sourceContentHash: concept2Hash 
        }));

        const concept1Questions = await repository.findByConceptHash(concept1Hash);
        const concept2Questions = await repository.findByConceptHash(concept2Hash);

        expect(concept1Questions).toHaveLength(1);
        expect(concept2Questions).toHaveLength(1);
        expect(concept1Questions[0].sourceContentHash).toBe(concept1Hash);
        expect(concept2Questions[0].sourceContentHash).toBe(concept2Hash);
      });
    });

    describe('search()', () => {
      beforeEach(async () => {
        // Set up test data
        const questions = [
          createSampleQuestion({
            id: 'q1',
            type: 'flashcard',
            difficulty: 'beginner',
            sourceContentHash: 'concept_a',
            conceptArea: 'Algorithms',
            tags: ['basic', 'sorting']
          }),
          createSampleQuestion({
            id: 'q2',
            type: 'multiple_choice',
            difficulty: 'intermediate',
            sourceContentHash: 'concept_a',
            conceptArea: 'Algorithms',
            tags: ['advanced', 'trees']
          }),
          createSampleQuestion({
            id: 'q3',
            type: 'short_answer',
            difficulty: 'advanced',
            sourceContentHash: 'concept_b',
            conceptArea: 'Data Structures',
            tags: ['advanced', 'graphs']
          })
        ];

        await repository.saveBatch(questions);
      });

      it('should filter by concept hash', async () => {
        const criteria: QuestionSearchCriteria = { conceptHash: 'concept_a' };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(2);
        expect(results.every(q => q.sourceContentHash === 'concept_a')).toBe(true);
      });

      it('should filter by question types', async () => {
        const criteria: QuestionSearchCriteria = { questionTypes: ['flashcard', 'short_answer'] };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(2);
        expect(results.every(q => ['flashcard', 'short_answer'].includes(q.type))).toBe(true);
      });

      it('should filter by difficulties', async () => {
        const criteria: QuestionSearchCriteria = { difficulties: ['beginner', 'advanced'] };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(2);
        expect(results.every(q => ['beginner', 'advanced'].includes(q.difficulty))).toBe(true);
      });

      it('should filter by concept area', async () => {
        const criteria: QuestionSearchCriteria = { conceptArea: 'Algorithms' };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(2);
        expect(results.every(q => q.conceptArea === 'Algorithms')).toBe(true);
      });

      it('should filter by tags', async () => {
        const criteria: QuestionSearchCriteria = { tags: ['advanced'] };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(2);
        expect(results.every(q => q.tags?.includes('advanced'))).toBe(true);
      });

      it('should support limit and offset for pagination', async () => {
        const page1 = await repository.search({ limit: 2 });
        const page2 = await repository.search({ limit: 2, offset: 2 });
        
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(1);
        
        // Should not have overlapping results
        const page1Ids = page1.map(q => q.id);
        const page2Ids = page2.map(q => q.id);
        expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
      });

      it('should combine multiple criteria', async () => {
        const criteria: QuestionSearchCriteria = {
          conceptHash: 'concept_a',
          questionTypes: ['flashcard'],
          difficulties: ['beginner']
        };
        const results = await repository.search(criteria);
        
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('q1');
      });

      it('should return empty array when no matches found', async () => {
        const criteria: QuestionSearchCriteria = { conceptHash: 'non_existent' };
        const results = await repository.search(criteria);
        
        expect(results).toEqual([]);
      });
    });

    describe('update()', () => {
      it('should update existing question successfully', async () => {
        const question = createSampleQuestion();
        await repository.save(question);

        const updates = { question: 'Updated question text', difficulty: 'advanced' as const };
        await repository.update(question.id, updates);

        const retrieved = await repository.findById(question.id);
        expect(retrieved?.question).toBe('Updated question text');
        expect(retrieved?.difficulty).toBe('advanced');
        expect(retrieved?.correctAnswer).toBe(question.correctAnswer); // Unchanged
      });

      it('should throw QuestionNotFoundError when question does not exist', async () => {
        await expect(repository.update('non_existent_id', { question: 'New text' }))
          .rejects.toThrow(QuestionNotFoundError);
      });
    });

    describe('delete()', () => {
      it('should delete existing question successfully', async () => {
        const question = createSampleQuestion();
        await repository.save(question);

        await repository.delete(question.id);

        const retrieved = await repository.findById(question.id);
        expect(retrieved).toBeNull();
      });

      it('should not throw when deleting non-existent question', async () => {
        await expect(repository.delete('non_existent_id')).resolves.not.toThrow();
      });
    });

    describe('deleteByConceptHash()', () => {
      it('should delete all questions for concept and return count', async () => {
        const conceptHash = 'concept_to_delete';
        const questions = [
          createSampleQuestion({ sourceContentHash: conceptHash }),
          createMultipleChoiceQuestion({ sourceContentHash: conceptHash }),
          createShortAnswerQuestion({ sourceContentHash: 'other_concept' })
        ];

        for (const question of questions) {
          await repository.save(question);
        }

        const deletedCount = await repository.deleteByConceptHash(conceptHash);
        expect(deletedCount).toBe(2);

        // Verify deletion
        const remaining = await repository.findByConceptHash(conceptHash);
        expect(remaining).toHaveLength(0);

        // Other concept should remain
        const otherRemaining = await repository.findByConceptHash('other_concept');
        expect(otherRemaining).toHaveLength(1);
      });

      it('should return 0 when no questions exist for concept', async () => {
        const deletedCount = await repository.deleteByConceptHash('non_existent');
        expect(deletedCount).toBe(0);
      });
    });

    describe('hasQuestionsForConcept()', () => {
      it('should return true when questions exist for concept', async () => {
        const conceptHash = 'concept_with_questions';
        await repository.save(createSampleQuestion({ sourceContentHash: conceptHash }));

        const hasQuestions = await repository.hasQuestionsForConcept(conceptHash);
        expect(hasQuestions).toBe(true);
      });

      it('should return false when no questions exist for concept', async () => {
        const hasQuestions = await repository.hasQuestionsForConcept('empty_concept');
        expect(hasQuestions).toBe(false);
      });
    });

    describe('getStorageMetadata()', () => {
      it('should return correct metadata for concept with questions', async () => {
        const conceptHash = 'metadata_concept';
        const questions = [
          createSampleQuestion({ 
            sourceContentHash: conceptHash,
            type: 'flashcard',
            difficulty: 'beginner',
            metadata: { ...createSampleQuestion().metadata!, generatedAt: new Date('2023-01-01') }
          }),
          createMultipleChoiceQuestion({ 
            sourceContentHash: conceptHash,
            difficulty: 'intermediate',
            metadata: { ...createSampleQuestion().metadata!, generatedAt: new Date('2023-01-02') }
          })
        ];

        await repository.saveBatch(questions);

        const metadata = await repository.getStorageMetadata(conceptHash);
        
        expect(metadata.totalCount).toBe(2);
        expect(metadata.typeDistribution.flashcard).toBe(1);
        expect(metadata.typeDistribution.multiple_choice).toBe(1);
        expect(metadata.difficultyDistribution.beginner).toBe(1);
        expect(metadata.difficultyDistribution.intermediate).toBe(1);
        expect(metadata.firstCreated).toEqual(new Date('2023-01-01'));
        expect(metadata.lastCreated).toEqual(new Date('2023-01-02'));
        expect(metadata.storageSizeBytes).toBeGreaterThan(0);
      });
    });

    describe('getTotalQuestionCount()', () => {
      it('should return correct total count', async () => {
        const questions = [
          createSampleQuestion(),
          createMultipleChoiceQuestion(),
          createShortAnswerQuestion()
        ];

        await repository.saveBatch(questions);

        const totalCount = await repository.getTotalQuestionCount();
        expect(totalCount).toBe(3);
      });

      it('should return 0 when no questions exist', async () => {
        const totalCount = await repository.getTotalQuestionCount();
        expect(totalCount).toBe(0);
      });
    });

    describe('getQuestionsForReview()', () => {
      it('should return questions for review', async () => {
        const conceptHash = 'review_concept';
        await repository.save(createSampleQuestion({ sourceContentHash: conceptHash }));

        const reviewQuestions = await repository.getQuestionsForReview(conceptHash);
        expect(reviewQuestions).toHaveLength(1);
      });

      it('should respect max questions limit', async () => {
        const conceptHash = 'review_concept_limited';
        const questions = [
          createSampleQuestion({ sourceContentHash: conceptHash }),
          createMultipleChoiceQuestion({ sourceContentHash: conceptHash }),
          createShortAnswerQuestion({ sourceContentHash: conceptHash })
        ];

        await repository.saveBatch(questions);

        const reviewQuestions = await repository.getQuestionsForReview(conceptHash, 2);
        expect(reviewQuestions).toHaveLength(2);
      });
    });

    describe('cleanup()', () => {
      it('should clean up old questions and return count', async () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

        const oldQuestion = createSampleQuestion({
          metadata: {
            ...createSampleQuestion().metadata!,
            generatedAt: oldDate
          }
        });
        const newQuestion = createMultipleChoiceQuestion({
          metadata: {
            ...createSampleQuestion().metadata!,
            generatedAt: new Date() // Recent date
          }
        }); // Recent

        await repository.save(oldQuestion);
        await repository.save(newQuestion);

        const cleanedCount = await repository.cleanup(5); // Clean questions older than 5 days
        expect(cleanedCount).toBe(1);

        // Verify cleanup
        expect(await repository.findById(oldQuestion.id)).toBeNull();
        expect(await repository.findById(newQuestion.id)).not.toBeNull();
      });
    });

    describe('error handling', () => {
      it('should throw appropriate errors for invalid operations', async () => {
        // This test ensures implementations throw proper error types
        // Specific error scenarios depend on the implementation
        await expect(repository.update('invalid_id', {}))
          .rejects.toThrow(Error);
      });
    });
  });
}