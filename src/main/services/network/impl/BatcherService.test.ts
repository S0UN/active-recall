import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatcherService } from './BatcherService';
import { Batch, BatchEntry } from '../IBatcherService';

describe('BatcherService', () => {
  let batcherService: BatcherService;

  beforeEach(() => {
    batcherService = new BatcherService();
  });

  // Test data factories for consistent, readable test setup
  const createBatchEntry = (text: string): BatchEntry => ({ text });

  const createExpectedBatch = (window: string, topic: string, texts: string[]): Batch => ({
    window,
    topic,
    entries: texts.map(createBatchEntry)
  });

  const addSampleEntries = {
    programmingSession: () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('VS Code - main.ts', 'computer science', 'constructor() {}');
    },
    crossWindowSession: () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('Chrome - Documentation', 'computer science', 'React components guide');
    },
    crossTopicSession: () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      batcherService.add('VS Code - main.ts', 'biology', 'Cell division occurs through mitosis');
    },
    idleSession: () => {
      batcherService.add('Netflix - Show', 'idle', 'Video streaming content');
      batcherService.add('Netflix - Show', 'idle', 'More video content');
    },
    idleToStudyTransition: () => {
      batcherService.add('Chrome - News', 'idle', 'Breaking news article');
      batcherService.add('Chrome - News', 'biology', 'New research in genetics');
    }
  };

  const expectBatchStructure = {
    toHaveLength: (expectedLength: number) => {
      const batches = batcherService.getBatches();
      expect(batches).toHaveLength(expectedLength);
      return batches;
    },
    toEqual: (expectedBatches: Batch[]) => {
      const batches = batcherService.getBatches();
      expect(batches).toEqual(expectedBatches);
    },
    toMatchJson: (expectedStructure: { batches: Batch[] }) => {
      const json = batcherService.getBatchesAsJson();
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(expectedStructure);
    }
  };

  describe('adding entries', () => {
    it('should create first batch with window, topic, and text', () => {
      batcherService.add('VS Code - main.ts', 'computer science', 'export class Main {}');
      
      expectBatchStructure.toEqual([
        createExpectedBatch('VS Code - main.ts', 'computer science', ['export class Main {}'])
      ]);
    });

    it('should group entries with same window and topic into single batch', () => {
      addSampleEntries.programmingSession();
      
      expectBatchStructure.toEqual([
        createExpectedBatch('VS Code - main.ts', 'computer science', 
          ['export class Main {}', 'constructor() {}'])
      ]);
    });

    it('should create separate batches when window changes', () => {
      addSampleEntries.crossWindowSession();
      
      expectBatchStructure.toEqual([
        createExpectedBatch('VS Code - main.ts', 'computer science', ['export class Main {}']),
        createExpectedBatch('Chrome - Documentation', 'computer science', ['React components guide'])
      ]);
    });

    it('should create separate batches when topic changes', () => {
      addSampleEntries.crossTopicSession();
      
      expectBatchStructure.toEqual([
        createExpectedBatch('VS Code - main.ts', 'computer science', ['export class Main {}']),
        createExpectedBatch('VS Code - main.ts', 'biology', ['Cell division occurs through mitosis'])
      ]);
    });

    it('should group consecutive entries with same window and topic', () => {
      batcherService.add('Chrome - Tutorial', 'computer science', 'JavaScript basics');
      batcherService.add('Chrome - Tutorial', 'computer science', 'Advanced JavaScript');
      
      expectBatchStructure.toEqual([
        createExpectedBatch('Chrome - Tutorial', 'computer science', 
          ['JavaScript basics', 'Advanced JavaScript'])
      ]);
    });

    it('should handle idle classification sessions', () => {
      addSampleEntries.idleSession();
      
      expectBatchStructure.toEqual([
        createExpectedBatch('Netflix - Show', 'idle', 
          ['Video streaming content', 'More video content'])
      ]);
    });

    it('should create separate batches when transitioning from idle to studying', () => {
      addSampleEntries.idleToStudyTransition();
      
      expectBatchStructure.toEqual([
        createExpectedBatch('Chrome - News', 'idle', ['Breaking news article']),
        createExpectedBatch('Chrome - News', 'biology', ['New research in genetics'])
      ]);
    });

    it('should handle empty text gracefully', () => {
      batcherService.add('VS Code - empty.ts', 'computer science', '');
      
      expectBatchStructure.toEqual([
        createExpectedBatch('VS Code - empty.ts', 'computer science', [''])
      ]);
    });
  });

  describe('JSON serialization', () => {
    it('should produce correct JSON format for multi-batch session', () => {
      addSampleEntries.programmingSession();
      batcherService.add('Chrome - Biology', 'biology', 'Cell structure');
      
      expectBatchStructure.toMatchJson({
        batches: [
          createExpectedBatch('VS Code - main.ts', 'computer science', 
            ['export class Main {}', 'constructor() {}']),
          createExpectedBatch('Chrome - Biology', 'biology', ['Cell structure'])
        ]
      });
    });

    it('should return empty batches structure when no entries exist', () => {
      expectBatchStructure.toMatchJson({ batches: [] });
    });
  });

  describe('batch management', () => {
    it('should clear all batches and reset state', () => {
      addSampleEntries.crossTopicSession();
      expectBatchStructure.toHaveLength(2);
      
      batcherService.clearBatches();
      
      expectBatchStructure.toHaveLength(0);
      expectBatchStructure.toMatchJson({ batches: [] });
    });
  });

  describe('auto-flush functionality', () => {
    const createServiceWithThreshold = (threshold: number) => {
      const service = new BatcherService();
      service.setFlushThreshold(threshold);
      return service;
    };

    const createFlushSpy = (service: BatcherService) => {
      return vi.spyOn(service, 'flushIfNeeded');
    };

    const expectFlushToBeCalled = (spy: any) => {
      expect(spy).toHaveBeenCalled();
    };

    const expectFlushNotToBeCalled = (spy: any) => {
      expect(spy).not.toHaveBeenCalled();
    };

    it('should auto-flush when character threshold is exceeded', () => {
      const service = createServiceWithThreshold(100);
      const flushSpy = createFlushSpy(service);
      
      const longText = 'a'.repeat(120); // Exceeds 100 character threshold
      service.add('Test Window', 'test topic', longText);
      
      expectFlushToBeCalled(flushSpy);
    });

    it('should not auto-flush when under character threshold', () => {
      const service = createServiceWithThreshold(1000);
      const flushSpy = createFlushSpy(service);
      
      service.add('Test Window', 'test topic', 'small text');
      
      expectFlushNotToBeCalled(flushSpy);
    });

    it('should calculate total characters including window titles and topics', () => {
      const service = createServiceWithThreshold(30);
      const flushSpy = createFlushSpy(service);
      
      // Combined: 'Long Window Title' (17) + 'long topic name' (15) + 'some text here for testing' (26) = 58 chars > 30
      service.add('Long Window Title', 'long topic name', 'some text here for testing');
      
      expectFlushToBeCalled(flushSpy);
    });

    it('should use default threshold when none provided', () => {
      const service = new BatcherService(); // Uses default 10KB threshold
      const flushSpy = createFlushSpy(service);
      
      service.add('Test Window', 'test topic', 'normal text');
      
      expectFlushNotToBeCalled(flushSpy);
    });

    it('should accumulate characters across multiple batches', () => {
      const service = createServiceWithThreshold(50);
      const flushSpy = createFlushSpy(service);
      
      // Each entry: 'Window1' (7) + 'topic1' (6) + 'text1' (5) = 18 chars
      // Total after 3 entries: 54 chars > 50 threshold
      service.add('Window1', 'topic1', 'text1');
      service.add('Window2', 'topic2', 'text2');
      service.add('Window3', 'topic3', 'text3');
      
      expectFlushToBeCalled(flushSpy);
    });
  });
});