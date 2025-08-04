import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatcherService } from './BatcherService';

describe('BatcherService', () => {
  let batcherService: BatcherService;

  beforeEach(() => {
    batcherService = new BatcherService();
  });

  describe('add', () => {
    it('should add first batch entry with window title, topic label, and text', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual({
        window: 'VS Code - main.ts',
        topic: 'computer science',
        entries: [
          { text: 'export class Main {}' }
        ]
      });
    });

    it('should not duplicate window title when consecutive entries have same window', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('VS Code - main.ts', 'computer science', 'constructor() {}');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual({
        window: 'VS Code - main.ts',
        topic: 'computer science',
        entries: [
          { text: 'export class Main {}' },
          { text: 'constructor() {}' }
        ]
      });
    });

    it('should add new window title when window changes', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('Chrome - Documentation', 'computer science', 'React components guide');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(2);
      expect(batches[0]).toEqual({
        window: 'VS Code - main.ts',
        topic: 'computer science',
        entries: [{ text: 'export class Main {}' }]
      });
      expect(batches[1]).toEqual({
        window: 'Chrome - Documentation',
        topic: 'computer science',
        entries: [{ text: 'React components guide' }]
      });
    });

    it('should track topic label changes and create new batch when topic changes', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('VS Code - main.ts', 'biology', 'Cell division occurs through mitosis');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(2);
      expect(batches[0]).toEqual({
        window: 'VS Code - main.ts',
        topic: 'computer science',
        entries: [{ text: 'export class Main {}' }]
      });
      expect(batches[1]).toEqual({
        window: 'VS Code - main.ts',
        topic: 'biology',
        entries: [{ text: 'Cell division occurs through mitosis' }]
      });
    });

    it('should not duplicate topic label when it does not change', () => {
      batcherService.add('Chrome - Tutorial', 'computer science', 'JavaScript basics');
      batcherService.add('Chrome - Tutorial', 'computer science', 'Advanced JavaScript');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual({
        window: 'Chrome - Tutorial',
        topic: 'computer science',
        entries: [
          { text: 'JavaScript basics' },
          { text: 'Advanced JavaScript' }
        ]
      });
    });

    it('should handle idle classification appropriately', () => {
      batcherService.add('Netflix - Show', 'idle', 'Video streaming content');
      batcherService.add('Netflix - Show', 'idle', 'More video content');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual({
        window: 'Netflix - Show',
        topic: 'idle',
        entries: [
          { text: 'Video streaming content' },
          { text: 'More video content' }
        ]
      });
    });

    it('should handle transition from idle to studying topic', () => {
      batcherService.add('Chrome - News', 'idle', 'Breaking news article');
      batcherService.add('Chrome - News', 'biology', 'New research in genetics');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(2);
      expect(batches[0]).toEqual({
        window: 'Chrome - News',
        topic: 'idle',
        entries: [{ text: 'Breaking news article' }]
      });
      expect(batches[1]).toEqual({
        window: 'Chrome - News',
        topic: 'biology',
        entries: [{ text: 'New research in genetics' }]
      });
    });

    it('should handle empty text gracefully', () => {
      batcherService.add('VS Code - empty.ts', 'computer science', '');
      
      const batches = batcherService.getBatches();
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual({
        window: 'VS Code - empty.ts',
        topic: 'computer science',
        entries: [{ text: '' }]
      });
    });
  });

  describe('getBatchesAsJson', () => {
    it('should produce correct JSON format without timestamps', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('VS Code - main.ts', 'computer science', 'constructor() {}');
      batcherService.add('Chrome - Biology', 'biology', 'Cell structure');
      
      const json = batcherService.getBatchesAsJson();
      const parsed = JSON.parse(json);
      
      expect(parsed).toEqual({
        batches: [
          {
            window: 'VS Code - main.ts',
            topic: 'computer science',
            entries: [
              { text: 'export class Main {}' },
              { text: 'constructor() {}' }
            ]
          },
          {
            window: 'Chrome - Biology',
            topic: 'biology',
            entries: [
              { text: 'Cell structure' }
            ]
          }
        ]
      });
    });

    it('should return empty batches structure when no entries exist', () => {
      const json = batcherService.getBatchesAsJson();
      const parsed = JSON.parse(json);
      
      expect(parsed).toEqual({
        batches: []
      });
    });
  });

  describe('clearBatches', () => {
    it('should clear all batches', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('Chrome - Biology', 'biology', 'Cell structure');
      
      expect(batcherService.getBatches()).toHaveLength(2);
      
      batcherService.clearBatches();
      
      expect(batcherService.getBatches()).toHaveLength(0);
      expect(batcherService.getBatchesAsJson()).toBe('{"batches":[]}');
    });
  });

  describe('auto-flush functionality', () => {
    it('should auto-flush when character threshold is exceeded', () => {
      const flushThreshold = 100; // Small threshold for testing
      const batcherService = new BatcherService();
      batcherService.setFlushThreshold(flushThreshold);
      
      // Mock flushIfNeeded to verify it gets called
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add text that exceeds the threshold
      const longText = 'a'.repeat(120); // Exceeds 100 character threshold
      batcherService.add('Test Window', 'test topic', longText);
      
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should not auto-flush when under character threshold', () => {
      const flushThreshold = 1000; // Large threshold
      const batcherService = new BatcherService();
      batcherService.setFlushThreshold(flushThreshold);
      
      // Mock flushIfNeeded to verify it doesn't get called
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add small text that doesn't exceed threshold
      batcherService.add('Test Window', 'test topic', 'small text');
      
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should calculate total characters including window titles and topics', () => {
      const flushThreshold = 30; // Very small threshold for testing
      const batcherService = new BatcherService();
      batcherService.setFlushThreshold(flushThreshold);
      
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add entries where the combined window + topic + text exceeds threshold
      // 'Long Window Title' (17) + 'long topic name' (15) + 'some text here for testing' (26) = 58 chars
      batcherService.add('Long Window Title', 'long topic name', 'some text here for testing');
      
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should use default threshold when none provided', () => {
      const batcherService = new BatcherService(); // Uses default 10KB threshold
      
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add normal text that won't exceed 10KB
      batcherService.add('Test Window', 'test topic', 'normal text');
      
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should accumulate characters across multiple batches', () => {
      const flushThreshold = 50;
      const batcherService = new BatcherService();
      batcherService.setFlushThreshold(flushThreshold);
      
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add multiple entries that individually are small but together exceed threshold
      // Each entry: 'Window1' (7) + 'topic1' (6) + 'text1' (5) = 18 chars
      // Total after 3 entries: 54 chars > 50 threshold
      batcherService.add('Window1', 'topic1', 'text1');
      batcherService.add('Window2', 'topic2', 'text2');
      batcherService.add('Window3', 'topic3', 'text3');
      
      expect(flushSpy).toHaveBeenCalled();
    });
  });
});