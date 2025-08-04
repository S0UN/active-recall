import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import { IBatcherService } from "./network/IBatcherService";
import { IClassificationService } from "./analysis/IClassificationService";
import { VisionService } from "./processing/impl/VisionService";
import { ICache } from "../utils/ICache";

describe('Orchestrator - Batcher Integration', () => {
  let orchestrator: Orchestrator;
  let mockBatcher: IBatcherService;
  let mockClassifier: IClassificationService;
  let mockVisionService: VisionService;
  let mockCache: ICache<string, { mode: string; lastClassified: number }>;

  beforeEach(() => {
    mockBatcher = {
      add: vi.fn(),
      flushIfNeeded: vi.fn(),
      getBatches: vi.fn().mockReturnValue([]),
      getBatchesAsJson: vi.fn().mockReturnValue('{"batches":[]}'),
      clearBatches: vi.fn(),
    };

    mockClassifier = {
      classify: vi.fn(),
    };

    mockVisionService = {
      captureAndRecognizeText: vi.fn(),
    } as any;

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      startTTL: vi.fn(),
    };

    const mockPollers = {
      setOnTick: vi.fn(),
      setOnChange: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Create orchestrator with mocked dependencies
    orchestrator = new Orchestrator(
      mockCache,
      mockVisionService,
      mockPollers as any, // windowPoller
      mockPollers as any, // studyingOcrPoller
      mockPollers as any, // idleRevalPoller
      mockClassifier,
      mockBatcher,
      mockLogger as any, // logger
      { newWindowPipelineDelayMs: 15000 } as any, // config
      {} as any  // modelFactory
    );
  });

  describe('processStudyingContent', () => {
    it('should call batcher.add with window title, topic label, and text when mode is not idle', async () => {
      orchestrator.currentWindow = 'VS Code - main.ts';
      
      await (orchestrator as any).processStudyingContent('computer science', 'export class Main {}');
      
      expect(mockBatcher.add).toHaveBeenCalledWith(
        'VS Code - main.ts',
        'computer science', 
        'export class Main {}'
      );
      expect(mockBatcher.flushIfNeeded).toHaveBeenCalled();
    });

    it('should not call batcher.add when mode is idle', async () => {
      orchestrator.currentWindow = 'Netflix - Show';
      
      await (orchestrator as any).processStudyingContent('idle', 'Video streaming content');
      
      expect(mockBatcher.add).not.toHaveBeenCalled();
      expect(mockBatcher.flushIfNeeded).not.toHaveBeenCalled();
    });

    it('should handle different topic labels correctly', async () => {
      orchestrator.currentWindow = 'Chrome - Biology Textbook';
      
      await (orchestrator as any).processStudyingContent('biology', 'Cell division occurs through mitosis');
      
      expect(mockBatcher.add).toHaveBeenCalledWith(
        'Chrome - Biology Textbook',
        'biology',
        'Cell division occurs through mitosis'
      );
    });

    it('should handle mathematics topic', async () => {
      orchestrator.currentWindow = 'PDF Reader - Calculus Book';
      
      await (orchestrator as any).processStudyingContent('mathematics', 'Derivative of x^2 is 2x');
      
      expect(mockBatcher.add).toHaveBeenCalledWith(
        'PDF Reader - Calculus Book',
        'mathematics',
        'Derivative of x^2 is 2x'
      );
    });
  });
});