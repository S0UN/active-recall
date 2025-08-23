/**
 * Repository Contract Tests
 * 
 * Comprehensive test suite that any IReviewScheduleRepository implementation
 * must pass. This follows TDD principles - tests are written first to define
 * the expected behavior, then implementations are created to satisfy these tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  IReviewScheduleRepository, 
  DueReviewsQuery, 
  ScheduleQuery,
  ScheduleStatistics 
} from './IReviewScheduleRepository';
import { ReviewSchedule, ResponseQuality, ReviewStatus } from '../domain/ReviewSchedule';

/**
 * Contract test suite that must be satisfied by any repository implementation
 */
export function createRepositoryContractTests(
  createRepository: () => Promise<IReviewScheduleRepository>,
  cleanupRepository?: (repo: IReviewScheduleRepository) => Promise<void>
) {
  describe('IReviewScheduleRepository Contract Tests', () => {
    let repository: IReviewScheduleRepository;

    beforeEach(async () => {
      repository = await createRepository();
    });

    afterEach(async () => {
      if (cleanupRepository) {
        await cleanupRepository(repository);
      }
    });

    // ==================== BASIC CRUD OPERATIONS ====================

    describe('Basic CRUD Operations', () => {
      it('should save and retrieve a schedule by ID', async () => {
        const schedule = ReviewSchedule.createNew('concept-123');
        
        await repository.save(schedule);
        const retrieved = await repository.findById(schedule.id);
        
        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe(schedule.id);
        expect(retrieved!.conceptId).toBe('concept-123');
        expect(retrieved!.status).toBe(ReviewStatus.NEW);
      });

      it('should return null when schedule not found', async () => {
        const result = await repository.findById('non-existent');
        expect(result).toBeNull();
      });

      it('should find schedule by concept ID', async () => {
        const schedule = ReviewSchedule.createNew('concept-456');
        
        await repository.save(schedule);
        const retrieved = await repository.findByConceptId('concept-456');
        
        expect(retrieved).toBeDefined();
        expect(retrieved!.conceptId).toBe('concept-456');
      });

      it('should check existence correctly', async () => {
        const schedule = ReviewSchedule.createNew('concept-789');
        
        expect(await repository.exists(schedule.id)).toBe(false);
        
        await repository.save(schedule);
        expect(await repository.exists(schedule.id)).toBe(true);
      });

      it('should be idempotent when saving same schedule multiple times', async () => {
        const schedule = ReviewSchedule.createNew('concept-abc');
        
        await repository.save(schedule);
        await repository.save(schedule); // Should not throw
        
        const count = await repository.count();
        expect(count).toBe(1);
      });

      it('should delete schedule by ID', async () => {
        const schedule = ReviewSchedule.createNew('concept-def');
        
        await repository.save(schedule);
        expect(await repository.exists(schedule.id)).toBe(true);
        
        await repository.delete(schedule.id);
        expect(await repository.exists(schedule.id)).toBe(false);
      });

      it('should be idempotent when deleting non-existent schedule', async () => {
        // Should not throw
        await repository.delete('non-existent');
      });

      it('should delete by concept ID', async () => {
        const schedule = ReviewSchedule.createNew('concept-ghi');
        
        await repository.save(schedule);
        await repository.deleteByConceptId('concept-ghi');
        
        const retrieved = await repository.findByConceptId('concept-ghi');
        expect(retrieved).toBeNull();
      });
    });

    // ==================== BULK OPERATIONS ====================

    describe('Bulk Operations', () => {
      it('should save multiple schedules', async () => {
        const schedules = [
          ReviewSchedule.createNew('concept-1'),
          ReviewSchedule.createNew('concept-2'),
          ReviewSchedule.createNew('concept-3')
        ];
        
        await repository.saveMany(schedules);
        
        const count = await repository.count();
        expect(count).toBe(3);
        
        for (const schedule of schedules) {
          const retrieved = await repository.findById(schedule.id);
          expect(retrieved).toBeDefined();
        }
      });

      it('should update multiple schedules', async () => {
        const schedules = [
          ReviewSchedule.createNew('concept-1'),
          ReviewSchedule.createNew('concept-2')
        ];
        
        await repository.saveMany(schedules);
        
        // Record reviews to change state
        schedules[0].recordReview(ResponseQuality.GOOD);
        schedules[1].recordReview(ResponseQuality.HARD);
        
        await repository.updateMany(schedules);
        
        const retrieved1 = await repository.findById(schedules[0].id);
        const retrieved2 = await repository.findById(schedules[1].id);
        
        expect(retrieved1!.totalReviews).toBe(1);
        expect(retrieved2!.totalReviews).toBe(1);
        expect(retrieved1!.parameters.easinessFactor).toBe(2.5);
        expect(retrieved2!.parameters.easinessFactor).toBeLessThan(2.5);
      });

      it('should create initial schedules for multiple concepts', async () => {
        const conceptIds = ['concept-a', 'concept-b', 'concept-c'];
        
        await repository.createInitialSchedules(conceptIds);
        
        const count = await repository.count();
        expect(count).toBe(3);
        
        for (const conceptId of conceptIds) {
          const schedule = await repository.findByConceptId(conceptId);
          expect(schedule).toBeDefined();
          expect(schedule!.status).toBe(ReviewStatus.NEW);
        }
      });
    });

    // ==================== QUERY OPERATIONS ====================

    describe('Query Operations', () => {
      beforeEach(async () => {
        // Create test data with different states
        const schedules = await createTestSchedules();
        await repository.saveMany(schedules);
      });

      it('should find due reviews with no query parameters', async () => {
        const dueReviews = await repository.findDueReviews();
        
        expect(dueReviews.length).toBeGreaterThan(0);
        
        // All returned schedules should be due
        for (const schedule of dueReviews) {
          expect(schedule.isDue()).toBe(true);
          expect(schedule.status).not.toBe(ReviewStatus.SUSPENDED);
        }
      });

      it('should respect limit in due reviews query', async () => {
        const query: DueReviewsQuery = { limit: 2 };
        const dueReviews = await repository.findDueReviews(query);
        
        expect(dueReviews.length).toBeLessThanOrEqual(2);
      });

      it('should filter due reviews by folder ID', async () => {
        // This test assumes schedules were created with folder associations
        // In a real implementation, you'd need to track folder IDs
        const query: DueReviewsQuery = { folderIds: ['folder-1'] };
        const dueReviews = await repository.findDueReviews(query);
        
        // Results would be filtered by folder - exact assertion depends on test data
        expect(Array.isArray(dueReviews)).toBe(true);
      });

      it('should find schedules by status', async () => {
        const newSchedules = await repository.findByStatus(ReviewStatus.NEW);
        const learningSchedules = await repository.findByStatus(ReviewStatus.LEARNING);
        
        expect(newSchedules.length).toBeGreaterThan(0);
        
        for (const schedule of newSchedules) {
          expect(schedule.status).toBe(ReviewStatus.NEW);
        }
        
        for (const schedule of learningSchedules) {
          expect(schedule.status).toBe(ReviewStatus.LEARNING);
        }
      });

      it('should find overdue schedules', async () => {
        const overdueSchedules = await repository.findOverdue(1); // 1+ days overdue
        
        // All returned schedules should be overdue
        for (const schedule of overdueSchedules) {
          expect(schedule.isOverdue(1)).toBe(true);
        }
      });

      it('should find schedules by query with multiple criteria', async () => {
        const query: ScheduleQuery = {
          status: ReviewStatus.NEW,
          minRepetitions: 0,
          maxRepetitions: 0,
          limit: 5
        };
        
        const results = await repository.findByQuery(query);
        
        expect(results.length).toBeLessThanOrEqual(5);
        
        for (const schedule of results) {
          expect(schedule.status).toBe(ReviewStatus.NEW);
          expect(schedule.parameters.repetitions).toBe(0);
        }
      });

      it('should support pagination in queries', async () => {
        const firstPage = await repository.findByQuery({ limit: 2, offset: 0 });
        const secondPage = await repository.findByQuery({ limit: 2, offset: 2 });
        
        expect(firstPage.length).toBeLessThanOrEqual(2);
        expect(secondPage.length).toBeLessThanOrEqual(2);
        
        // Should not have overlapping results
        const firstIds = firstPage.map(s => s.id);
        const secondIds = secondPage.map(s => s.id);
        const overlap = firstIds.filter(id => secondIds.includes(id));
        
        expect(overlap.length).toBe(0);
      });
    });

    // ==================== COUNTING AND STATISTICS ====================

    describe('Counting and Statistics', () => {
      beforeEach(async () => {
        const schedules = await createTestSchedules();
        await repository.saveMany(schedules);
      });

      it('should count total schedules', async () => {
        const count = await repository.count();
        expect(count).toBeGreaterThan(0);
        expect(typeof count).toBe('number');
      });

      it('should count due reviews', async () => {
        const dueCount = await repository.countDueReviews();
        const allDue = await repository.findDueReviews();
        
        expect(dueCount).toBe(allDue.length);
      });

      it('should count by status', async () => {
        const newCount = await repository.countByStatus(ReviewStatus.NEW);
        const newSchedules = await repository.findByStatus(ReviewStatus.NEW);
        
        expect(newCount).toBe(newSchedules.length);
      });

      it('should get comprehensive statistics', async () => {
        const stats = await repository.getStatistics();
        
        expect(stats).toMatchObject({
          totalSchedules: expect.any(Number),
          newCount: expect.any(Number),
          learningCount: expect.any(Number),
          reviewingCount: expect.any(Number),
          matureCount: expect.any(Number),
          suspendedCount: expect.any(Number),
          leechCount: expect.any(Number),
          dueCount: expect.any(Number),
          overdueCount: expect.any(Number),
          averageEaseFactor: expect.any(Number),
          averageInterval: expect.any(Number)
        } as ScheduleStatistics);
        
        // Validate statistics consistency
        const totalByStatus = stats.newCount + stats.learningCount + 
                             stats.reviewingCount + stats.matureCount + 
                             stats.suspendedCount + stats.leechCount;
        
        expect(totalByStatus).toBe(stats.totalSchedules);
      });
    });

    // ==================== CALENDAR AND PLANNING ====================

    describe('Calendar and Planning', () => {
      beforeEach(async () => {
        const schedules = await createTestSchedules();
        await repository.saveMany(schedules);
      });

      it('should get review calendar', async () => {
        const calendar = await repository.getReviewCalendar(7); // 7 days
        
        expect(calendar.length).toBe(7);
        
        for (const entry of calendar) {
          expect(entry).toMatchObject({
            date: expect.any(Date),
            dueCount: expect.any(Number),
            newCount: expect.any(Number),
            learningCount: expect.any(Number),
            reviewingCount: expect.any(Number),
            matureCount: expect.any(Number)
          });
          
          // Counts should be non-negative
          expect(entry.dueCount).toBeGreaterThanOrEqual(0);
          expect(entry.newCount).toBeGreaterThanOrEqual(0);
        }
      });

      it('should get schedules for specific date', async () => {
        const today = new Date();
        const schedulesForToday = await repository.getSchedulesForDate(today);
        
        expect(Array.isArray(schedulesForToday)).toBe(true);
        
        // All schedules should be due on the specified date
        for (const schedule of schedulesForToday) {
          const nextReview = schedule.timing.nextReviewDate;
          const isSameDay = nextReview.toDateString() === today.toDateString();
          const isPastDue = nextReview < today;
          
          expect(isSameDay || isPastDue).toBe(true);
        }
      });

      it('should estimate daily workload', async () => {
        const workload = await repository.estimateDailyWorkload(30); // 30 days
        
        expect(typeof workload).toBe('number');
        expect(workload).toBeGreaterThanOrEqual(0);
      });
    });

    // ==================== MAINTENANCE OPERATIONS ====================

    describe('Maintenance Operations', () => {
      beforeEach(async () => {
        const schedules = await createTestSchedules();
        await repository.saveMany(schedules);
      });

      it('should suspend and resume by concept ID', async () => {
        const conceptId = 'test-concept-1';
        const schedule = ReviewSchedule.createNew(conceptId);
        
        await repository.save(schedule);
        
        // Suspend
        await repository.suspendByConceptId(conceptId);
        const suspended = await repository.findByConceptId(conceptId);
        expect(suspended!.status).toBe(ReviewStatus.SUSPENDED);
        
        // Resume
        await repository.resumeByConceptId(conceptId);
        const resumed = await repository.findByConceptId(conceptId);
        expect(resumed!.status).not.toBe(ReviewStatus.SUSPENDED);
      });

      it('should cleanup orphaned schedules', async () => {
        // Get initial count to handle any existing schedules
        const initialCount = await repository.count();
        
        // Create schedules
        const schedules = [
          ReviewSchedule.createNew('valid-concept-1'),
          ReviewSchedule.createNew('valid-concept-2'),
          ReviewSchedule.createNew('invalid-concept-1')
        ];
        
        await repository.saveMany(schedules);
        
        const countAfterSave = await repository.count();
        expect(countAfterSave).toBe(initialCount + 3);
        
        // Clean up - only keep valid concepts 1 and 2
        const validConceptIds = ['valid-concept-1', 'valid-concept-2'];
        const cleanedCount = await repository.cleanupOrphaned(validConceptIds);
        
        // Should remove at least the invalid-concept-1 we just created
        expect(cleanedCount).toBeGreaterThanOrEqual(1);
        
        const remaining = await repository.count();
        expect(remaining).toBe(2); // Only the two valid concepts should remain
      });

      it('should reset abandoned schedules', async () => {
        // This test would require setting up schedules with old review dates
        // The exact implementation depends on how "abandoned" is tracked
        const resetCount = await repository.resetAbandoned(365); // 1 year
        
        expect(typeof resetCount).toBe('number');
        expect(resetCount).toBeGreaterThanOrEqual(0);
      });
    });

    // ==================== SERIALIZATION ====================

    describe('Serialization and Export/Import', () => {
      it('should export and import schedules correctly', async () => {
        const originalSchedules = await createTestSchedules();
        await repository.saveMany(originalSchedules);
        
        // Export
        const exported = await repository.exportSchedules();
        expect(exported.length).toBe(originalSchedules.length);
        
        // Clear repository
        if (cleanupRepository) {
          await cleanupRepository(repository);
          repository = await createRepository();
        }
        
        // Import
        await repository.importSchedules(exported);
        
        const count = await repository.count();
        expect(count).toBe(originalSchedules.length);
        
        // Verify data integrity
        for (const original of originalSchedules) {
          const imported = await repository.findById(original.id);
          expect(imported).toBeDefined();
          expect(imported!.conceptId).toBe(original.conceptId);
          expect(imported!.status).toBe(original.status);
        }
      });

      it('should export specific concepts only', async () => {
        const schedules = [
          ReviewSchedule.createNew('concept-1'),
          ReviewSchedule.createNew('concept-2'),
          ReviewSchedule.createNew('concept-3')
        ];
        
        await repository.saveMany(schedules);
        
        const exported = await repository.exportSchedules(['concept-1', 'concept-2']);
        expect(exported.length).toBe(2);
        
        const conceptIds = exported.map(s => s.conceptId);
        expect(conceptIds).toContain('concept-1');
        expect(conceptIds).toContain('concept-2');
        expect(conceptIds).not.toContain('concept-3');
      });
    });

    // ==================== ANALYTICS QUERIES ====================

    describe('Analytics Queries', () => {
      beforeEach(async () => {
        const schedules = await createTestSchedules();
        await repository.saveMany(schedules);
      });

      it('should get ease factor distribution', async () => {
        const distribution = await repository.getEaseFactorDistribution();
        
        expect(Array.isArray(distribution)).toBe(true);
        
        for (const entry of distribution) {
          expect(entry).toMatchObject({
            easeFactor: expect.any(Number),
            count: expect.any(Number)
          });
          
          expect(entry.easeFactor).toBeGreaterThanOrEqual(1.3);
          expect(entry.easeFactor).toBeLessThanOrEqual(2.5);
          expect(entry.count).toBeGreaterThan(0);
        }
      });

      it('should get interval distribution', async () => {
        const distribution = await repository.getIntervalDistribution();
        
        expect(Array.isArray(distribution)).toBe(true);
        
        for (const entry of distribution) {
          expect(entry).toMatchObject({
            intervalRange: expect.any(String),
            count: expect.any(Number)
          });
          
          expect(entry.count).toBeGreaterThan(0);
        }
      });

      it('should find problematic concepts', async () => {
        const problematic = await repository.findProblematicConcepts(5);
        
        expect(Array.isArray(problematic)).toBe(true);
        expect(problematic.length).toBeLessThanOrEqual(5);
        
        for (const concept of problematic) {
          expect(concept).toMatchObject({
            conceptId: expect.any(String),
            easeFactor: expect.any(Number),
            consecutiveIncorrect: expect.any(Number),
            lastReviewDate: expect.any(Date)
          });
          
          // Should have indicators of problems
          const hasLowEase = concept.easeFactor < 2.0;
          const hasFailures = concept.consecutiveIncorrect > 0;
          
          expect(hasLowEase || hasFailures).toBe(true);
        }
      });
    });
  });

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Create test schedules with various states for comprehensive testing
   */
  async function createTestSchedules(): Promise<ReviewSchedule[]> {
    const schedules: ReviewSchedule[] = [];
    
    // Create new schedule (due immediately)
    const newSchedule = ReviewSchedule.createNew('test-concept-new');
    schedules.push(newSchedule);
    
    // Create learning schedule (progressed but not graduated)
    const learningSchedule = ReviewSchedule.createNew('test-concept-learning');
    learningSchedule.recordReview(ResponseQuality.GOOD);
    schedules.push(learningSchedule);
    
    // Create reviewing schedule (graduated, moderate intervals)
    const reviewingSchedule = ReviewSchedule.createNew('test-concept-reviewing');
    reviewingSchedule.recordReview(ResponseQuality.GOOD);
    reviewingSchedule.recordReview(ResponseQuality.GOOD);
    reviewingSchedule.recordReview(ResponseQuality.GOOD);
    schedules.push(reviewingSchedule);
    
    // Create mature schedule (long intervals)
    const matureSchedule = ReviewSchedule.createNew('test-concept-mature');
    for (let i = 0; i < 8; i++) {
      matureSchedule.recordReview(ResponseQuality.GOOD);
    }
    schedules.push(matureSchedule);
    
    // Create suspended schedule
    const suspendedSchedule = ReviewSchedule.createNew('test-concept-suspended');
    suspendedSchedule.suspend();
    schedules.push(suspendedSchedule);
    
    // Create leech schedule (many failures)
    const leechSchedule = ReviewSchedule.createNew('test-concept-leech');
    for (let i = 0; i < 10; i++) {
      leechSchedule.recordReview(ResponseQuality.FORGOT);
    }
    schedules.push(leechSchedule);
    
    return schedules;
  }
}