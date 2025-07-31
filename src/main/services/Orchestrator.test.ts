import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import { WindowChangePoller } from "./polling/impl/WindowChangePoller";
import { StudyingOCRPoller } from "./polling/impl/StudyingOCRPoller";
import { IdleRevalidationPoller } from "./polling/impl/IdleRevalidationPoller";
import { IClassificationService } from "./analysis/IClassificationService";
import { IBatcherService } from "./network/IBatcherService";
import { VisionService } from "./processing/impl/VisionService";
import { ICache } from "../utils/ICache";
import { ConfigService } from "../configs/ConfigService";
import { ILogger } from "../utils/ILogger";
import {  CacheError } from "../errors/CustomErrors";

// Test Helpers - Mock Factories
const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createMockCache = (): ICache<string, { mode: string; lastClassified: number }> => ({
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  startTTL: vi.fn(),
});

const createMockVisionService = (): VisionService => ({
  captureAndRecognizeText: vi.fn(),
} as any);

const createMockWindowPoller = (): WindowChangePoller => ({
  setOnChange: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
} as any);

const createMockStudyingOcrPoller = (): StudyingOCRPoller => ({
  setOnTick: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
} as any);

const createMockIdleRevalidationPoller = (): IdleRevalidationPoller => ({
  setOnTick: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
} as any);

const createMockClassifier = (): IClassificationService => ({
  classify: vi.fn(),
});

const createMockBatcher = (): IBatcherService => ({
  add: vi.fn(),
  flushIfNeeded: vi.fn(),
});

const createMockConfig = (): ConfigService => ({
  windowChangeIntervalMs: 1000,
  studyingOcrIntervalMs: 5000,
  idleRevalidationIntervalMs: 30000,
  idleRevalidationThresholdMs: 900000,
  windowCacheTTL: 900000,
});

// Test Helpers - Setup Functions
const setupCacheEntry = (mockCache: ICache<string, { mode: string; lastClassified: number }>, mode: string, timestamp?: number): void => {
  const entry = { mode, lastClassified: timestamp || Date.now() };
  vi.mocked(mockCache.get).mockReturnValue(entry);
  vi.mocked(mockCache.has).mockReturnValue(true);
};

const setupVisionPipeline = (mockVision: VisionService, mockClassifier: IClassificationService, text: string, classification: string): void => {
  vi.mocked(mockVision.captureAndRecognizeText).mockResolvedValue(text);
  vi.mocked(mockClassifier.classify).mockResolvedValue(classification);
};

const expectCacheUpdate = (mockCache: ICache<string, { mode: string; lastClassified: number }>, windowId: string, mode: string): void => {
  expect(mockCache.set).toHaveBeenCalledWith(windowId, {
    mode,
    lastClassified: expect.any(Number)
  });
};

