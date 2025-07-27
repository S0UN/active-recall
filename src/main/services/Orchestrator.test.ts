import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import { IOrchestratorState } from "./orchestrator/IOrchestratorState";
import { WindowChangePoller } from "./polling/impl/WindowChangePoller";
import { StudyingOCRPoller } from "./polling/impl/StudyingOCRPoller";
import { IdleRevalidationPoller } from "./polling/impl/IdleRevalidationPoller";
import { IClassificationService } from "./analysis/IClassificationService";
import { IBatcherService } from "./network/IBatcherService";
import { VisionService } from "./processing/impl/VisionService";
import { ICache } from "../utils/ICache";
import { ConfigService } from "../configs/ConfigService";
import { ILogger } from "../utils/ILogger";
import { VisionServiceError, ClassificationError, CacheError } from "../errors/CustomErrors";

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
  clear: vi.fn(),
  startTTL: vi.fn(),
  stopTTL: vi.fn(),
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
  flush: vi.fn(),
});

const createMockConfig = (): ConfigService => ({
  windowChangeIntervalMs: 1000,
  studyingOcrIntervalMs: 5000,
  idleRevalidationIntervalMs: 30000,
  idleRevalidationThresholdMs: 900000,
  windowCacheTTL: 900000,
});

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
      expect(mockIdleRevalPoller.setOnTick).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWindowPoller.setOnChange).toHaveBeenCalledWith(expect.any(Function));
      expect(mockStudyingOcrPoller.setOnTick).toHaveBeenCalledWith(expect.any(Function));
      expect(mockCache.startTTL).toHaveBeenCalled();
    });
  });

  describe("captureAndClassifyText", () => {
    it("should successfully capture and classify text", async () => {
      const windowId = "test-window";
      const capturedText = "Some captured text";
      const classificationResult = "Studying";

      vi.mocked(mockVisionService.captureAndRecognizeText).mockResolvedValue(capturedText);
      vi.mocked(mockClassifier.classify).mockResolvedValue(classificationResult);

      const result = await orchestrator.captureAndClassifyText(windowId);

      expect(result).toBe(classificationResult);
      expect(mockVisionService.captureAndRecognizeText).toHaveBeenCalled();
      expect(mockClassifier.classify).toHaveBeenCalledWith(capturedText);
    });

    it("should throw error for empty window identifier", async () => {
      await expect(orchestrator.captureAndClassifyText(""))
        .rejects
        .toThrow("Window identifier is required");
    });

    it("should propagate VisionServiceError", async () => {
      const visionError = new VisionServiceError("Vision failed");
      
      vi.mocked(mockVisionService.captureAndRecognizeText).mockRejectedValue(visionError);

      await expect(orchestrator.captureAndClassifyText("test-window"))
        .rejects
        .toThrow(VisionServiceError);
    });

    it("should propagate ClassificationError", async () => {
      const classificationError = new ClassificationError("Classification failed");
      
      vi.mocked(mockVisionService.captureAndRecognizeText).mockResolvedValue("text");
      vi.mocked(mockClassifier.classify).mockRejectedValue(classificationError);

      await expect(orchestrator.captureAndClassifyText("test-window"))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should wrap unknown errors in VisionServiceError", async () => {
      const unknownError = new Error("Unknown error");
      
      vi.mocked(mockVisionService.captureAndRecognizeText).mockRejectedValue(unknownError);

      await expect(orchestrator.captureAndClassifyText("test-window"))
        .rejects
        .toThrow(VisionServiceError);
    });
  });

  describe("runFullPipeline", () => {
    const mockWindow = "test-window";
    const mockCacheEntry = { mode: "Idle", lastClassified: Date.now() };

    beforeEach(() => {
      vi.mocked(mockCache.get).mockReturnValue(mockCacheEntry);
      vi.mocked(mockVisionService.captureAndRecognizeText).mockResolvedValue("captured text");
      vi.mocked(mockClassifier.classify).mockResolvedValue("Studying");
    });

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
      const idleCacheEntry = { mode: "Idle", lastClassified: Date.now() };
      vi.mocked(mockCache.get).mockReturnValue(idleCacheEntry);
      vi.mocked(mockClassifier.classify).mockResolvedValue("Studying");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expect(mockCache.set).toHaveBeenCalledWith(mockWindow, {
        mode: "Studying",
        lastClassified: expect.any(Number)
      });
      expect(changeStateSpy).toHaveBeenCalled();
    });

    it("should transition from Studying to Idle state", async () => {
      const studyingCacheEntry = { mode: "Studying", lastClassified: Date.now() };
      vi.mocked(mockCache.get).mockReturnValue(studyingCacheEntry);
      vi.mocked(mockClassifier.classify).mockResolvedValue("Idle");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expect(mockCache.set).toHaveBeenCalledWith(mockWindow, {
        mode: "Idle",
        lastClassified: expect.any(Number)
      });
      expect(changeStateSpy).toHaveBeenCalled();
    });

    it("should add text to batcher when in Studying mode", async () => {
      const capturedText = "study material text";
      vi.mocked(mockVisionService.captureAndRecognizeText).mockResolvedValue(capturedText);
      vi.mocked(mockClassifier.classify).mockResolvedValue("Studying");

      await orchestrator.runFullPipeline(mockWindow);

      expect(mockBatcher.add).toHaveBeenCalledWith(capturedText);
      expect(mockBatcher.flushIfNeeded).toHaveBeenCalled();
    });

    it("should not change state when mode remains the same", async () => {
      const studyingCacheEntry = { mode: "Studying", lastClassified: Date.now() };
      vi.mocked(mockCache.get).mockReturnValue(studyingCacheEntry);
      vi.mocked(mockClassifier.classify).mockResolvedValue("Studying");

      const changeStateSpy = vi.spyOn(orchestrator, 'changeState');

      await orchestrator.runFullPipeline(mockWindow);

      expect(changeStateSpy).not.toHaveBeenCalled();
      expect(mockBatcher.add).toHaveBeenCalled();
    });
  });

  describe("IdleRevalidation", () => {
    beforeEach(() => {
      orchestrator.currentWindow = "test-window";
    });

    it("should warn when no current window available", () => {
      orchestrator.currentWindow = "";

      orchestrator.IdleRevalidation();

      expect(mockLogger.warn).toHaveBeenCalledWith('No current window available for idle revalidation');
    });

    it("should run full pipeline when cache entry doesn't exist", () => {
      vi.mocked(mockCache.get).mockReturnValue(undefined);
      const runFullPipelineSpy = vi.spyOn(orchestrator, 'runFullPipeline').mockResolvedValue();

      orchestrator.IdleRevalidation();

      expect(runFullPipelineSpy).toHaveBeenCalledWith("test-window");
    });

    it("should run full pipeline when idle threshold exceeded", () => {
      const oldTimestamp = Date.now() - mockConfig.idleRevalidationIntervalMs - 1000;
      const cacheEntry = { mode: "Idle", lastClassified: oldTimestamp };
      vi.mocked(mockCache.get).mockReturnValue(cacheEntry);
      const runFullPipelineSpy = vi.spyOn(orchestrator, 'runFullPipeline').mockResolvedValue();

      orchestrator.IdleRevalidation();

      expect(runFullPipelineSpy).toHaveBeenCalledWith("test-window");
    });

    it("should not run pipeline when window is still active", () => {
      const recentTimestamp = Date.now() - 1000;
      const cacheEntry = { mode: "Idle", lastClassified: recentTimestamp };
      vi.mocked(mockCache.get).mockReturnValue(cacheEntry);
      const runFullPipelineSpy = vi.spyOn(orchestrator, 'runFullPipeline');

      orchestrator.IdleRevalidation();

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

  describe("onCommonWindowChange", () => {
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

      await orchestrator.onCommonWindowChange(oldWindow, newWindow);

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

      await orchestrator.onCommonWindowChange("", newWindow);

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