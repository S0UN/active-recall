/**
 * ReviewSchedulerService Tests
 * 
 * Comprehensive test suite for the ReviewSchedulerService that ensures
 * proper business logic implementation and integration with dependencies.
 * 
 * Test categories:
 * - Unit tests for business logic
 * - Integration tests with repository
 * - Error handling and edge cases
 * - Bulk operations and performance
 * - Analytics and planning features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewSchedulerService } from './ReviewSchedulerService';
import { 
  IReviewScheduleRepository,
  DueReviewsQuery,
  ScheduleStatistics
} from '../../spaced-repetition/contracts/IReviewScheduleRepository';
import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus,
  ReviewParameters,
  ReviewTiming
} from '../../spaced-repetition/domain/ReviewSchedule';
import { SM2Algorithm } from '../../spaced-repetition/algorithms/SM2Algorithm';

// Mock repository for testing
class MockReviewScheduleRepository implements IReviewScheduleRepository {
  private schedules = new Map<string, ReviewSchedule>();
  private idToConceptId = new Map<string, string>();

  // Mock implementation - stores schedules in memory
  async save(schedule: ReviewSchedule): Promise<void> {
    this.schedules.set(schedule.id, schedule);
    this.idToConceptId.set(schedule.id, schedule.conceptId);
  }

  async findById(id: string): Promise<ReviewSchedule | null> {
    return this.schedules.get(id) || null;
  }

  async findByConceptId(conceptId: string): Promise<ReviewSchedule | null> {
    for (const schedule of this.schedules.values()) {
      if (schedule.conceptId === conceptId) {
        return schedule;
      }
    }
    return null;
  }

  async exists(id: string): Promise<boolean> {
    return this.schedules.has(id);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.schedules.delete(id);
    if (deleted) {
      this.idToConceptId.delete(id);
    }
    return deleted;
  }

  async deleteByConceptId(conceptId: string): Promise<boolean> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      return await this.delete(schedule.id);
    }
    return false;
  }

  async findDueReviews(query?: DueReviewsQuery): Promise<ReviewSchedule[]> {
    const currentTime = query?.currentTime || new Date();
    const dueSchedules = Array.from(this.schedules.values())
      .filter(schedule => schedule.isDue(currentTime));
    
    if (query?.limit) {
      return dueSchedules.slice(0, query.limit);
    }
    return dueSchedules;
  }

  async findOverdue(days: number = 1, limit?: number): Promise<ReviewSchedule[]> {
    const currentTime = new Date();
    const overdueSchedules = Array.from(this.schedules.values())
      .filter(schedule => schedule.isOverdue(days, currentTime));
    
    if (limit) {
      return overdueSchedules.slice(0, limit);
    }
    return overdueSchedules;
  }

  async count(): Promise<number> {
    return this.schedules.size;
  }

  async countDueReviews(currentTime?: Date): Promise<number> {
    const time = currentTime || new Date();
    return Array.from(this.schedules.values())
      .filter(schedule => schedule.isDue(time)).length;
  }

  async countOverdue(days: number = 1, currentTime?: Date): Promise<number> {
    const time = currentTime || new Date();
    return Array.from(this.schedules.values())
      .filter(schedule => schedule.isOverdue(days, time)).length;
  }

  async suspendByConceptId(conceptId: string): Promise<boolean> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      schedule.suspend();
      await this.save(schedule);
      return true;
    }
    return false;
  }

  async resumeByConceptId(conceptId: string): Promise<boolean> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      schedule.resume();
      await this.save(schedule);
      return true;
    }
    return false;
  }

  async cleanupOrphaned(validConceptIds: string[]): Promise<number> {
    const validSet = new Set(validConceptIds);
    let cleanedCount = 0;
    
    for (const schedule of this.schedules.values()) {
      if (!validSet.has(schedule.conceptId)) {
        await this.delete(schedule.id);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  async resetAbandoned(daysAbandoned: number): Promise<number> {
    // Mock implementation - reset schedules that are very overdue
    let resetCount = 0;
    for (const schedule of this.schedules.values()) {
      if (schedule.isOverdue(daysAbandoned)) {
        const newSchedule = ReviewSchedule.createNew(schedule.conceptId);
        await this.save(newSchedule);
        resetCount++;
      }
    }
    return resetCount;
  }

  async getStatistics(): Promise<ScheduleStatistics> {
    const schedules = Array.from(this.schedules.values());
    const avgEase = schedules.length > 0 
      ? schedules.reduce((sum, s) => sum + s.parameters.easinessFactor, 0) / schedules.length 
      : 0;
    const avgInterval = schedules.length > 0 
      ? schedules.reduce((sum, s) => sum + s.parameters.interval, 0) / schedules.length 
      : 0;

    // Count by status
    const statusCounts = schedules.reduce((acc, schedule) => {
      acc[schedule.status] = (acc[schedule.status] || 0) + 1;
      return acc;
    }, {} as Record<ReviewStatus, number>);

    return {
      totalSchedules: schedules.length,
      newCount: statusCounts[ReviewStatus.NEW] || 0,
      learningCount: statusCounts[ReviewStatus.LEARNING] || 0,
      reviewingCount: statusCounts[ReviewStatus.REVIEWING] || 0,
      matureCount: statusCounts[ReviewStatus.MATURE] || 0,
      suspendedCount: statusCounts[ReviewStatus.SUSPENDED] || 0,
      leechCount: statusCounts[ReviewStatus.LEECH] || 0,
      dueCount: schedules.filter(s => s.isDue()).length,
      overdueCount: schedules.filter(s => s.isOverdue(1)).length,
      averageEaseFactor: Math.round(avgEase * 100) / 100,
      averageInterval: Math.round(avgInterval * 100) / 100
    };
  }

  // Simplified mock implementations for remaining methods
  async saveMany(schedules: ReviewSchedule[]): Promise<void> {
    for (const schedule of schedules) {
      await this.save(schedule);
    }
  }

  async findByStatus(status: ReviewStatus): Promise<ReviewSchedule[]> {
    return Array.from(this.schedules.values()).filter(s => s.status === status);
  }

  async findByQuery(): Promise<ReviewSchedule[]> { return []; }
  async countByStatus(): Promise<Record<ReviewStatus, number>> { 
    return {} as Record<ReviewStatus, number>; 
  }
  async getReviewCalendar(): Promise<any> { return {}; }
  async getSchedulesForDate(): Promise<ReviewSchedule[]> { return []; }
  async estimateDailyWorkload(): Promise<any> { return {}; }
  async createInitialSchedules(): Promise<void> {}
  async exportSchedules(): Promise<Record<string, any>[]> { return []; }
  async importSchedules(): Promise<void> {}
  async getEaseFactorDistribution(): Promise<{ easeFactor: number; count: number }[]> { return []; }
  async getIntervalDistribution(): Promise<{ intervalRange: string; count: number }[]> { return []; }
  async findProblematicConcepts(): Promise<ReviewSchedule[]> { return []; }

  // Helper method for tests
  clear(): void {
    this.schedules.clear();
    this.idToConceptId.clear();
  }
}

describe('ReviewSchedulerService', () => {
  let service: ReviewSchedulerService;
  let mockRepository: MockReviewScheduleRepository;
  let algorithm: SM2Algorithm;

  beforeEach(() => {
    mockRepository = new MockReviewScheduleRepository();
    algorithm = new SM2Algorithm();
    service = new ReviewSchedulerService(mockRepository, algorithm);
  });

  afterEach(() => {
    mockRepository.clear();
  });

  // ==================== CORE SCHEDULING OPERATIONS ====================

  describe('scheduleForReview', () => {
    it('should create a new schedule for a concept', async () => {
      const input = { conceptId: 'concept-1' };
      
      const result = await service.scheduleForReview(input);
      
      expect(result).toBeDefined();
      expect(result.conceptId).toBe('concept-1');
      expect(result.status).toBe(ReviewStatus.NEW);
      
      // Verify it was saved to repository
      const retrieved = await mockRepository.findByConceptId('concept-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(result.id);
    });

    it('should return existing schedule if concept already scheduled', async () => {
      const input = { conceptId: 'concept-1' };
      
      // Schedule first time
      const first = await service.scheduleForReview(input);
      
      // Schedule again - should return same schedule
      const second = await service.scheduleForReview(input);
      
      expect(second.id).toBe(first.id);
      expect(second.conceptId).toBe(first.conceptId);
    });

    it('should apply custom parameters when provided', async () => {
      const input = {
        conceptId: 'concept-1',
        customParameters: {
          initialEaseFactor: 2.4, // Within valid range (1.3-2.5)
          initialInterval: 3
        }
      };
      
      const result = await service.scheduleForReview(input);
      
      expect(result.parameters.easinessFactor).toBe(2.4);
      expect(result.parameters.interval).toBe(3);
    });
  });

  describe('processReview', () => {
    it('should process review and update schedule', async () => {
      // Setup: Create a schedule
      const schedule = await service.scheduleForReview({ conceptId: 'concept-1' });
      const originalInterval = schedule.parameters.interval;
      const originalEase = schedule.parameters.easinessFactor;
      
      // Process a good review
      const input = {
        conceptId: 'concept-1',
        responseQuality: ResponseQuality.GOOD
      };
      
      const result = await service.processReview(input);
      
      expect(result).toBeDefined();
      expect(result.schedule.conceptId).toBe('concept-1');
      expect(result.schedule.totalReviews).toBe(1);
      expect(result.statusChanged).toBe(true); // NEW -> LEARNING
      
      // Check interval and ease changes
      expect(result.intervalChange.previous).toBe(originalInterval);
      expect(result.intervalChange.current).toBe(result.schedule.parameters.interval);
      expect(result.easeChange.previous).toBe(originalEase);
      expect(result.easeChange.current).toBe(result.schedule.parameters.easinessFactor);
    });

    it('should throw error if concept not found', async () => {
      const input = {
        conceptId: 'nonexistent-concept',
        responseQuality: ResponseQuality.GOOD
      };
      
      await expect(service.processReview(input)).rejects.toThrow(
        'No review schedule found for concept: nonexistent-concept'
      );
    });

    it('should handle different response qualities correctly', async () => {
      // Setup schedules and advance them to reviewing phase first
      await service.scheduleForReview({ conceptId: 'easy-concept' });
      await service.scheduleForReview({ conceptId: 'hard-concept' });
      await service.scheduleForReview({ conceptId: 'forgot-concept' });
      
      // Advance to reviewing phase by processing good reviews first
      await service.processReview({
        conceptId: 'easy-concept',
        responseQuality: ResponseQuality.GOOD
      });
      await service.processReview({
        conceptId: 'easy-concept',
        responseQuality: ResponseQuality.GOOD
      });
      await service.processReview({
        conceptId: 'easy-concept',
        responseQuality: ResponseQuality.GOOD
      });
      
      await service.processReview({
        conceptId: 'hard-concept',
        responseQuality: ResponseQuality.GOOD
      });
      await service.processReview({
        conceptId: 'hard-concept',
        responseQuality: ResponseQuality.GOOD
      });
      await service.processReview({
        conceptId: 'hard-concept',
        responseQuality: ResponseQuality.GOOD
      });
      
      // Now test different qualities on reviewing-phase schedules
      const easyResult = await service.processReview({
        conceptId: 'easy-concept',
        responseQuality: ResponseQuality.EASY
      });
      
      const hardResult = await service.processReview({
        conceptId: 'hard-concept',
        responseQuality: ResponseQuality.HARD
      });
      
      const forgotResult = await service.processReview({
        conceptId: 'forgot-concept',
        responseQuality: ResponseQuality.FORGOT
      });
      
      // Easy should increase ease factor (in reviewing phase) or be at maximum
      expect(easyResult.easeChange.change).toBeGreaterThanOrEqual(0);
      // If no change, it should be because we're at the maximum ease factor
      if (easyResult.easeChange.change === 0) {
        expect(easyResult.easeChange.current).toBe(2.5); // At domain model maximum
      }
      
      // Hard should decrease ease factor
      expect(hardResult.easeChange.change).toBeLessThan(0);
      
      // Forgot should reset interval to 1
      expect(forgotResult.intervalChange.current).toBe(1);
    });
  });

  describe('getSchedule', () => {
    it('should return schedule for existing concept', async () => {
      await service.scheduleForReview({ conceptId: 'concept-1' });
      
      const result = await service.getSchedule('concept-1');
      
      expect(result).toBeDefined();
      expect(result!.conceptId).toBe('concept-1');
    });

    it('should return null for nonexistent concept', async () => {
      const result = await service.getSchedule('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('unschedule', () => {
    it('should remove schedule for existing concept', async () => {
      await service.scheduleForReview({ conceptId: 'concept-1' });
      
      const result = await service.unschedule('concept-1');
      
      expect(result).toBe(true);
      
      // Verify it was removed
      const retrieved = await service.getSchedule('concept-1');
      expect(retrieved).toBeNull();
    });

    it('should return false for nonexistent concept', async () => {
      const result = await service.unschedule('nonexistent');
      
      expect(result).toBe(false);
    });
  });

  // ==================== REVIEW QUERYING ====================

  describe('getDueReviews', () => {
    beforeEach(async () => {
      // Setup test data with different due dates
      const now = new Date();
      
      // Create due schedule (new schedule is due immediately)
      await service.scheduleForReview({ conceptId: 'due-concept' });
      
      // Create overdue schedule
      const overdueSchedule = ReviewSchedule.createNew('overdue-concept');
      const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const overdueTiming = new ReviewTiming(pastDate, null, pastDate);
      const overdueWithTiming = overdueSchedule.withUpdatedTiming(overdueTiming);
      await mockRepository.save(overdueWithTiming);
    });

    it('should return due reviews', async () => {
      const dueReviews = await service.getDueReviews();
      
      expect(dueReviews.length).toBeGreaterThan(0);
      expect(dueReviews.some(r => r.conceptId === 'due-concept')).toBe(true);
    });

    it('should respect limit option', async () => {
      const dueReviews = await service.getDueReviews({ limit: 1 });
      
      expect(dueReviews.length).toBeLessThanOrEqual(1);
    });

    it('should prioritize by difficulty when requested', async () => {
      // Create schedules with different ease factors
      const easySchedule = ReviewSchedule.createNew('easy-concept');
      const easyParams = new ReviewParameters(1, 2.4, 1); // High ease = easy (within valid range)
      await mockRepository.save(easySchedule.withUpdatedParameters(easyParams));
      
      const hardSchedule = ReviewSchedule.createNew('hard-concept');
      const hardParams = new ReviewParameters(1, 1.3, 1); // Low ease = hard (minimum valid ease)
      await mockRepository.save(hardSchedule.withUpdatedParameters(hardParams));
      
      const dueReviews = await service.getDueReviews({ 
        prioritizeByDifficulty: true 
      });
      
      // Hard concepts should come first
      const hardIndex = dueReviews.findIndex(r => r.conceptId === 'hard-concept');
      const easyIndex = dueReviews.findIndex(r => r.conceptId === 'easy-concept');
      
      if (hardIndex !== -1 && easyIndex !== -1) {
        expect(hardIndex).toBeLessThan(easyIndex);
      }
    });
  });

  describe('isDue', () => {
    it('should return true for due concept', async () => {
      await service.scheduleForReview({ conceptId: 'due-concept' });
      
      const isDue = await service.isDue('due-concept');
      
      expect(isDue).toBe(true);
    });

    it('should return false for nonexistent concept', async () => {
      const isDue = await service.isDue('nonexistent');
      
      expect(isDue).toBe(false);
    });

    it('should use custom time when provided', async () => {
      await service.scheduleForReview({ conceptId: 'concept-1' });
      
      // Process a review to move to future due date
      await service.processReview({
        conceptId: 'concept-1',
        responseQuality: ResponseQuality.GOOD
      });
      
      // Get the current schedule to see when it's next due
      const schedule = await service.getSchedule('concept-1');
      const nextDue = schedule!.timing.nextReviewDate;
      
      // Check with time before the due date (should not be due)
      const beforeDue = new Date(nextDue.getTime() - 60 * 60 * 1000); // 1 hour before due
      const isDue = await service.isDue('concept-1', beforeDue);
      
      expect(isDue).toBe(false);
    });
  });

  // ==================== PLANNING AND ANALYTICS ====================

  describe('getReviewPlan', () => {
    beforeEach(async () => {
      // Setup test data
      await service.scheduleForReview({ conceptId: 'concept-1' });
      await service.scheduleForReview({ conceptId: 'concept-2' });
      await service.scheduleForReview({ conceptId: 'concept-3' });
    });

    it('should provide comprehensive review plan', async () => {
      const plan = await service.getReviewPlan();
      
      expect(plan).toBeDefined();
      expect(plan.dueToday).toBeGreaterThanOrEqual(0);
      expect(plan.overdue).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(0);
      expect(plan.byStatus).toBeDefined();
      expect(plan.weeklyProjection).toHaveLength(7);
      
      // Check weekly projection structure
      plan.weeklyProjection.forEach(day => {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
        expect(day.count).toBeGreaterThanOrEqual(0);
        expect(day.estimatedMinutes).toBeGreaterThanOrEqual(0);
      });
    });

    it('should use custom time when provided', async () => {
      const customTime = new Date('2024-01-01T10:00:00Z');
      const plan = await service.getReviewPlan(customTime);
      
      expect(plan.weeklyProjection[0].date).toBe('2024-01-01');
    });
  });

  // ==================== BULK OPERATIONS ====================

  describe('bulkSchedule', () => {
    it('should create schedules for multiple concepts', async () => {
      const options = {
        conceptIds: ['concept-1', 'concept-2', 'concept-3']
      };
      
      const schedules = await service.bulkSchedule(options);
      
      expect(schedules).toHaveLength(3);
      expect(schedules.every(s => s.status === ReviewStatus.NEW)).toBe(true);
      
      // Verify all were saved
      for (const conceptId of options.conceptIds) {
        const retrieved = await service.getSchedule(conceptId);
        expect(retrieved).toBeDefined();
      }
    });

    it('should skip existing schedules when skipExisting is true', async () => {
      // Create one schedule first
      await service.scheduleForReview({ conceptId: 'concept-1' });
      
      const options = {
        conceptIds: ['concept-1', 'concept-2', 'concept-3'],
        skipExisting: true
      };
      
      const schedules = await service.bulkSchedule(options);
      
      expect(schedules).toHaveLength(3); // Should return all 3 (1 existing + 2 new)
      
      // Count total schedules in repository
      const totalCount = await mockRepository.count();
      expect(totalCount).toBe(3);
    });
  });

  describe('suspend and resume', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'concept-1' });
    });

    it('should suspend concept successfully', async () => {
      const result = await service.suspend('concept-1');
      
      expect(result).toBe(true);
      
      const schedule = await service.getSchedule('concept-1');
      expect(schedule!.status).toBe(ReviewStatus.SUSPENDED);
    });

    it('should resume concept successfully', async () => {
      await service.suspend('concept-1');
      
      const result = await service.resume('concept-1');
      
      expect(result).toBe(true);
      
      const schedule = await service.getSchedule('concept-1');
      expect(schedule!.status).not.toBe(ReviewStatus.SUSPENDED);
    });

    it('should return false for nonexistent concept', async () => {
      const suspendResult = await service.suspend('nonexistent');
      const resumeResult = await service.resume('nonexistent');
      
      expect(suspendResult).toBe(false);
      expect(resumeResult).toBe(false);
    });
  });

  // ==================== MAINTENANCE ====================

  describe('cleanupOrphaned', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'valid-1' });
      await service.scheduleForReview({ conceptId: 'valid-2' });
      await service.scheduleForReview({ conceptId: 'invalid-1' });
    });

    it('should remove orphaned schedules', async () => {
      const validConceptIds = ['valid-1', 'valid-2'];
      
      const cleanedCount = await service.cleanupOrphaned(validConceptIds);
      
      expect(cleanedCount).toBe(1); // Should remove invalid-1
      
      const remaining = await mockRepository.count();
      expect(remaining).toBe(2);
    });
  });

  describe('getSystemHealth', () => {
    beforeEach(async () => {
      // Create diverse test data
      await service.scheduleForReview({ conceptId: 'concept-1' });
      await service.scheduleForReview({ conceptId: 'concept-2' });
      await service.scheduleForReview({ conceptId: 'concept-3' });
      
      // Process some reviews to create varied states
      await service.processReview({
        conceptId: 'concept-1',
        responseQuality: ResponseQuality.GOOD
      });
    });

    it('should provide comprehensive system health metrics', async () => {
      const health = await service.getSystemHealth();
      
      expect(health).toBeDefined();
      expect(health.totalConcepts).toBe(3);
      expect(health.totalReviews).toBeGreaterThanOrEqual(1);
      expect(health.averageEaseFactor).toBeGreaterThan(0);
      expect(health.averageInterval).toBeGreaterThan(0);
      expect(health.conceptsByStatus).toBeDefined();
      expect(health.overduePercentage).toBeGreaterThanOrEqual(0);
      expect(health.overduePercentage).toBeLessThanOrEqual(100);
    });
  });

  // ==================== ERROR HANDLING ====================

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Mock repository to throw error on save
      const errorRepo = {
        findByConceptId: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockRejectedValue(new Error('Repository error'))
      } as any;
      
      const errorService = new ReviewSchedulerService(errorRepo);
      
      await expect(errorService.scheduleForReview({ conceptId: 'test' }))
        .rejects.toThrow('Repository error');
    });
  });
});