import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../Orchestrator';
import { IBatcherService } from '../network/IBatcherService';
import { StudyingState } from './impl/StudyingState';
import { IdleState } from './impl/IdleState';
import { container } from 'tsyringe';

/**
 * Integration tests for Orchestrator and BatcherService idle flush functionality
 * Tests the complete flow of state transitions triggering batcher notifications
 */
describe('Orchestrator - BatcherService Integration', () => {
  let orchestrator: Orchestrator;
  let mockBatcher: jest.Mocked<IBatcherService>;
  let studyingState: StudyingState;
  let idleState: IdleState;

  beforeEach(() => {
    // Clear any existing registrations
    container.clearInstances();
    
    // Create mock BatcherService
    mockBatcher = {
      add: vi.fn(),
      flushIfNeeded: vi.fn().mockResolvedValue(undefined),
      getBatches: vi.fn().mockReturnValue([]),
      getBatchesAsJson: vi.fn().mockReturnValue('{"batches":[]}'),
      clearBatches: vi.fn(),
      notifyStudyingStarted: vi.fn(),
      notifyIdleStarted: vi.fn()
    };

    // Mock all other dependencies
    const mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      size: vi.fn().mockReturnValue(0),
      startTTL: vi.fn(),
      stopTTL: vi.fn()
    };

    const mockVisionService = {
      captureAndRecognizeText: vi.fn().mockResolvedValue('Sample text content')
    };

    const mockWindowPoller = {
      start: vi.fn(),
      stop: vi.fn(),
      setOnChange: vi.fn()
    };

    const mockStudyingOcrPoller = {
      start: vi.fn(),
      stop: vi.fn(),
      setOnTick: vi.fn()
    };

    const mockIdleRevalPoller = {
      start: vi.fn(),
      stop: vi.fn(),
      setOnTick: vi.fn()
    };

    const mockClassifier = {
      classify: vi.fn().mockResolvedValue('Studying')
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const mockConfig = {
      windowChangeIntervalMs: 1000,
      studyingOcrIntervalMs: 30000,
      idleRevalidationThresholdMs: 900000,
      idleRevalidationIntervalMs: 60000,
      windowCacheTTL: 900000,
      newWindowPipelineDelayMs: 15000,
      batchIdleFlushTimeoutMs: 300000
    };

    const mockModelFactory = {
      getAvailableStrategies: vi.fn().mockResolvedValue([])
    };

    // Register mocks in container
    container.register('WindowCache', { useValue: mockCache });
    container.register('VisionService', { useValue: mockVisionService });
    container.register('WindowChangePoller', { useValue: mockWindowPoller });
    container.register('StudyingOCRPoller', { useValue: mockStudyingOcrPoller });
    container.register('IdleRevalidationPoller', { useValue: mockIdleRevalPoller });
    container.register('ClassificationService', { useValue: mockClassifier });
    container.register('BatcherService', { useValue: mockBatcher });
    container.register('LoggerService', { useValue: mockLogger });
    container.register('PollingConfig', { useValue: mockConfig });
    container.register('ModelFactory', { useValue: mockModelFactory });

    // Create orchestrator instance
    orchestrator = container.resolve(Orchestrator);
    
    // Get state instances for testing
    studyingState = (orchestrator as any).studyingState;
    idleState = (orchestrator as any).idleState;
  });

  afterEach(() => {
    vi.clearAllMocks();
    container.clearInstances();
  });

  describe('State Transition Integration', () => {
    it('should notify batcher when transitioning to StudyingState', () => {
      // Act: Enter studying state
      studyingState.onEnter();

      // Assert: BatcherService should be notified
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(1);
    });

    it('should notify batcher when transitioning to IdleState', () => {
      // Act: Enter idle state
      idleState.onEnter();

      // Assert: BatcherService should be notified
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);
    });

    it('should notify batcher during complete state transition flow', () => {
      // Act: Simulate complete state transition flow
      orchestrator.changeState(studyingState);
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(1);

      orchestrator.changeState(idleState);
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);

      orchestrator.changeState(studyingState);
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(2);

      // Assert: Both notifications should be called appropriately
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(2);
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);
    });
  });

  describe('Orchestrator Batcher Notification Methods', () => {
    it('should have notifyBatcherStudyingStarted method that calls batcher', () => {
      // Act: Call notification method directly
      orchestrator.notifyBatcherStudyingStarted();

      // Assert: Should delegate to batcher
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(1);
    });

    it('should have notifyBatcherIdleStarted method that calls batcher', () => {
      // Act: Call notification method directly
      orchestrator.notifyBatcherIdleStarted();

      // Assert: Should delegate to batcher
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);
    });
  });

  describe('Window Change Integration', () => {
    it('should maintain batcher notifications during window changes', async () => {
      const mockCache = container.resolve('WindowCache');
      mockCache.has.mockReturnValue(true);
      mockCache.get.mockReturnValue({ mode: 'Studying', lastClassified: Date.now() });

      // Act: Handle window change that should trigger studying state
      await orchestrator.handleWindowChange('old-window', 'new-window');

      // The window change should eventually lead to state transitions
      // This is more of an integration smoke test
      expect(mockCache.has).toHaveBeenCalledWith('new-window');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle batcher notification errors gracefully', () => {
      // Arrange: Make batcher throw error
      mockBatcher.notifyStudyingStarted.mockImplementation(() => {
        throw new Error('Batcher notification failed');
      });

      // Act & Assert: Should not crash orchestrator
      expect(() => studyingState.onEnter()).not.toThrow();
    });

    it('should handle batcher idle notification errors gracefully', () => {
      // Arrange: Make batcher throw error
      mockBatcher.notifyIdleStarted.mockImplementation(() => {
        throw new Error('Batcher idle notification failed');
      });

      // Act & Assert: Should not crash orchestrator
      expect(() => idleState.onEnter()).not.toThrow();
    });
  });

  describe('State Machine Robustness', () => {
    it('should handle rapid state transitions without breaking batcher notifications', () => {
      // Act: Rapid state transitions
      for (let i = 0; i < 10; i++) {
        orchestrator.changeState(studyingState);
        orchestrator.changeState(idleState);
      }

      // Assert: All notifications should be sent
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(10);
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(10);
    });

    it('should maintain batcher integration after orchestrator restart', async () => {
      // Act: Start orchestrator (which enters initial idle state)
      await orchestrator.start();

      // Initial state entry should trigger idle notification
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);

      // Act: Transition to studying
      orchestrator.changeState(studyingState);
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalled();

      // Act: Stop and manually transition back to idle state to simulate restart
      orchestrator.stop();
      orchestrator.changeState(idleState);

      // Should have called idle notification again
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(2);
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('should integrate correctly during typical user workflow', async () => {
      const mockCache = container.resolve('WindowCache');
      
      // Arrange: User starts app (idle state)
      await orchestrator.start();
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(1);

      // Arrange: User switches to study window
      mockCache.has.mockReturnValue(false); // New window
      await orchestrator.handleWindowChange('', 'study-window');
      
      // Should transition to studying state for new window
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalled();

      // Arrange: User switches away from study content
      mockCache.has.mockReturnValue(true);
      mockCache.get.mockReturnValue({ mode: 'Idle', lastClassified: Date.now() });
      
      await orchestrator.handleWindowChange('study-window', 'browser-window');
      
      // Should transition back to idle
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(2);

      // Assert: Complete flow should maintain proper batcher integration
      expect(mockBatcher.notifyStudyingStarted).toHaveBeenCalledTimes(1);
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalledTimes(2);
    });
  });

  describe('Batch Content Integration', () => {
    it('should process studying content and integrate with idle flush', async () => {
      // Arrange: Set up studying mode
      orchestrator.currentWindow = 'study-window';
      orchestrator.changeState(studyingState);

      // Act: Process studying content
      await orchestrator.processStudyingContent('Mathematics', 'Calculus derivatives');

      // Assert: Content should be added to batcher
      expect(mockBatcher.add).toHaveBeenCalledWith('study-window', 'Mathematics', 'Calculus derivatives');
      expect(mockBatcher.flushIfNeeded).toHaveBeenCalled();

      // Act: Transition to idle (should trigger idle flush timer)
      orchestrator.changeState(idleState);
      expect(mockBatcher.notifyIdleStarted).toHaveBeenCalled();
    });
  });
});