const expectPollerCallbacks = (mockIdlePoller: IdleRevalidationPoller, mockWindowPoller: WindowChangePoller, mockStudyingPoller: StudyingOCRPoller): void => {
  expect(mockIdlePoller.setOnTick).toHaveBeenCalledWith(expect.any(Function));
  expect(mockWindowPoller.setOnChange).toHaveBeenCalledWith(expect.any(Function));
  expect(mockStudyingPoller.setOnTick).toHaveBeenCalledWith(expect.any(Function));
};

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;
  let mockCache: ICache<string, { mode: string; lastClassified: number }>;
  let mockVisionService: VisionService;
  let mockWindowPoller: WindowChangePoller;
  let mockStudyingOcrPoller: StudyingOCRPoller;
  let mockIdleRevalPoller: IdleRevalidationPoller;
  let mockClassifier: IClassificationService;
  let mockBatcher: IBatcherService;
  let mockLogger: ILogger;
  let mockConfig: ConfigService;

  beforeEach(() => {
    mockCache = createMockCache();
    mockVisionService = createMockVisionService();
    mockWindowPoller = createMockWindowPoller();
    mockStudyingOcrPoller = createMockStudyingOcrPoller();
    mockIdleRevalPoller = createMockIdleRevalidationPoller();
    mockClassifier = createMockClassifier();
    mockBatcher = createMockBatcher();
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();

    orchestrator = new Orchestrator(
      mockCache,
      mockVisionService,
      mockWindowPoller,
      mockStudyingOcrPoller,
      mockIdleRevalPoller,
      mockClassifier,
      mockBatcher,
      mockLogger,
      mockConfig
    );
  });

  describe("initialization", () => {
    it("should initialize with empty current window", () => {
      expect(orchestrator.currentWindow).toBe("");
    });

    it("should set up polling callbacks during construction", () => {
      expectPollerCallbacks(mockIdleRevalPoller, mockWindowPoller, mockStudyingOcrPoller);
      expect(mockCache.startTTL).toHaveBeenCalled();
    });
  });


  describe("runFullPipeline", () => {
    const mockWindow = "test-window";

    it("should throw error for empty window identifier", async () => {
      await expect(orchestrator.runFullPipeline(""))
        .rejects
        .toThrow("Window identifier is required");
    });

    it("should throw CacheError when cache entry not found", async () => {
      vi.mocked(mockCache.get).mockReturnValue(undefined);

      await expect(orchestrator.runFullPipeline(mockWindow))
        .rejects
        .toThrow(CacheError);
    });

    it("should transition from Idle to Studying state", async () => {
      setupCacheEntry(mockCache, "Idle");
      setupVisionPipeline(mockVisionService, mockClassifier, "captured text", "Studying");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expectCacheUpdate(mockCache, mockWindow, "Studying");
      expect(changeStateSpy).toHaveBeenCalled();
    });

    it("should transition from Studying to Idle state", async () => {
      setupCacheEntry(mockCache, "Studying");
      setupVisionPipeline(mockVisionService, mockClassifier, "captured text", "Idle");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expectCacheUpdate(mockCache, mockWindow, "Idle");
      expect(changeStateSpy).toHaveBeenCalled();
    });

    it("should add text to batcher when in Studying mode", async () => {
      const capturedText = "study material text";
      setupCacheEntry(mockCache, "Idle");
      setupVisionPipeline(mockVisionService, mockClassifier, capturedText, "Studying");

      await orchestrator.runFullPipeline(mockWindow);

      expect(mockBatcher.add).toHaveBeenCalledWith(capturedText);
      expect(mockBatcher.flushIfNeeded).toHaveBeenCalled();
    });

    it("should not change state when mode remains the same", async () => {
      const capturedText = "study material text";
      setupCacheEntry(mockCache, "Studying");
      setupVisionPipeline(mockVisionService, mockClassifier, capturedText, "Studying");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expect(changeStateSpy).not.toHaveBeenCalled();
      expect(mockBatcher.add).toHaveBeenCalledWith(capturedText);
    });
  });

  describe("IdleRevalidation", () => {
    beforeEach(() => {
      orchestrator.currentWindow = "test-window";
    });

    it("should warn when no current window available", () => {
      orchestrator.currentWindow = "";

      orchestrator.performIdleRevalidation();

      expect(mockLogger.warn).toHaveBeenCalledWith('No current window available for idle revalidation');
    });

    it("should run full pipeline when cache entry doesn't exist", () => {
      vi.mocked(mockCache.get).mockReturnValue(undefined);
      const runFullPipelineSpy = vi.spyOn(orchestrator, 'runFullPipeline').mockResolvedValue();

      orchestrator.performIdleRevalidation();

      expect(runFullPipelineSpy).toHaveBeenCalledWith("test-window");
    });


    it("should not run pipeline when window is still active", () => {
      const recentTimestamp = Date.now() - 1000;
      const cacheEntry = { mode: "Idle", lastClassified: recentTimestamp };
      vi.mocked(mockCache.get).mockReturnValue(cacheEntry);
      const runFullPipelineSpy = vi.spyOn(orchestrator, 'runFullPipeline');

      orchestrator.performIdleRevalidation();

      expect(runFullPipelineSpy).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("is still active, no reclassification needed")
      );
    });
  });

  describe("updateOldWindowDate", () => {
    it("should update cache entry for existing window", () => {
      const windowId = "existing-window";
      const existingEntry = { mode: "Studying", lastClassified: 123456 };
      
      vi.mocked(mockCache.has).mockReturnValue(true);
      vi.mocked(mockCache.get).mockReturnValue(existingEntry);

      orchestrator.updateOldWindowDate(windowId);

      expect(mockCache.set).toHaveBeenCalledWith(windowId, {
        mode: "Studying",
        lastClassified: expect.any(Number)
      });
      expect(mockLogger.info).toHaveBeenCalledWith(`Updated last seen for window: ${windowId}`);
    });

    it("should warn when window not found in cache", () => {
      const windowId = "non-existing-window";
      
      vi.mocked(mockCache.has).mockReturnValue(false);

      orchestrator.updateOldWindowDate(windowId);

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(`No entry found for window: ${windowId}`);
    });

    it("should return early for empty window", () => {
      orchestrator.updateOldWindowDate("");

      expect(mockCache.has).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe("handleWindowChange", () => {
    it("should update old window and transition state", async () => {
      const oldWindow = "old-window";
      const newWindow = "new-window";
      
      // Mock cache for the new window
      vi.mocked(mockCache.has).mockImplementation((key) => key === newWindow);
      vi.mocked(mockCache.get).mockImplementation((key) => {
        if (key === newWindow) return { mode: "Idle", lastClassified: Date.now() };
        return undefined;
      });
      
      const updateSpy = vi.spyOn(orchestrator, 'updateOldWindowDate');

      await orchestrator.handleWindowChange(oldWindow, newWindow);

      expect(updateSpy).toHaveBeenCalledWith(oldWindow);
    });

    it("should handle empty old window gracefully", async () => {
      const newWindow = "new-window";
      
      // Mock cache for the new window
      vi.mocked(mockCache.has).mockImplementation((key) => key === newWindow);
      vi.mocked(mockCache.get).mockImplementation((key) => {
        if (key === newWindow) return { mode: "Idle", lastClassified: Date.now() };
        return undefined;
      });
      
      const updateSpy = vi.spyOn(orchestrator, 'updateOldWindowDate');

      await orchestrator.handleWindowChange("", newWindow);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("polling control methods", () => {
    it("should delegate to window poller", () => {
      orchestrator.startWindowPolling();
      expect(mockWindowPoller.start).toHaveBeenCalled();

      orchestrator.stopWindowPolling();
      expect(mockWindowPoller.stop).toHaveBeenCalled();
    });

    it("should delegate to studying OCR poller", () => {
      orchestrator.startStudyingOcrPolling();
      expect(mockStudyingOcrPoller.start).toHaveBeenCalled();

      orchestrator.stopStudyingOcrPolling();
      expect(mockStudyingOcrPoller.stop).toHaveBeenCalled();
    });

    it("should delegate to idle revalidation poller", () => {
      orchestrator.startIdleRevalidationPolling();
      expect(mockIdleRevalPoller.start).toHaveBeenCalled();

      orchestrator.stopIdleRevalidationPolling();
      expect(mockIdleRevalPoller.stop).toHaveBeenCalled();
    });
  });
});