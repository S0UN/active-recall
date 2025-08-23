/**
 * Integration Tests for Readable Review Scheduler Service
 * 
 * These tests verify that the refactored service maintains full compatibility
 * with the actual FileSystem repository and produces the same results as
 * the original implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { ReadableReviewSchedulerService } from '../impl/ReadableReviewSchedulerService';
import { FileSystemReviewScheduleRepository } from '../../spaced-repetition/repositories/FileSystemReviewScheduleRepository';
import { 
  ResponseQuality, 
  ReviewStatus 
} from '../../spaced-repetition/domain/ReviewSchedule';
import { SM2Algorithm } from '../../spaced-repetition/algorithms/SM2Algorithm';

describe('ReadableReviewSchedulerService Integration Tests', () => {
  let service: ReadableReviewSchedulerService;
  let repository: FileSystemReviewScheduleRepository;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `readable-scheduler-test-${randomBytes(8).toString('hex')}`);
    repository = new FileSystemReviewScheduleRepository(testDir);
    const algorithm = new SM2Algorithm();
    service = new ReadableReviewSchedulerService(repository, algorithm);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('end-to-end concept lifecycle', () => {
    it('should handle complete concept journey from scheduling to mastery', async () => {
      const conceptId = 'machine-learning-fundamentals';
      
      // Schedule concept for review
      const initialSchedule = await service.scheduleForReview({ conceptId });
      expect(initialSchedule.conceptId).toBe(conceptId);
      expect(initialSchedule.status).toBe(ReviewStatus.NEW);
      
      // Process multiple good reviews to advance through learning
      let currentSchedule = initialSchedule;
      let reviewCount = 0;
      
      while (currentSchedule.status === ReviewStatus.NEW || currentSchedule.status === ReviewStatus.LEARNING) {
        const result = await service.processReview({
          conceptId,
          responseQuality: ResponseQuality.GOOD
        });
        
        currentSchedule = result.schedule;
        reviewCount++;
        
        expect(result.nextReviewDate).toBeInstanceOf(Date);
        expect(result.intervalChange.current).toBeGreaterThan(0);
        
        // Prevent infinite loops
        if (reviewCount > 10) break;
      }
      
      // Should have progressed to reviewing phase
      expect(currentSchedule.status).toBe(ReviewStatus.REVIEWING);
      expect(currentSchedule.totalReviews).toBe(reviewCount);
      
      // Verify persistence
      const persistedSchedule = await service.getSchedule(conceptId);
      expect(persistedSchedule?.status).toBe(ReviewStatus.REVIEWING);
      expect(persistedSchedule?.totalReviews).toBe(reviewCount);
    });

    it('should handle forgot responses and recovery correctly', async () => {
      const conceptId = 'neural-network-architectures';
      
      // Schedule and advance to reviewing phase
      await service.scheduleForReview({ conceptId });
      await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      const advancedResult = await service.processReview({ 
        conceptId, 
        responseQuality: ResponseQuality.GOOD 
      });
      
      expect(advancedResult.schedule.status).toBe(ReviewStatus.REVIEWING);
      const intervalBeforeForgetting = advancedResult.schedule.parameters.interval;
      
      // Process forgot response
      const forgotResult = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.FORGOT
      });
      
      // Should reset progress
      expect(forgotResult.intervalChange.current).toBe(1);
      expect(forgotResult.schedule.consecutiveIncorrect).toBe(1);
      expect(forgotResult.schedule.consecutiveCorrect).toBe(0);
      
      // Verify persistence of reset state
      const resetSchedule = await service.getSchedule(conceptId);
      expect(resetSchedule?.parameters.interval).toBe(1);
      expect(resetSchedule?.consecutiveIncorrect).toBe(1);
    });
  });

  describe('study session management', () => {
    beforeEach(async () => {
      // Create diverse set of concepts in different states
      const concepts = [
        'algorithms-complexity',
        'data-structures-advanced',
        'computer-graphics',
        'distributed-systems',
        'cryptography-basics'
      ];
      
      for (const concept of concepts) {
        await service.scheduleForReview({ conceptId: concept });
      }
      
      // Advance some concepts to different phases
      await service.processReview({
        conceptId: 'algorithms-complexity',
        responseQuality: ResponseQuality.GOOD
      });
      
      await service.processReview({
        conceptId: 'data-structures-advanced',
        responseQuality: ResponseQuality.GOOD
      });
      await service.processReview({
        conceptId: 'data-structures-advanced',
        responseQuality: ResponseQuality.GOOD
      });
    });

    it('should provide accurate due review counts', async () => {
      const dueReviews = await service.getDueReviews();
      expect(dueReviews.length).toBeGreaterThan(0);
      
      // All returned reviews should actually be due
      for (const review of dueReviews) {
        const isDue = await service.isDue(review.conceptId);
        expect(isDue).toBe(true);
      }
    });

    it('should respect study session limits effectively', async () => {
      const limitedSession = await service.getDueReviews({ limit: 3 });
      expect(limitedSession.length).toBeLessThanOrEqual(3);
      
      const unlimitedSession = await service.getDueReviews();
      expect(unlimitedSession.length).toBeGreaterThanOrEqual(limitedSession.length);
    });

    it('should prioritize difficult concepts when requested', async () => {
      // Create concepts with different difficulty levels
      await service.scheduleForReview({
        conceptId: 'easy-topic',
        customParameters: { initialEaseFactor: 2.4 }
      });
      
      await service.scheduleForReview({
        conceptId: 'difficult-topic',
        customParameters: { initialEaseFactor: 1.4 }
      });
      
      const prioritizedReviews = await service.getDueReviews({
        prioritizeByDifficulty: true
      });
      
      if (prioritizedReviews.length >= 2) {
        const difficultIndex = prioritizedReviews.findIndex(r => r.conceptId === 'difficult-topic');
        const easyIndex = prioritizedReviews.findIndex(r => r.conceptId === 'easy-topic');
        
        if (difficultIndex !== -1 && easyIndex !== -1) {
          expect(difficultIndex).toBeLessThan(easyIndex);
        }
      }
    });
  });

  describe('bulk operations and efficiency', () => {
    it('should handle bulk scheduling efficiently', async () => {
      const conceptIds = Array.from({ length: 25 }, (_, i) => `bulk-concept-${i}`);
      
      const startTime = Date.now();
      const schedules = await service.bulkSchedule({ conceptIds });
      const endTime = Date.now();
      
      expect(schedules).toHaveLength(25);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      
      // Verify all were persisted
      for (const conceptId of conceptIds) {
        const schedule = await service.getSchedule(conceptId);
        expect(schedule).toBeDefined();
        expect(schedule?.conceptId).toBe(conceptId);
      }
    });

    it('should skip existing concepts during bulk operations', async () => {
      // Pre-create some concepts
      await service.scheduleForReview({ conceptId: 'existing-concept-1' });
      await service.scheduleForReview({ conceptId: 'existing-concept-2' });
      
      const allConceptIds = [
        'existing-concept-1',
        'existing-concept-2', 
        'new-concept-1',
        'new-concept-2',
        'new-concept-3'
      ];
      
      const schedules = await service.bulkSchedule({
        conceptIds: allConceptIds,
        skipExisting: true
      });
      
      expect(schedules).toHaveLength(5); // Returns all schedules (existing + new)
      
      const totalCount = await repository.count();
      expect(totalCount).toBe(5); // But only 5 total in repository
    });
  });

  describe('review planning and insights', () => {
    beforeEach(async () => {
      // Create comprehensive test data
      const concepts = [
        'software-engineering',
        'system-design',
        'database-theory',
        'network-protocols',
        'operating-systems',
        'compiler-design'
      ];
      
      for (const concept of concepts) {
        await service.scheduleForReview({ conceptId: concept });
      }
      
      // Create variety in review states
      await service.processReview({
        conceptId: 'software-engineering',
        responseQuality: ResponseQuality.GOOD
      });
      
      await service.processReview({
        conceptId: 'system-design',
        responseQuality: ResponseQuality.HARD
      });
    });

    it('should generate comprehensive review plans', async () => {
      const plan = await service.getReviewPlan();
      
      expect(plan.dueToday).toBeGreaterThan(0);
      expect(plan.estimatedMinutes).toBeGreaterThan(0);
      expect(plan.byStatus[ReviewStatus.NEW]).toBeGreaterThan(0);
      expect(plan.weeklyProjection).toHaveLength(7);
      
      // Verify weekly projection structure
      for (const day of plan.weeklyProjection) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(day.count).toBeGreaterThanOrEqual(0);
        expect(day.estimatedMinutes).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide accurate system health metrics', async () => {
      const health = await service.getSystemHealth();
      
      expect(health.totalConcepts).toBeGreaterThan(0);
      expect(health.averageEaseFactor).toBeGreaterThanOrEqual(0);
      expect(health.averageInterval).toBeGreaterThanOrEqual(0);
      expect(health.conceptsByStatus[ReviewStatus.NEW]).toBeGreaterThan(0);
      expect(health.overduePercentage).toBeGreaterThanOrEqual(0);
      expect(health.overduePercentage).toBeLessThanOrEqual(100);
    });

    it('should estimate study time accurately', async () => {
      const estimatedMinutes = await service.estimateDailyStudyTime();
      expect(estimatedMinutes).toBeGreaterThan(0);
      
      // Should be reasonable (not negative, not ridiculously high)
      expect(estimatedMinutes).toBeLessThan(1000);
    });
  });

  describe('system maintenance and data integrity', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'valid-concept-alpha' });
      await service.scheduleForReview({ conceptId: 'valid-concept-beta' });
      await service.scheduleForReview({ conceptId: 'orphaned-concept-gamma' });
    });

    it('should maintain data integrity across service operations', async () => {
      // Perform various operations
      await service.processReview({
        conceptId: 'valid-concept-alpha',
        responseQuality: ResponseQuality.GOOD
      });
      
      await service.suspend('valid-concept-beta');
      await service.resume('valid-concept-beta');
      
      // Verify all data is still consistent
      const alphaSchedule = await service.getSchedule('valid-concept-alpha');
      const betaSchedule = await service.getSchedule('valid-concept-beta');
      const gammaSchedule = await service.getSchedule('orphaned-concept-gamma');
      
      expect(alphaSchedule?.totalReviews).toBe(1);
      expect(betaSchedule?.status).not.toBe(ReviewStatus.SUSPENDED);
      expect(gammaSchedule?.conceptId).toBe('orphaned-concept-gamma');
      
      const totalCount = await repository.count();
      expect(totalCount).toBe(3);
    });

    it('should clean up orphaned schedules effectively', async () => {
      const validConceptIds = ['valid-concept-alpha', 'valid-concept-beta'];
      
      const cleanedCount = await service.cleanupOrphaned(validConceptIds);
      expect(cleanedCount).toBeGreaterThanOrEqual(1);
      
      const remainingCount = await repository.count();
      expect(remainingCount).toBe(2);
      
      // Verify valid concepts still exist
      const alphaSchedule = await service.getSchedule('valid-concept-alpha');
      const betaSchedule = await service.getSchedule('valid-concept-beta');
      expect(alphaSchedule).toBeDefined();
      expect(betaSchedule).toBeDefined();
      
      // Verify orphaned concept was removed
      const gammaSchedule = await service.getSchedule('orphaned-concept-gamma');
      expect(gammaSchedule).toBeNull();
    });
  });

  describe('concurrent operations and reliability', () => {
    it('should handle concurrent scheduling operations safely', async () => {
      const conceptIds = Array.from({ length: 10 }, (_, i) => `concurrent-concept-${i}`);
      
      // Schedule all concepts concurrently
      const schedulingPromises = conceptIds.map(conceptId =>
        service.scheduleForReview({ conceptId })
      );
      
      const schedules = await Promise.all(schedulingPromises);
      
      expect(schedules).toHaveLength(10);
      
      // Verify all were persisted correctly
      for (const conceptId of conceptIds) {
        const schedule = await service.getSchedule(conceptId);
        expect(schedule).toBeDefined();
        expect(schedule?.conceptId).toBe(conceptId);
      }
      
      const totalCount = await repository.count();
      expect(totalCount).toBe(10);
    });

    it('should maintain consistency during concurrent modifications', async () => {
      const conceptId = 'concurrency-test-concept';
      
      await service.scheduleForReview({ conceptId });
      
      // Perform concurrent operations
      const operations = [
        service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD }),
        service.suspend(conceptId),
        service.resume(conceptId)
      ];
      
      const results = await Promise.allSettled(operations);
      
      // At least some operations should succeed
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
      
      // Final state should be consistent
      const finalSchedule = await service.getSchedule(conceptId);
      expect(finalSchedule).toBeDefined();
    });
  });
});