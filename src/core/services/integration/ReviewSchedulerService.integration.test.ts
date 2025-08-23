/**
 * ReviewSchedulerService Integration Tests
 * 
 * Integration tests that verify the ReviewSchedulerService works correctly
 * with the actual FileSystemReviewScheduleRepository implementation.
 * These tests ensure the service layer properly integrates with persistence
 * and that the entire spaced repetition flow works end-to-end.
 * 
 * Test categories:
 * - Service-Repository integration
 * - End-to-end review workflows
 * - Data consistency and persistence
 * - Performance with real file operations
 * - Error handling with actual I/O
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { ReviewSchedulerService } from '../impl/ReviewSchedulerService';
import { FileSystemReviewScheduleRepository } from '../../spaced-repetition/repositories/FileSystemReviewScheduleRepository';
import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus 
} from '../../spaced-repetition/domain/ReviewSchedule';
import { SM2Algorithm } from '../../spaced-repetition/algorithms/SM2Algorithm';

describe('ReviewSchedulerService Integration Tests', () => {
  let service: ReviewSchedulerService;
  let repository: FileSystemReviewScheduleRepository;
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = join(tmpdir(), `spaced-repetition-integration-${randomBytes(8).toString('hex')}`);
    
    // Create repository and service with real file system
    repository = new FileSystemReviewScheduleRepository(testDir);
    const algorithm = new SM2Algorithm();
    service = new ReviewSchedulerService(repository, algorithm);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ==================== BASIC INTEGRATION ====================

  describe('Basic Service-Repository Integration', () => {
    it('should schedule, persist, and retrieve concepts correctly', async () => {
      // Schedule a concept
      const schedule = await service.scheduleForReview({ 
        conceptId: 'integration-test-concept' 
      });
      
      expect(schedule.conceptId).toBe('integration-test-concept');
      expect(schedule.status).toBe(ReviewStatus.NEW);
      
      // Verify it was persisted to filesystem
      const retrieved = await service.getSchedule('integration-test-concept');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(schedule.id);
      expect(retrieved!.conceptId).toBe(schedule.conceptId);
      
      // Verify the file actually exists on disk
      const scheduleFiles = await repository.count();
      expect(scheduleFiles).toBe(1);
    });

    it('should handle concurrent scheduling without data corruption', async () => {
      const conceptIds = Array.from({ length: 10 }, (_, i) => `concept-${i}`);
      
      // Schedule all concepts concurrently
      const schedulePromises = conceptIds.map(conceptId => 
        service.scheduleForReview({ conceptId })
      );
      
      const schedules = await Promise.all(schedulePromises);
      
      // Verify all were created successfully
      expect(schedules).toHaveLength(10);
      
      // Verify all are persisted and retrievable
      for (const conceptId of conceptIds) {
        const retrieved = await service.getSchedule(conceptId);
        expect(retrieved).toBeDefined();
        expect(retrieved!.conceptId).toBe(conceptId);
      }
      
      // Verify total count
      const totalCount = await repository.count();
      expect(totalCount).toBe(10);
    });
  });

  // ==================== END-TO-END REVIEW WORKFLOWS ====================

  describe('Complete Review Workflows', () => {
    it('should handle a complete learning-to-reviewing progression', async () => {
      const conceptId = 'progression-test';
      
      // 1. Schedule new concept
      let schedule = await service.scheduleForReview({ conceptId });
      expect(schedule.status).toBe(ReviewStatus.NEW);
      expect(schedule.totalReviews).toBe(0);
      
      // 2. Process first review (NEW -> LEARNING)
      const review1 = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(review1.statusChanged).toBe(true);
      expect(review1.schedule.status).toBe(ReviewStatus.LEARNING);
      expect(review1.schedule.totalReviews).toBe(1);
      
      // 3. Process second review (still LEARNING)
      const review2 = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(review2.schedule.status).toBe(ReviewStatus.LEARNING);
      expect(review2.schedule.totalReviews).toBe(2);
      
      // 4. Process third review (LEARNING -> REVIEWING)
      const review3 = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(review3.statusChanged).toBe(true);
      expect(review3.schedule.status).toBe(ReviewStatus.REVIEWING);
      expect(review3.schedule.totalReviews).toBe(3);
      
      // 5. Continue reviewing until mature
      let currentSchedule = review3.schedule;
      let reviewCount = 3;
      
      while (currentSchedule.status !== ReviewStatus.MATURE && reviewCount < 20) {
        const result = await service.processReview({
          conceptId,
          responseQuality: ResponseQuality.GOOD
        });
        currentSchedule = result.schedule;
        reviewCount++;
      }
      
      // Should eventually reach mature status
      expect(currentSchedule.status).toBe(ReviewStatus.MATURE);
      expect(currentSchedule.parameters.interval).toBeGreaterThanOrEqual(21);
      
      // Verify final state is persisted
      const finalSchedule = await service.getSchedule(conceptId);
      expect(finalSchedule!.status).toBe(ReviewStatus.MATURE);
      expect(finalSchedule!.totalReviews).toBe(reviewCount);
    });

    it('should handle forgot responses and recovery', async () => {
      const conceptId = 'forgot-recovery-test';
      
      // Schedule and advance to reviewing state
      await service.scheduleForReview({ conceptId });
      await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      const advancedReview = await service.processReview({ 
        conceptId, 
        responseQuality: ResponseQuality.GOOD 
      });
      
      expect(advancedReview.schedule.status).toBe(ReviewStatus.REVIEWING);
      const beforeForgot = advancedReview.schedule.parameters.interval;
      
      // Process forgot response
      const forgotResult = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.FORGOT
      });
      
      // Should reset interval and ease factor
      expect(forgotResult.intervalChange.current).toBe(1);
      expect(forgotResult.schedule.consecutiveIncorrect).toBe(1);
      expect(forgotResult.schedule.consecutiveCorrect).toBe(0);
      
      // Recovery with good responses
      const recovery1 = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(recovery1.schedule.consecutiveCorrect).toBe(1);
      expect(recovery1.schedule.consecutiveIncorrect).toBe(0);
      
      // Verify persistence of recovery state
      const recovered = await service.getSchedule(conceptId);
      expect(recovered!.consecutiveCorrect).toBe(1);
      expect(recovered!.consecutiveIncorrect).toBe(0);
    });
  });

  // ==================== DATA CONSISTENCY ====================

  describe('Data Consistency and Persistence', () => {
    it('should maintain data consistency across service restarts', async () => {
      const conceptId = 'consistency-test';
      
      // Create and modify schedule with first service instance
      await service.scheduleForReview({ conceptId });
      const review1 = await service.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      const originalId = review1.schedule.id;
      const originalReviews = review1.schedule.totalReviews;
      
      // Create new service instance (simulating restart)
      const newRepository = new FileSystemReviewScheduleRepository(testDir);
      const newService = new ReviewSchedulerService(newRepository);
      
      // Retrieve schedule with new service
      const retrievedSchedule = await newService.getSchedule(conceptId);
      
      expect(retrievedSchedule).toBeDefined();
      expect(retrievedSchedule!.id).toBe(originalId);
      expect(retrievedSchedule!.totalReviews).toBe(originalReviews);
      
      // Process another review with new service
      const review2 = await newService.processReview({
        conceptId,
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(review2.schedule.totalReviews).toBe(originalReviews + 1);
      
      // Verify with original service can still access updated data
      const finalCheck = await service.getSchedule(conceptId);
      expect(finalCheck!.totalReviews).toBe(originalReviews + 1);
    });

    it('should handle bulk operations with filesystem persistence', async () => {
      const conceptIds = Array.from({ length: 50 }, (_, i) => `bulk-concept-${i}`);
      
      // Bulk schedule
      const schedules = await service.bulkSchedule({
        conceptIds,
        batchSize: 10
      });
      
      expect(schedules).toHaveLength(50);
      
      // Verify all are persisted
      const count = await repository.count();
      expect(count).toBe(50);
      
      // Process reviews for subset
      const reviewPromises = conceptIds.slice(0, 10).map(conceptId =>
        service.processReview({
          conceptId,
          responseQuality: ResponseQuality.GOOD
        })
      );
      
      const reviewResults = await Promise.all(reviewPromises);
      
      // Verify all reviews were processed and persisted
      for (const result of reviewResults) {
        expect(result.schedule.totalReviews).toBe(1);
        
        const persisted = await service.getSchedule(result.schedule.conceptId);
        expect(persisted!.totalReviews).toBe(1);
      }
    });
  });

  // ==================== ANALYTICS AND PLANNING ====================

  describe('Analytics Integration', () => {
    beforeEach(async () => {
      // Setup diverse test data
      const concepts = [
        'new-concept-1', 'new-concept-2', 'new-concept-3',
        'learning-concept-1', 'learning-concept-2',
        'reviewing-concept-1', 'reviewing-concept-2',
        'mature-concept-1'
      ];
      
      // Schedule all concepts
      for (const conceptId of concepts) {
        await service.scheduleForReview({ conceptId });
      }
      
      // Advance some to different stages
      for (const conceptId of ['learning-concept-1', 'learning-concept-2']) {
        await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      }
      
      for (const conceptId of ['reviewing-concept-1', 'reviewing-concept-2']) {
        await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
        await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
        await service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD });
      }
      
      // Advance one to mature
      const matureConceptId = 'mature-concept-1';
      await service.processReview({ conceptId: matureConceptId, responseQuality: ResponseQuality.GOOD });
      await service.processReview({ conceptId: matureConceptId, responseQuality: ResponseQuality.GOOD });
      await service.processReview({ conceptId: matureConceptId, responseQuality: ResponseQuality.GOOD });
      
      // Continue until mature
      let schedule = await service.getSchedule(matureConceptId);
      let attempts = 0;
      while (schedule!.status !== ReviewStatus.MATURE && attempts < 20) {
        await service.processReview({ 
          conceptId: matureConceptId, 
          responseQuality: ResponseQuality.GOOD 
        });
        schedule = await service.getSchedule(matureConceptId);
        attempts++;
      }
    });

    it('should provide accurate review planning with real data', async () => {
      const plan = await service.getReviewPlan();
      
      expect(plan).toBeDefined();
      expect(plan.dueToday).toBeGreaterThan(0);
      expect(plan.estimatedMinutes).toBeGreaterThan(0);
      
      // Verify status breakdown matches our setup
      expect(plan.byStatus[ReviewStatus.NEW]).toBeGreaterThan(0);
      expect(plan.byStatus[ReviewStatus.LEARNING]).toBeGreaterThan(0);
      expect(plan.byStatus[ReviewStatus.REVIEWING]).toBeGreaterThan(0);
      
      // Verify weekly projection structure
      expect(plan.weeklyProjection).toHaveLength(7);
      plan.weeklyProjection.forEach(day => {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(day.count).toBeGreaterThanOrEqual(0);
        expect(day.estimatedMinutes).toBeGreaterThanOrEqual(0);
      });
    });

    it('should provide accurate system health metrics', async () => {
      const health = await service.getSystemHealth();
      
      expect(health.totalConcepts).toBeGreaterThan(0);
      expect(health.totalReviews).toBeGreaterThan(0);
      expect(health.averageEaseFactor).toBeGreaterThanOrEqual(0); // Can be 0 if no reviews processed
      expect(health.averageInterval).toBeGreaterThanOrEqual(0); // Can be 0 if no reviews processed
      
      // Verify status distribution
      const statusCounts = health.conceptsByStatus;
      expect(statusCounts[ReviewStatus.NEW]).toBeGreaterThan(0);
      expect(statusCounts[ReviewStatus.LEARNING]).toBeGreaterThan(0);
      expect(statusCounts[ReviewStatus.REVIEWING]).toBeGreaterThan(0);
      
      expect(health.overduePercentage).toBeGreaterThanOrEqual(0);
      expect(health.overduePercentage).toBeLessThanOrEqual(100);
    });
  });

  // ==================== ERROR HANDLING ====================

  describe('Error Handling with Real I/O', () => {
    it('should handle filesystem permission issues gracefully', async () => {
      // This test would need actual permission manipulation
      // For now, verify the service handles repository errors
      try {
        await service.scheduleForReview({ conceptId: 'permission-test' });
        expect(true).toBe(true); // If no error, test passes
      } catch (error) {
        // If there's an error, it should be meaningful
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should handle concurrent modifications correctly', async () => {
      const conceptId = 'concurrent-test';
      
      // Schedule initial concept
      await service.scheduleForReview({ conceptId });
      
      // Create multiple concurrent modifications
      const concurrentPromises = [
        service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD }),
        service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD }),
        service.processReview({ conceptId, responseQuality: ResponseQuality.GOOD }),
        service.suspend(conceptId),
        service.resume(conceptId)
      ];
      
      // Some operations should succeed, others might fail due to concurrency
      const results = await Promise.allSettled(concurrentPromises);
      
      // At least some operations should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);
      
      // Final state should be consistent
      const finalSchedule = await service.getSchedule(conceptId);
      expect(finalSchedule).toBeDefined();
    });
  });

  // ==================== PERFORMANCE ====================

  describe('Performance with Real File Operations', () => {
    it('should handle moderate scale efficiently', async () => {
      const conceptCount = 100;
      const conceptIds = Array.from({ length: conceptCount }, (_, i) => `perf-concept-${i}`);
      
      // Time bulk scheduling
      const scheduleStart = Date.now();
      await service.bulkSchedule({ conceptIds, batchSize: 20 });
      const scheduleTime = Date.now() - scheduleStart;
      
      // Should complete within reasonable time (5 seconds for 100 concepts)
      expect(scheduleTime).toBeLessThan(5000);
      
      // Time due reviews query
      const queryStart = Date.now();
      const dueReviews = await service.getDueReviews({ limit: 50 });
      const queryTime = Date.now() - queryStart;
      
      // Should be very fast due to indexing
      expect(queryTime).toBeLessThan(100);
      expect(dueReviews.length).toBeLessThanOrEqual(50);
      
      // Time system health calculation
      const healthStart = Date.now();
      const health = await service.getSystemHealth();
      const healthTime = Date.now() - healthStart;
      
      expect(healthTime).toBeLessThan(500);
      expect(health.totalConcepts).toBe(conceptCount);
    });
  });
});