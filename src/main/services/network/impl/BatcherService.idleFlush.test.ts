import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatcherService } from './BatcherService';
import { IPollingConfig } from '../../../configs/IPollingConfig';
import Logger from 'electron-log';

/**
 * Comprehensive test suite for BatcherService idle flush functionality
 * Following TDD approach to drive implementation
 */
describe('BatcherService - Idle Flush Functionality', () => {
  let batcherService: BatcherService;
  let mockConfig: IPollingConfig;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let timeoutSpy: ReturnType<typeof vi.fn>;
  let clearTimeoutSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock polling configuration
    mockConfig = {
      windowChangeIntervalMs: 1000,
      studyingOcrIntervalMs: 30000,
      idleRevalidationThresholdMs: 900000,
      idleRevalidationIntervalMs: 60000,
      windowCacheTTL: 900000,
      newWindowPipelineDelayMs: 15000,
      batchIdleFlushTimeoutMs: 300000 // 5 minutes for testing
    };

    // Create spies for timer functions
    timeoutSpy = vi.fn();
    clearTimeoutSpy = vi.fn();

    // Store original functions
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // Mock timer functions
    global.setTimeout = timeoutSpy.mockImplementation((callback: Function, delay: number) => {
      // Store callback for manual triggering in tests
      (timeoutSpy as any).lastCallback = callback;
      (timeoutSpy as any).lastDelay = delay;
      return 'mock-timer-id' as any;
    });

    global.clearTimeout = clearTimeoutSpy;

    // Create BatcherService instance (we'll modify constructor to accept config)
    batcherService = new BatcherService(mockConfig);
  });

  afterEach(() => {
    // Restore original timer functions
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use provided idle flush timeout from config', () => {
      expect((batcherService as any).idleFlushTimeoutMs).toBe(300000);
    });

    it('should use default timeout when not provided in config', () => {
      const configWithoutTimeout = { ...mockConfig };
      delete (configWithoutTimeout as any).batchIdleFlushTimeoutMs;
      
      const service = new BatcherService(configWithoutTimeout);
      expect((service as any).idleFlushTimeoutMs).toBe(5 * 60 * 1000); // 5 minutes default
    });
  });

  describe('notifyStudyingStarted', () => {
    it('should cancel active idle timer when transitioning to studying', () => {
      // Setup: Add content and start idle mode
      batcherService.add('Test Window', 'Study Topic', 'Some study content');
      batcherService.notifyIdleStarted();
      
      // Verify timer was set
      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
      
      // Act: Transition back to studying
      batcherService.notifyStudyingStarted();
      
      // Assert: Timer should be cancelled
      expect(clearTimeoutSpy).toHaveBeenCalledWith('mock-timer-id');
    });

    it('should reset idle state when transitioning to studying', () => {
      // Setup: Start idle mode
      batcherService.add('Test Window', 'Study Topic', 'Some study content');
      batcherService.notifyIdleStarted();
      
      // Act: Transition to studying
      batcherService.notifyStudyingStarted();
      
      // Assert: Should be able to start idle again without issues
      batcherService.notifyIdleStarted();
      expect(timeoutSpy).toHaveBeenCalledTimes(2); // Original + new timer
    });

    it('should handle multiple consecutive studying notifications safely', () => {
      batcherService.notifyStudyingStarted();
      batcherService.notifyStudyingStarted();
      batcherService.notifyStudyingStarted();
      
      // Should not throw errors or cause issues
      // Since no timers were set, clearTimeout should not be called
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('notifyIdleStarted', () => {
    it('should start idle timer when batches contain content', () => {
      // Setup: Add content to batches
      batcherService.add('Test Window', 'Study Topic', 'Some educational content here');
      
      // Act: Notify idle started
      batcherService.notifyIdleStarted();
      
      // Assert: Timer should be set with correct timeout
      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
    });

    it('should not start idle timer when batches are empty', () => {
      // Act: Notify idle started without adding content
      batcherService.notifyIdleStarted();
      
      // Assert: No timer should be set
      expect(timeoutSpy).not.toHaveBeenCalled();
    });

    it('should not start timer when batches contain only empty entries', () => {
      // Setup: Add batch with empty content
      batcherService.add('Test Window', 'Study Topic', '');
      
      // Act: Notify idle started
      batcherService.notifyIdleStarted();
      
      // Assert: No timer should be set for empty content
      expect(timeoutSpy).not.toHaveBeenCalled();
    });

    it('should cancel existing timer and start new one on successive idle notifications', () => {
      // Setup: Add content and start idle first time
      batcherService.add('Test Window', 'Study Topic', 'Content 1');
      batcherService.notifyIdleStarted();
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      
      // Act: Start idle again (edge case)
      batcherService.notifyIdleStarted();
      
      // Assert: Should cancel previous timer and start new one
      expect(clearTimeoutSpy).toHaveBeenCalledWith('mock-timer-id');
      expect(timeoutSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Idle Timer Expiration', () => {
    it('should flush batches when idle timer expires', async () => {
      // Setup: Add content and start idle
      batcherService.add('Test Window', 'Study Topic', 'Educational content');
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      batcherService.notifyIdleStarted();
      
      // Act: Manually trigger the timer callback
      const timerCallback = (timeoutSpy as any).lastCallback;
      await timerCallback();
      
      // Assert: Flush should be called
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });

    it('should clear batches after successful flush on timer expiration', async () => {
      // Setup: Add content and start idle
      batcherService.add('Test Window', 'Study Topic', 'Educational content');
      expect(batcherService.getBatches()).toHaveLength(1);
      
      batcherService.notifyIdleStarted();
      
      // Act: Trigger timer expiration
      const timerCallback = (timeoutSpy as any).lastCallback;
      await timerCallback();
      
      // Assert: Batches should be cleared after flush
      expect(batcherService.getBatches()).toHaveLength(0);
    });

    it('should handle flush errors gracefully during timer expiration', async () => {
      // Setup: Add content and mock flush to throw error
      batcherService.add('Test Window', 'Study Topic', 'Educational content');
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded')
        .mockRejectedValue(new Error('Flush failed'));
      
      const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      
      batcherService.notifyIdleStarted();
      
      // Act: Trigger timer expiration
      const timerCallback = (timeoutSpy as any).lastCallback;
      await timerCallback();
      
      // Assert: Error should be logged but not thrown
      expect(flushSpy).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to flush batches on idle timeout'),
        expect.any(Error)
      );
      
      loggerSpy.mockRestore();
    });
  });

  describe('State Management', () => {
    it('should track studying state correctly', () => {
      expect(batcherService.getIsInStudyingMode()).toBe(true); // Default state
      
      batcherService.notifyIdleStarted();
      expect(batcherService.getIsInStudyingMode()).toBe(false);
      
      batcherService.notifyStudyingStarted();
      expect(batcherService.getIsInStudyingMode()).toBe(true);
    });

    it('should handle rapid state transitions correctly', () => {
      // Add content
      batcherService.add('Test Window', 'Study Topic', 'Educational content');
      
      // Rapid transitions: Study -> Idle -> Study -> Idle
      batcherService.notifyIdleStarted(); // Creates timer 1
      batcherService.notifyStudyingStarted(); // Cancels timer 1 (clearTimeout call 1)
      batcherService.notifyIdleStarted(); // Creates timer 2
      batcherService.notifyStudyingStarted(); // Cancels timer 2 (clearTimeout call 2)
      
      // Should not throw errors and timers should be managed correctly
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2); // 2 actual timer cancellations
      expect(timeoutSpy).toHaveBeenCalledTimes(2); // 2 timer starts
    });
  });

  describe('Content Validation', () => {
    it('should only start timer for batches with meaningful content', () => {
      // Test various content scenarios
      const testCases = [
        { content: '', shouldStartTimer: false },
        { content: '   ', shouldStartTimer: false },
        { content: 'a', shouldStartTimer: true },
        { content: 'Real educational content', shouldStartTimer: true },
        { content: '   meaningful content   ', shouldStartTimer: true }
      ];

      testCases.forEach(({ content, shouldStartTimer }, index) => {
        // Clear previous state
        batcherService.clearBatches();
        timeoutSpy.mockClear();
        
        // Add content and test
        batcherService.add('Test Window', 'Study Topic', content);
        batcherService.notifyIdleStarted();
        
        if (shouldStartTimer) {
          expect(timeoutSpy).toHaveBeenCalled();
        } else {
          expect(timeoutSpy).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe('Integration with Existing Functionality', () => {
    it('should not interfere with threshold-based flushing', () => {
      const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded');
      
      // Add content that exceeds threshold (if auto-flush is enabled)
      const longContent = 'a'.repeat(70000); // Exceeds typical threshold
      batcherService.add('Test Window', 'Study Topic', longContent);
      
      // Threshold flush should work independently of idle state
      expect(flushSpy).toHaveBeenCalled(); // Called by threshold logic
      
      // Idle notification should still work (content remains until actual flush implementation)
      batcherService.notifyIdleStarted(); // Should start timer (content still exists after placeholder flush)
      expect(timeoutSpy).toHaveBeenCalled(); // Timer should start because placeholder flush doesn't clear batches
    });

    it('should maintain existing batch structure and JSON output', () => {
      batcherService.add('Chrome - Study', 'Mathematics', 'Calculus concepts');
      
      const batches = batcherService.getBatches();
      const json = batcherService.getBatchesAsJson();
      
      // Structure should remain unchanged
      expect(batches[0]).toMatchObject({
        window: 'Chrome - Study',
        topic: 'Mathematics',
        entries: [{ text: 'Calculus concepts' }]
      });
      
      expect(json).toContain('Chrome - Study');
      expect(json).toContain('Mathematics');
      expect(json).toContain('Calculus concepts');
    });
  });

  describe('Memory and Resource Management', () => {
    it('should clean up timer references on clearBatches', () => {
      batcherService.add('Test Window', 'Study Topic', 'Content');
      batcherService.notifyIdleStarted();
      
      batcherService.clearBatches();
      
      // Timer should be cleaned up
      expect(clearTimeoutSpy).toHaveBeenCalledWith('mock-timer-id');
      expect((batcherService as any).idleTimer).toBeNull();
    });

    it('should not accumulate timer references with multiple operations', () => {
      for (let i = 0; i < 10; i++) {
        batcherService.add('Test Window', 'Study Topic', `Content ${i}`);
        batcherService.notifyIdleStarted();
        batcherService.notifyStudyingStarted();
      }
      
      // Should only have one timer reference at a time
      expect((batcherService as any).idleTimer).toBeNull();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(10);
    });
  });

  describe('Edge Cases and Robustness', () => {
    describe('Invalid Configuration Scenarios', () => {
      it('should handle zero timeout configuration gracefully', () => {
        const zeroTimeoutConfig = { ...mockConfig, batchIdleFlushTimeoutMs: 0 };
        const service = new BatcherService(zeroTimeoutConfig);
        
        // Add content and try idle flush - should not crash
        service.add('Test Window', 'Topic', 'Content');
        service.notifyIdleStarted();
        
        // Should not set timer with zero timeout
        expect(timeoutSpy).not.toHaveBeenCalled();
      });

      it('should handle negative timeout configuration', () => {
        const negativeTimeoutConfig = { ...mockConfig, batchIdleFlushTimeoutMs: -5000 };
        const service = new BatcherService(negativeTimeoutConfig);
        
        service.add('Test Window', 'Topic', 'Content');
        service.notifyIdleStarted();
        
        // Should not set timer with negative timeout
        expect(timeoutSpy).not.toHaveBeenCalled();
      });

      it('should handle undefined configuration object', () => {
        // This tests the optional injection and fallback behavior
        expect(() => new BatcherService()).not.toThrow();
      });
    });

    describe('Batch Content Edge Cases', () => {
      it('should handle batches with only whitespace correctly', () => {
        const whitespaceVariations = ['   ', '\t\t', '\n\n', '\r\n', '  \t\n  '];
        
        whitespaceVariations.forEach(whitespace => {
          batcherService.clearBatches();
          timeoutSpy.mockClear();
          
          batcherService.add('Test Window', 'Topic', whitespace);
          batcherService.notifyIdleStarted();
          
          // Should not start timer for whitespace-only content
          expect(timeoutSpy).not.toHaveBeenCalled();
        });
      });

      it('should handle unicode and special characters in content', () => {
        const unicodeContent = '🎯 Testing émojis and spëcial chäractërs: 中文测试 العربية русский';
        
        batcherService.add('Test Window', 'Topic', unicodeContent);
        batcherService.notifyIdleStarted();
        
        // Should properly handle unicode content
        expect(timeoutSpy).toHaveBeenCalled();
      });

      it('should handle extremely long content strings', () => {
        const veryLongContent = 'a'.repeat(100000); // 100k characters
        
        batcherService.add('Test Window', 'Topic', veryLongContent);
        batcherService.notifyIdleStarted();
        
        expect(timeoutSpy).toHaveBeenCalled();
      });

      it('should handle empty strings mixed with meaningful content', () => {
        batcherService.add('Test Window', 'Topic', '');
        batcherService.add('Test Window', 'Topic', 'meaningful content');
        batcherService.add('Test Window', 'Topic', '');
        
        batcherService.notifyIdleStarted();
        
        // Should start timer when batch has meaningful content mixed with empty
        expect(timeoutSpy).toHaveBeenCalled();
      });
    });

    describe('Timer Management Edge Cases', () => {
      it('should handle timer expiration during rapid state changes', async () => {
        batcherService.add('Test Window', 'Topic', 'Content');
        batcherService.notifyIdleStarted();
        
        // Get the timer callback
        const timerCallback = (timeoutSpy as any).lastCallback;
        
        // Start rapid state changes
        batcherService.notifyStudyingStarted();
        batcherService.notifyIdleStarted();
        batcherService.notifyStudyingStarted();
        
        // Trigger timer expiration after state changes
        await timerCallback();
        
        // Should not crash and handle gracefully
        expect(batcherService.getBatches()).toBeDefined();
      });

      it('should handle multiple timer callbacks executed concurrently', async () => {
        batcherService.add('Test Window', 'Topic', 'Content 1');
        batcherService.notifyIdleStarted();
        const callback1 = (timeoutSpy as any).lastCallback;
        
        batcherService.add('Test Window', 'Topic', 'Content 2');
        batcherService.notifyIdleStarted();
        const callback2 = (timeoutSpy as any).lastCallback;
        
        // Execute both callbacks concurrently (shouldn't happen in real scenario but test robustness)
        await Promise.all([callback1(), callback2()]);
        
        // Should handle gracefully without crashing
        expect(batcherService.getBatches()).toBeDefined();
      });

      it('should handle timer cleanup when service is used after clearBatches', () => {
        batcherService.add('Test Window', 'Topic', 'Content');
        batcherService.notifyIdleStarted();
        
        batcherService.clearBatches();
        
        // Should be able to use service normally after clearBatches
        batcherService.add('Test Window', 'Topic', 'New Content');
        batcherService.notifyIdleStarted();
        
        expect(timeoutSpy).toHaveBeenCalledTimes(2); // Original + new timer
      });
    });

    describe('Error Handling Edge Cases', () => {
      it('should handle flush errors and maintain service stability', async () => {
        const flushSpy = vi.spyOn(batcherService, 'flushIfNeeded')
          .mockRejectedValue(new Error('Network error during flush'));
        
        const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
        
        batcherService.add('Test Window', 'Topic', 'Content');
        batcherService.notifyIdleStarted();
        
        const timerCallback = (timeoutSpy as any).lastCallback;
        await timerCallback();
        
        // Service should remain functional after flush error
        batcherService.add('Test Window', 'Topic', 'New Content');
        expect(batcherService.getBatches()).toHaveLength(1);
        
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to flush batches on idle timeout'),
          expect.any(Error)
        );
        
        flushSpy.mockRestore();
        loggerSpy.mockRestore();
      });

      it('should handle setTimeout throwing errors', () => {
        // Mock setTimeout to throw an error
        const originalSetTimeout = global.setTimeout;
        global.setTimeout = vi.fn().mockImplementation(() => {
          throw new Error('Timer creation failed');
        });
        
        batcherService.add('Test Window', 'Topic', 'Content');
        
        // Should not crash when setTimeout fails
        expect(() => batcherService.notifyIdleStarted()).not.toThrow();
        
        // Restore original setTimeout
        global.setTimeout = originalSetTimeout;
      });

      it('should handle clearTimeout with invalid timer references', () => {
        // Manually set invalid timer reference
        (batcherService as any).idleTimer = 'invalid-timer-id';
        
        // Should not throw when clearing invalid timer
        expect(() => batcherService.notifyStudyingStarted()).not.toThrow();
      });
    });

    describe('Memory Management and Performance', () => {
      it('should not leak memory with many rapid state transitions', () => {
        const initialTimerCount = clearTimeoutSpy.mock.calls.length;
        
        // Perform many rapid state transitions
        for (let i = 0; i < 1000; i++) {
          batcherService.add('Test Window', 'Topic', `Content ${i}`);
          batcherService.notifyIdleStarted();
          batcherService.notifyStudyingStarted();
        }
        
        // All timers should be properly cleaned up
        const finalTimerCount = clearTimeoutSpy.mock.calls.length;
        expect(finalTimerCount - initialTimerCount).toBe(1000);
        expect((batcherService as any).idleTimer).toBeNull();
      });

      it('should handle service destruction gracefully', () => {
        batcherService.add('Test Window', 'Topic', 'Content');
        batcherService.notifyIdleStarted();
        
        // Simulate service cleanup
        batcherService.clearBatches();
        
        // Timer should be cleaned up
        expect((batcherService as any).idleTimer).toBeNull();
        
        // Service should still be usable
        expect(() => batcherService.notifyStudyingStarted()).not.toThrow();
      });

      it('should handle large numbers of batch entries efficiently', () => {
        // Add many entries to test performance
        for (let i = 0; i < 1000; i++) {
          batcherService.add(`Window ${i}`, `Topic ${i}`, `Content ${i}`);
        }
        
        const startTime = Date.now();
        batcherService.notifyIdleStarted();
        const duration = Date.now() - startTime;
        
        // Should complete within reasonable time (< 100ms for 1000 entries)
        expect(duration).toBeLessThan(100);
        expect(timeoutSpy).toHaveBeenCalled();
      });
    });

    describe('Integration with Existing BatcherService Features', () => {
      it('should maintain compatibility with existing add/getBatches methods', () => {
        // Test that idle flush doesn't break existing functionality
        batcherService.add('Chrome', 'Programming', 'JavaScript code');
        batcherService.add('Chrome', 'Programming', 'TypeScript code');
        batcherService.add('VS Code', 'Programming', 'Python code');
        
        const batches = batcherService.getBatches();
        expect(batches).toHaveLength(2); // Two different windows
        expect(batches[0].entries).toHaveLength(2); // Two entries in Chrome
        expect(batches[1].entries).toHaveLength(1); // One entry in VS Code
        
        // Idle functionality should still work
        batcherService.notifyIdleStarted();
        expect(timeoutSpy).toHaveBeenCalled();
      });

      it('should work correctly with getBatchesAsJson', () => {
        batcherService.add('Test Window', 'Study', 'JSON test content');
        
        const json = batcherService.getBatchesAsJson();
        expect(json).toContain('Test Window');
        expect(json).toContain('Study');
        expect(json).toContain('JSON test content');
        
        // Should be valid JSON
        expect(() => JSON.parse(json)).not.toThrow();
      });

      it('should handle window/topic changes during idle state correctly', () => {
        batcherService.add('Window 1', 'Topic 1', 'Content 1');
        batcherService.notifyIdleStarted();
        
        // Change window/topic while idle
        batcherService.add('Window 2', 'Topic 2', 'Content 2');
        
        // Should still have timer active and new batch created
        expect(batcherService.getBatches()).toHaveLength(2);
        expect((batcherService as any).idleTimer).not.toBeNull();
      });
    });

    describe('Boundary Value Testing', () => {
      it('should handle minimum meaningful content length', () => {
        const testCases = [
          { content: '', shouldStart: false },
          { content: ' ', shouldStart: false },
          { content: 'a', shouldStart: true },
          { content: '1', shouldStart: true },
          { content: '!', shouldStart: true }
        ];
        
        testCases.forEach(({ content, shouldStart }) => {
          batcherService.clearBatches();
          timeoutSpy.mockClear();
          
          batcherService.add('Test Window', 'Topic', content);
          batcherService.notifyIdleStarted();
          
          if (shouldStart) {
            expect(timeoutSpy).toHaveBeenCalled();
          } else {
            expect(timeoutSpy).not.toHaveBeenCalled();
          }
        });
      });

      it('should handle maximum timeout values', () => {
        const maxTimeout = 2147483647; // Max safe integer for setTimeout
        const maxConfig = { ...mockConfig, batchIdleFlushTimeoutMs: maxTimeout };
        const service = new BatcherService(maxConfig);
        
        service.add('Test Window', 'Topic', 'Content');
        service.notifyIdleStarted();
        
        // Should handle large timeout values without issue
        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), maxTimeout);
      });
    });
  });
});