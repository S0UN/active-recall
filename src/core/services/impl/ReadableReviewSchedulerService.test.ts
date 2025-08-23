/**
 * Tests for Readable Review Scheduler Service
 * 
 * These tests verify that the refactored service maintains the same functionality
 * as the original implementation while being much more readable and maintainable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadableReviewSchedulerService } from './ReadableReviewSchedulerService';
import { 
  IReviewScheduleRepository,
  ScheduleStatistics
} from '../../spaced-repetition/contracts/IReviewScheduleRepository';
import { 
  ReviewSchedule, 
  ResponseQuality, 
  ReviewStatus 
} from '../../spaced-repetition/domain/ReviewSchedule';
import { SM2Algorithm } from '../../spaced-repetition/algorithms/SM2Algorithm';

// Use the same mock repository from the original tests
class MockReviewScheduleRepository implements IReviewScheduleRepository {
  private schedules = new Map<string, ReviewSchedule>();

  async save(schedule: ReviewSchedule): Promise<void> {
    this.schedules.set(schedule.id, schedule);
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
    return this.schedules.delete(id);
  }

  async deleteByConceptId(conceptId: string): Promise<boolean> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      return this.schedules.delete(schedule.id);
    }
    return false;
  }

  async findDueReviews(query?: any): Promise<ReviewSchedule[]> {
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
        this.schedules.delete(schedule.id);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  async resetAbandoned(daysAbandoned: number): Promise<number> {
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

  // Minimal implementations for remaining required methods
  async saveMany(schedules: ReviewSchedule[]): Promise<void> {
    for (const schedule of schedules) {
      await this.save(schedule);
    }
  }

  async findByStatus(): Promise<ReviewSchedule[]> { return []; }
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

  clear(): void {
    this.schedules.clear();
  }
}

describe('ReadableReviewSchedulerService', () => {
  let service: ReadableReviewSchedulerService;
  let mockRepository: MockReviewScheduleRepository;
  let algorithm: SM2Algorithm;

  beforeEach(() => {
    mockRepository = new MockReviewScheduleRepository();
    algorithm = new SM2Algorithm();
    service = new ReadableReviewSchedulerService(mockRepository, algorithm);
  });

  afterEach(() => {
    mockRepository.clear();
  });

  describe('scheduling concepts for review', () => {
    it('should create a new schedule when concept is not yet scheduled', async () => {
      const schedule = await service.scheduleForReview({ 
        conceptId: 'introduction-to-algorithms' 
      });
      
      expect(schedule.conceptId).toBe('introduction-to-algorithms');
      expect(schedule.status).toBe(ReviewStatus.NEW);
      
      const retrievedSchedule = await service.getSchedule('introduction-to-algorithms');
      expect(retrievedSchedule?.id).toBe(schedule.id);
    });

    it('should return existing schedule when concept is already scheduled', async () => {
      const firstScheduling = await service.scheduleForReview({ 
        conceptId: 'data-structures' 
      });
      
      const secondScheduling = await service.scheduleForReview({ 
        conceptId: 'data-structures' 
      });
      
      expect(secondScheduling.id).toBe(firstScheduling.id);
    });

    it('should apply custom parameters when provided', async () => {
      const schedule = await service.scheduleForReview({
        conceptId: 'advanced-algorithms',
        customParameters: {
          initialEaseFactor: 2.2,
          initialInterval: 2
        }
      });
      
      expect(schedule.parameters.easinessFactor).toBe(2.2);
      expect(schedule.parameters.interval).toBe(2);
    });
  });

  describe('processing review responses', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'binary-trees' });
    });

    it('should update schedule when processing good response', async () => {
      const result = await service.processReview({
        conceptId: 'binary-trees',
        responseQuality: ResponseQuality.GOOD
      });
      
      expect(result.schedule.conceptId).toBe('binary-trees');
      expect(result.schedule.totalReviews).toBe(1);
      expect(result.statusChanged).toBe(true);
      expect(result.nextReviewDate).toBeInstanceOf(Date);
    });

    it('should throw meaningful error when concept is not scheduled', async () => {
      await expect(service.processReview({
        conceptId: 'nonexistent-concept',
        responseQuality: ResponseQuality.GOOD
      })).rejects.toThrow('No review schedule found for concept: nonexistent-concept');
    });

    it('should track interval and difficulty changes', async () => {
      await service.processReview({
        conceptId: 'binary-trees',
        responseQuality: ResponseQuality.GOOD
      });
      
      await service.processReview({
        conceptId: 'binary-trees',
        responseQuality: ResponseQuality.GOOD
      });
      
      const result = await service.processReview({
        conceptId: 'binary-trees',
        responseQuality: ResponseQuality.EASY
      });
      
      expect(result.intervalChange.change).toBeGreaterThanOrEqual(0);
      expect(result.easeChange.change).toBeGreaterThanOrEqual(0);
    });
  });

  describe('finding due reviews for study sessions', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'sorting-algorithms' });
      await service.scheduleForReview({ conceptId: 'graph-traversal' });
      await service.scheduleForReview({ conceptId: 'dynamic-programming' });
    });

    it('should find due reviews without filtering', async () => {
      const dueReviews = await service.getDueReviews();
      
      expect(dueReviews.length).toBeGreaterThan(0);
      expect(dueReviews.some(r => r.conceptId === 'sorting-algorithms')).toBe(true);
    });

    it('should respect study session limits', async () => {
      const limitedReviews = await service.getDueReviews({ limit: 2 });
      
      expect(limitedReviews.length).toBeLessThanOrEqual(2);
    });

    it('should prioritize difficult concepts when requested', async () => {
      const prioritizedReviews = await service.getDueReviews({
        prioritizeByDifficulty: true
      });
      
      expect(prioritizedReviews.length).toBeGreaterThan(0);
    });
  });

  describe('bulk scheduling operations', () => {
    it('should schedule multiple concepts efficiently', async () => {
      const conceptIds = [
        'machine-learning-basics',
        'neural-networks',
        'deep-learning',
        'computer-vision'
      ];
      
      const schedules = await service.bulkSchedule({ conceptIds });
      
      expect(schedules).toHaveLength(4);
      expect(schedules.every(s => s.status === ReviewStatus.NEW)).toBe(true);
      
      for (const conceptId of conceptIds) {
        const schedule = await service.getSchedule(conceptId);
        expect(schedule).toBeDefined();
      }
    });

    it('should skip existing concepts when requested', async () => {
      await service.scheduleForReview({ conceptId: 'linear-algebra' });
      
      const schedules = await service.bulkSchedule({
        conceptIds: ['linear-algebra', 'calculus', 'statistics'],
        skipExisting: true
      });
      
      expect(schedules).toHaveLength(3);
      
      const totalCount = await mockRepository.count();
      expect(totalCount).toBe(3);
    });
  });

  describe('concept management operations', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'probability-theory' });
    });

    it('should suspend and resume concepts', async () => {
      const suspendResult = await service.suspend('probability-theory');
      expect(suspendResult).toBe(true);
      
      const suspendedSchedule = await service.getSchedule('probability-theory');
      expect(suspendedSchedule?.status).toBe(ReviewStatus.SUSPENDED);
      
      const resumeResult = await service.resume('probability-theory');
      expect(resumeResult).toBe(true);
      
      const resumedSchedule = await service.getSchedule('probability-theory');
      expect(resumedSchedule?.status).not.toBe(ReviewStatus.SUSPENDED);
    });

    it('should unschedule concepts completely', async () => {
      const unscheduleResult = await service.unschedule('probability-theory');
      expect(unscheduleResult).toBe(true);
      
      const deletedSchedule = await service.getSchedule('probability-theory');
      expect(deletedSchedule).toBeNull();
    });

    it('should handle nonexistent concepts gracefully', async () => {
      const suspendResult = await service.suspend('nonexistent-concept');
      const resumeResult = await service.resume('nonexistent-concept');
      const unscheduleResult = await service.unschedule('nonexistent-concept');
      
      expect(suspendResult).toBe(false);
      expect(resumeResult).toBe(false);
      expect(unscheduleResult).toBe(false);
    });
  });

  describe('review planning and analytics', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'algorithms-analysis' });
      await service.scheduleForReview({ conceptId: 'complexity-theory' });
      await service.scheduleForReview({ conceptId: 'optimization' });
    });

    it('should provide comprehensive review plans', async () => {
      const plan = await service.getReviewPlan();
      
      expect(plan.dueToday).toBeGreaterThanOrEqual(0);
      expect(plan.overdue).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(0);
      expect(plan.byStatus).toBeDefined();
      expect(plan.weeklyProjection).toHaveLength(7);
    });

    it('should estimate study time accurately', async () => {
      const estimatedMinutes = await service.estimateDailyStudyTime();
      expect(estimatedMinutes).toBeGreaterThanOrEqual(0);
    });

    it('should provide system health insights', async () => {
      const health = await service.getSystemHealth();
      
      expect(health.totalConcepts).toBeGreaterThan(0);
      expect(health.averageEaseFactor).toBeGreaterThanOrEqual(0);
      expect(health.averageInterval).toBeGreaterThanOrEqual(0);
      expect(health.conceptsByStatus).toBeDefined();
      expect(health.overduePercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('system maintenance operations', () => {
    beforeEach(async () => {
      await service.scheduleForReview({ conceptId: 'valid-concept-1' });
      await service.scheduleForReview({ conceptId: 'valid-concept-2' });
      await service.scheduleForReview({ conceptId: 'orphaned-concept' });
    });

    it('should clean up orphaned schedules', async () => {
      const validConceptIds = ['valid-concept-1', 'valid-concept-2'];
      
      const cleanedCount = await service.cleanupOrphaned(validConceptIds);
      
      expect(cleanedCount).toBeGreaterThanOrEqual(1);
      
      const remainingCount = await mockRepository.count();
      expect(remainingCount).toBe(2);
    });

    it('should reset abandoned concepts', async () => {
      const resetCount = await service.resetAbandoned(1);
      expect(resetCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('concept scheduling validation', () => {
    it('should reject invalid concept identifiers', async () => {
      await expect(service.scheduleForReview({ conceptId: '' }))
        .rejects.toThrow('ConceptIdentifier cannot be empty');
      
      await expect(service.scheduleForReview({ conceptId: '   ' }))
        .rejects.toThrow('ConceptIdentifier cannot be empty');
    });
  });
});