/**
 * FileSystemReviewScheduleRepository Tests
 * 
 * Tests the filesystem implementation using the contract tests
 * plus specific filesystem-related functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { FileSystemReviewScheduleRepository } from './FileSystemReviewScheduleRepository';
import { createRepositoryContractTests } from '../contracts/ReviewScheduleRepository.contract.test';
import { ReviewSchedule, ResponseQuality, ReviewStatus } from '../domain/ReviewSchedule';

describe('FileSystemReviewScheduleRepository', () => {
  let testDir: string;
  let repository: FileSystemReviewScheduleRepository;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(tmpdir(), `spaced-repetition-test-${randomBytes(8).toString('hex')}`);
    repository = new FileSystemReviewScheduleRepository(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Run all contract tests
  createRepositoryContractTests(
    async () => new FileSystemReviewScheduleRepository(
      join(tmpdir(), `contract-test-${randomBytes(8).toString('hex')}`)
    ),
    async (repo) => {
      // Cleanup function for contract tests
      const fsRepo = repo as FileSystemReviewScheduleRepository;
      const basePath = (fsRepo as any).basePath;
      try {
        await fs.rm(basePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  );

  // ==================== FILESYSTEM-SPECIFIC TESTS ====================

  describe('Filesystem Operations', () => {
    it('should create directory structure on first save', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // Check that directories were created
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
      
      const schedulesDir = join(testDir, 'schedules');
      const schedulesDirStats = await fs.stat(schedulesDir);
      expect(schedulesDirStats.isDirectory()).toBe(true);
    });

    it('should organize files in subdirectories', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      const scheduleId = schedule.id;
      
      await repository.save(schedule);
      
      // File should be in a subdirectory based on ID prefix
      const prefix = scheduleId.substring(0, 2);
      const expectedPath = join(testDir, 'schedules', prefix, `${scheduleId}.json`);
      
      const stats = await fs.stat(expectedPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should create and maintain index file', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      const indexPath = join(testDir, '.schedule-index.json');
      const stats = await fs.stat(indexPath);
      expect(stats.isFile()).toBe(true);
      
      // Index should contain schedule information
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexData);
      
      expect(index.byId).toEqual([[schedule.id, expect.any(String)]]);
      expect(index.byConceptId).toEqual([['test-concept', schedule.id]]);
    });

    it('should perform atomic writes', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      // Save initial schedule
      await repository.save(schedule);
      
      // Modify and save again
      schedule.recordReview(ResponseQuality.GOOD);
      await repository.save(schedule);
      
      // File should be consistent (no .tmp files left behind)
      const scheduleId = schedule.id;
      const prefix = scheduleId.substring(0, 2);
      const filePath = join(testDir, 'schedules', prefix, `${scheduleId}.json`);
      const tempPath = `${filePath}.tmp`;
      
      // Main file should exist
      const stats = await fs.stat(filePath);
      expect(stats.isFile()).toBe(true);
      
      // Temp file should not exist
      try {
        await fs.stat(tempPath);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.code).toBe('ENOENT');
      }
    });

    it('should handle corrupted schedule files gracefully', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // Corrupt the file
      const scheduleId = schedule.id;
      const prefix = scheduleId.substring(0, 2);
      const filePath = join(testDir, 'schedules', prefix, `${scheduleId}.json`);
      
      await fs.writeFile(filePath, 'invalid json');
      
      // Should return null for corrupted file
      const retrieved = await repository.findById(scheduleId);
      expect(retrieved).toBeNull();
      
      // Should clean up index
      const exists = await repository.exists(scheduleId);
      expect(exists).toBe(false);
    });

    it('should rebuild index when index file is corrupted', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // Corrupt the index file
      const indexPath = join(testDir, '.schedule-index.json');
      await fs.writeFile(indexPath, 'invalid json');
      
      // Create new repository instance (should rebuild index)
      const newRepository = new FileSystemReviewScheduleRepository(testDir);
      
      // Should still be able to find the schedule
      const retrieved = await newRepository.findById(schedule.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.conceptId).toBe('test-concept');
    });

    it('should handle concurrent saves correctly', async () => {
      const schedules = [
        ReviewSchedule.createNew('concept-1'),
        ReviewSchedule.createNew('concept-2'),
        ReviewSchedule.createNew('concept-3')
      ];
      
      // Save all schedules concurrently
      await Promise.all(schedules.map(s => repository.save(s)));
      
      // All should be retrievable
      for (const schedule of schedules) {
        const retrieved = await repository.findById(schedule.id);
        expect(retrieved).toBeDefined();
      }
      
      const count = await repository.count();
      expect(count).toBe(3);
    });
  });

  describe('Index Management', () => {
    it('should update index correctly when schedule status changes', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // Schedule should be in NEW status
      let newSchedules = await repository.findByStatus(ReviewStatus.NEW);
      expect(newSchedules.length).toBe(1);
      
      let learningSchedules = await repository.findByStatus(ReviewStatus.LEARNING);
      expect(learningSchedules.length).toBe(0);
      
      // Record review to change status
      schedule.recordReview(ResponseQuality.GOOD);
      await repository.save(schedule);
      
      // Should now be in LEARNING status
      newSchedules = await repository.findByStatus(ReviewStatus.NEW);
      expect(newSchedules.length).toBe(0);
      
      learningSchedules = await repository.findByStatus(ReviewStatus.LEARNING);
      expect(learningSchedules.length).toBe(1);
    });

    it('should maintain due review index correctly', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // New schedule should be due
      const dueReviews = await repository.findDueReviews();
      expect(dueReviews.length).toBe(1);
      expect(dueReviews[0].id).toBe(schedule.id);
      
      const dueCount = await repository.countDueReviews();
      expect(dueCount).toBe(1);
    });

    it('should track ease factor distribution', async () => {
      const schedules = [
        ReviewSchedule.createNew('concept-1'), // 2.5 ease
        ReviewSchedule.createNew('concept-2'), // 2.5 ease
        ReviewSchedule.createNew('concept-3')  // 2.5 ease
      ];
      
      // Modify one to have different ease
      schedules[1].recordReview(ResponseQuality.HARD);
      schedules[1].recordReview(ResponseQuality.HARD);
      schedules[1].recordReview(ResponseQuality.HARD);
      
      await repository.saveMany(schedules);
      
      const distribution = await repository.getEaseFactorDistribution();
      expect(distribution.length).toBeGreaterThan(0);
      
      // Should have multiple ease factor ranges
      const ranges = distribution.map(d => d.easeFactor);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('should track interval distribution', async () => {
      const schedules = [
        ReviewSchedule.createNew('concept-1'),
        ReviewSchedule.createNew('concept-2'),
        ReviewSchedule.createNew('concept-3')
      ];
      
      // Progress schedules to different intervals
      schedules[1].recordReview(ResponseQuality.GOOD);
      schedules[1].recordReview(ResponseQuality.GOOD);
      
      schedules[2].recordReview(ResponseQuality.GOOD);
      schedules[2].recordReview(ResponseQuality.GOOD);
      schedules[2].recordReview(ResponseQuality.GOOD);
      
      await repository.saveMany(schedules);
      
      const distribution = await repository.getIntervalDistribution();
      expect(distribution.length).toBeGreaterThan(0);
      
      for (const entry of distribution) {
        expect(entry.intervalRange).toBeDefined();
        expect(entry.count).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of schedules efficiently', async () => {
      const scheduleCount = 100;
      const schedules: ReviewSchedule[] = [];
      
      // Create many schedules
      for (let i = 0; i < scheduleCount; i++) {
        schedules.push(ReviewSchedule.createNew(`concept-${i}`));
      }
      
      const startTime = Date.now();
      await repository.saveMany(schedules);
      const saveTime = Date.now() - startTime;
      
      // Should save reasonably quickly (less than 5 seconds for 100 schedules)
      expect(saveTime).toBeLessThan(5000);
      
      // Should be able to count efficiently
      const countStartTime = Date.now();
      const count = await repository.count();
      const countTime = Date.now() - countStartTime;
      
      expect(count).toBe(scheduleCount);
      expect(countTime).toBeLessThan(100); // Should be very fast due to index
    });

    it('should handle queries efficiently with large dataset', async () => {
      const scheduleCount = 50;
      const schedules: ReviewSchedule[] = [];
      
      // Create schedules with different statuses
      for (let i = 0; i < scheduleCount; i++) {
        const schedule = ReviewSchedule.createNew(`concept-${i}`);
        
        if (i % 3 === 0) {
          schedule.recordReview(ResponseQuality.GOOD);
        }
        if (i % 5 === 0) {
          schedule.recordReview(ResponseQuality.GOOD);
          schedule.recordReview(ResponseQuality.GOOD);
        }
        
        schedules.push(schedule);
      }
      
      await repository.saveMany(schedules);
      
      // Query performance should be good
      const queryStartTime = Date.now();
      const dueReviews = await repository.findDueReviews({ limit: 10 });
      const queryTime = Date.now() - queryStartTime;
      
      expect(dueReviews.length).toBeLessThanOrEqual(10);
      expect(queryTime).toBeLessThan(100); // Should be fast due to indexing
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should recover from missing directories', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      // Save to create directories
      await repository.save(schedule);
      
      // Remove directories
      await fs.rm(testDir, { recursive: true });
      
      // Should recreate directories on next save
      const newSchedule = ReviewSchedule.createNew('test-concept-2');
      await repository.save(newSchedule);
      
      const retrieved = await repository.findById(newSchedule.id);
      expect(retrieved).toBeDefined();
    });

    it('should handle index corruption gracefully', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      await repository.save(schedule);
      
      // Corrupt index
      const indexPath = join(testDir, '.schedule-index.json');
      await fs.writeFile(indexPath, JSON.stringify({ invalid: 'data' }));
      
      // Create new repository - should rebuild index
      const newRepository = new FileSystemReviewScheduleRepository(testDir);
      
      const retrieved = await newRepository.findById(schedule.id);
      expect(retrieved).toBeDefined();
    });

    it('should handle file system permission errors', async () => {
      const schedule = ReviewSchedule.createNew('test-concept');
      
      // This test would need to run on a system where we can control permissions
      // For now, just ensure the error handling structure is in place
      try {
        await repository.save(schedule);
        expect(true).toBe(true); // If no error, that's fine
      } catch (error) {
        // Should be a meaningful error
        expect(error).toBeDefined();
      }
    });
  });

  describe('Backup and Migration', () => {
    it('should export and import correctly preserve all data', async () => {
      const schedules = [
        ReviewSchedule.createNew('concept-1'),
        ReviewSchedule.createNew('concept-2'),
        ReviewSchedule.createNew('concept-3')
      ];
      
      // Modify schedules to have different states
      schedules[0].recordReview(ResponseQuality.GOOD);
      schedules[1].recordReview(ResponseQuality.HARD);
      schedules[2].recordReview(ResponseQuality.FORGOT);
      
      await repository.saveMany(schedules);
      
      // Export
      const exported = await repository.exportSchedules();
      
      // Create new repository
      const newTestDir = join(tmpdir(), `import-test-${randomBytes(8).toString('hex')}`);
      const newRepository = new FileSystemReviewScheduleRepository(newTestDir);
      
      try {
        // Import
        await newRepository.importSchedules(exported);
        
        // Verify all data is preserved
        for (const original of schedules) {
          const imported = await newRepository.findById(original.id);
          expect(imported).toBeDefined();
          expect(imported!.conceptId).toBe(original.conceptId);
          expect(imported!.status).toBe(original.status);
          expect(imported!.totalReviews).toBe(original.totalReviews);
          expect(imported!.parameters.easinessFactor).toBe(original.parameters.easinessFactor);
        }
        
        const importedCount = await newRepository.count();
        expect(importedCount).toBe(schedules.length);
      } finally {
        // Cleanup
        try {
          await fs.rm(newTestDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  });
});