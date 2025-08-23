/**
 * Integration Tests for OpenAI Question Generation Service
 * 
 * These tests verify the question generation service works with the actual OpenAI API.
 * They require a valid OPENAI_API_KEY environment variable to run.
 * 
 * Run with: npm test -- --run src/core/services/impl/OpenAIQuestionGenerationService.integration.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIQuestionGenerationService } from './OpenAIQuestionGenerationService';
import { QuestionGenerationServiceRequest } from '../IQuestionGenerationService';
import { MemoryContentCache } from './MemoryContentCache';
import { loadQuestionGenerationConfig } from '../../config/QuestionGenerationConfig';
import { DistilledContent } from '../../contracts/schemas';

// Skip these tests if no API key is provided
const hasApiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-api-key-here';

describe('OpenAIQuestionGenerationService Integration Tests', () => {
  let service: OpenAIQuestionGenerationService;
  let cache: MemoryContentCache;

  beforeEach(() => {
    if (!hasApiKey) {
      console.log('Skipping integration tests - OPENAI_API_KEY not configured');
      return;
    }

    cache = new MemoryContentCache();
    const config = loadQuestionGenerationConfig();
    service = new OpenAIQuestionGenerationService(config, cache);
  });

  describe('Real OpenAI API Integration', () => {
    it('should generate questions for a computer science concept', async () => {
      if (!hasApiKey) return;

      const concept: DistilledContent = {
        title: 'Binary Search Trees',
        summary: 'A binary search tree (BST) is a hierarchical data structure where each node has at most two children, and for every node, all values in the left subtree are less than the node\'s value, and all values in the right subtree are greater.',
        contentHash: 'bst_example_hash_123',
        cached: false,
        distilledAt: new Date()
      };

      const request: QuestionGenerationServiceRequest = {
        concept,
        count: 4,
        questionTypes: ['flashcard', 'multiple_choice', 'short_answer'],
        targetDifficulty: 'intermediate'
      };

      const result = await service.generateQuestions(request);

      // Validate the result structure
      expect(result).toBeDefined();
      expect(result.questions).toBeInstanceOf(Array);
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeLessThanOrEqual(4);
      expect(result.generatedCount).toBe(result.questions.length);
      expect(result.requestedCount).toBe(4);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.model).toBeDefined();
      expect(result.metadata.tokensUsed).toBeGreaterThan(0);
      expect(result.metadata.processingTimeMs).toBeGreaterThan(0);

      // Validate individual questions
      for (const question of result.questions) {
        expect(question.id).toBeDefined();
        expect(question.type).toMatch(/flashcard|multiple_choice|short_answer/);
        expect(question.difficulty).toMatch(/beginner|intermediate|advanced|review/);
        expect(question.question).toBeDefined();
        expect(question.question.length).toBeGreaterThan(10);
        expect(question.correctAnswer).toBeDefined();
        expect(question.conceptArea).toBeDefined();
        expect(question.sourceContentHash).toBe('bst_example_hash_123');

        // Validate multiple choice questions have distractors
        if (question.type === 'multiple_choice') {
          expect(question.distractors).toBeDefined();
          expect(question.distractors!.length).toBeGreaterThanOrEqual(2);
        }

        // Validate explanations exist
        expect(question.explanation).toBeDefined();
        expect(question.explanation!.length).toBeGreaterThan(20);
      }

      console.log('✅ Generated questions for Binary Search Trees:');
      result.questions.forEach((q, i) => {
        console.log(`${i + 1}. [${q.type}] ${q.question}`);
        console.log(`   Answer: ${q.correctAnswer}`);
        if (q.distractors) {
          console.log(`   Distractors: ${q.distractors.join(', ')}`);
        }
        console.log(`   Explanation: ${q.explanation?.substring(0, 100)}...`);
        console.log('');
      });
    }, 30000); // 30 second timeout for API calls

    it('should adapt difficulty based on spaced repetition performance', async () => {
      if (!hasApiKey) return;

      const concept: DistilledContent = {
        title: 'Quicksort Algorithm',
        summary: 'Quicksort is a divide-and-conquer algorithm that sorts an array by selecting a pivot element and partitioning the other elements into two sub-arrays according to whether they are less than or greater than the pivot.',
        contentHash: 'quicksort_hash_456',
        cached: false,
        distilledAt: new Date()
      };

      // Test with struggling student performance data
      const strugglingRequest: QuestionGenerationServiceRequest = {
        concept,
        count: 2,
        targetDifficulty: 'review',
        performanceContext: {
          easeFactor: 1.4, // Low ease factor indicates difficulty
          repetitions: 6,
          lastResponseQuality: 0, // Forgot
          averageResponseTime: 60000 // 60 seconds - slow response
        },
        additionalContext: 'Student is struggling with this concept and needs review-level questions'
      };

      const strugglingResult = await service.generateQuestions(strugglingRequest);

      expect(strugglingResult.questions).toHaveLength(2);
      expect(strugglingResult.questions.every(q => q.difficulty === 'review')).toBe(true);

      // Test with high-performing student
      const advancedRequest: QuestionGenerationServiceRequest = {
        concept,
        count: 2,
        targetDifficulty: 'advanced',
        performanceContext: {
          easeFactor: 2.8, // High ease factor
          repetitions: 15,
          lastResponseQuality: 3, // Easy
          averageResponseTime: 15000 // 15 seconds - fast response
        },
        additionalContext: 'Student excels at this concept and needs challenging questions'
      };

      const advancedResult = await service.generateQuestions(advancedRequest);

      expect(advancedResult.questions).toHaveLength(2);
      expect(advancedResult.questions.every(q => q.difficulty === 'advanced')).toBe(true);

      console.log('✅ Generated adaptive difficulty questions:');
      console.log('Review level questions:');
      strugglingResult.questions.forEach((q, i) => {
        console.log(`${i + 1}. ${q.question}`);
      });
      console.log('\nAdvanced level questions:');
      advancedResult.questions.forEach((q, i) => {
        console.log(`${i + 1}. ${q.question}`);
      });
    }, 30000);

    it('should generate different question types', async () => {
      if (!hasApiKey) return;

      const concept: DistilledContent = {
        title: 'Hash Tables',
        summary: 'A hash table is a data structure that implements an associative array abstract data type, a structure that can map keys to values using a hash function to compute an index.',
        contentHash: 'hashtable_hash_789',
        cached: false,
        distilledAt: new Date()
      };

      const request: QuestionGenerationServiceRequest = {
        concept,
        count: 5,
        questionTypes: ['flashcard', 'multiple_choice', 'true_false', 'short_answer'],
        targetDifficulty: 'intermediate'
      };

      const result = await service.generateQuestions(request);

      // Check that we got diverse question types
      const questionTypes = result.questions.map(q => q.type);
      const uniqueTypes = new Set(questionTypes);
      
      expect(uniqueTypes.size).toBeGreaterThan(1); // Should have multiple types
      expect(result.questions.some(q => q.type === 'flashcard')).toBe(true);
      expect(result.questions.some(q => ['multiple_choice', 'true_false', 'short_answer'].includes(q.type))).toBe(true);

      console.log('✅ Generated diverse question types:');
      result.questions.forEach((q, i) => {
        console.log(`${i + 1}. [${q.type.toUpperCase()}] ${q.question}`);
      });
    }, 30000);

    it('should use caching to avoid duplicate API calls', async () => {
      if (!hasApiKey) return;

      const concept: DistilledContent = {
        title: 'Depth-First Search',
        summary: 'Depth-first search (DFS) is an algorithm for traversing or searching tree or graph data structures that starts at the root and explores as far as possible along each branch before backtracking.',
        contentHash: 'dfs_hash_cached_test',
        cached: false,
        distilledAt: new Date()
      };

      const request: QuestionGenerationServiceRequest = {
        concept,
        count: 3,
        questionTypes: ['flashcard'],
        targetDifficulty: 'intermediate'
      };

      // First call - should hit the API
      const startTime1 = Date.now();
      const result1 = await service.generateQuestions(request);
      const duration1 = Date.now() - startTime1;

      expect(result1.metadata.cached).toBe(false);
      expect(result1.questions).toHaveLength(3);

      // Second call with identical request - should use cache
      const startTime2 = Date.now();
      const result2 = await service.generateQuestions(request);
      const duration2 = Date.now() - startTime2;

      expect(result2.metadata.cached).toBe(true);
      expect(result2.questions).toHaveLength(3);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster

      console.log('✅ Caching test results:');
      console.log(`First call (API): ${duration1}ms`);
      console.log(`Second call (cache): ${duration2}ms`);
      console.log(`Cache speedup: ${(duration1 / duration2).toFixed(2)}x faster`);
    }, 30000);

    it('should validate generated question quality', async () => {
      if (!hasApiKey) return;

      const concept: DistilledContent = {
        title: 'Merge Sort',
        summary: 'Merge sort is a divide-and-conquer algorithm that divides the input array into two halves, calls itself for the two halves, and then merges the two sorted halves.',
        contentHash: 'mergesort_quality_test',
        cached: false,
        distilledAt: new Date()
      };

      const request: QuestionGenerationServiceRequest = {
        concept,
        count: 3,
        questionTypes: ['multiple_choice', 'short_answer'],
        targetDifficulty: 'intermediate'
      };

      const result = await service.generateQuestions(request);

      // Validate each generated question
      for (const question of result.questions) {
        const validation = await service.validateQuestion(question);
        
        expect(validation.isValid).toBe(true);
        expect(validation.qualityScore).toBeGreaterThan(0.7);
        expect(validation.feedback).toHaveLength(0);

        // Additional quality checks
        expect(question.question.length).toBeGreaterThan(15);
        expect(question.explanation!.length).toBeGreaterThan(30);
        
        if (question.type === 'multiple_choice') {
          expect(question.distractors).toBeDefined();
          expect(question.distractors!.length).toBeGreaterThanOrEqual(2);
        }
      }

      console.log('✅ All generated questions passed quality validation');
    }, 30000);

    it('should recommend appropriate difficulty levels', async () => {
      if (!hasApiKey) return;

      // Test different performance scenarios
      const scenarios = [
        {
          name: 'New Student',
          data: { easeFactor: 2.5, repetitions: 1, successRate: 0.7 },
          expected: 'beginner'
        },
        {
          name: 'High Performer',
          data: { easeFactor: 2.8, repetitions: 12, successRate: 0.92 },
          expected: 'advanced'
        },
        {
          name: 'Struggling Student',
          data: { easeFactor: 1.4, repetitions: 6, successRate: 0.45 },
          expected: 'review'
        },
        {
          name: 'Average Student',
          data: { easeFactor: 2.1, repetitions: 5, successRate: 0.75 },
          expected: 'intermediate'
        }
      ];

      console.log('✅ Difficulty recommendations:');
      scenarios.forEach(scenario => {
        const recommended = service.getRecommendedDifficulty(scenario.data);
        console.log(`${scenario.name}: ${recommended} (expected: ${scenario.expected})`);
        expect(recommended).toBe(scenario.expected);
      });
    });
  });

  describe('Error Handling with Real API', () => {
    it('should handle malformed concepts gracefully', async () => {
      if (!hasApiKey) return;

      const invalidRequest: QuestionGenerationServiceRequest = {
        concept: {
          title: 'x', // Too short
          summary: 'Too short summary', // Too short
          contentHash: 'invalid',
          cached: false,
          distilledAt: new Date()
        }
      };

      await expect(service.generateQuestions(invalidRequest))
        .rejects.toThrow();
    });
  });
});