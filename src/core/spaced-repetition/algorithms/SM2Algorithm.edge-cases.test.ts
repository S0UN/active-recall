/**
 * Comprehensive Edge Case Tests for SM2Algorithm
 * 
 * Tests the SM2 algorithm implementation against edge cases, boundary values,
 * extreme patterns, and real-world scenarios to ensure robustness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SM2Algorithm, SM2State, SM2Result } from './SM2Algorithm';
import { ResponseQuality } from '../domain/ReviewSchedule';

describe('SM2Algorithm Edge Cases', () => {
  let algorithm: SM2Algorithm;

  beforeEach(() => {
    algorithm = new SM2Algorithm();
  });

  describe('boundary value testing', () => {
    it('should handle minimum ease factor boundary (1.3)', () => {
      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 1.3,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
      
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should handle maximum ease factor boundary (3.0)', () => {
      const state: SM2State = {
        repetitions: 10,
        easinessFactor: 3.0,
        interval: 100,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.easinessFactor).toBeLessThanOrEqual(3.0);
    });

    it('should handle zero repetitions with various responses', () => {
      const initialState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      const responses = [
        ResponseQuality.FORGOT,
        ResponseQuality.HARD,
        ResponseQuality.GOOD,
        ResponseQuality.EASY
      ];

      for (const quality of responses) {
        const result = algorithm.calculateNext(initialState, quality);
        
        if (quality === ResponseQuality.FORGOT) {
          expect(result.state.repetitions).toBe(0);
          expect(result.resetToLearning).toBe(true);
        } else {
          expect(result.state.repetitions).toBeGreaterThanOrEqual(0);
        }
        expect(result.state.interval).toBeGreaterThan(0);
      }
    });

    it('should handle very high repetition numbers', () => {
      const state: SM2State = {
        repetitions: 100,
        easinessFactor: 2.5,
        interval: 1000,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(result.state.repetitions).toBe(101);
      expect(result.state.interval).toBeGreaterThan(1000);
      expect(result.state.interval).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('learning mode transitions', () => {
    it('should handle graduation from learning mode', () => {
      const learningState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 1 // Last learning step
      };

      const result = algorithm.calculateNext(learningState, ResponseQuality.GOOD);
      
      expect(result.graduated).toBe(true);
      expect(result.state.isLearning).toBe(false);
      expect(result.state.learningStep).toBeUndefined();
    });

    it('should handle reset to learning mode on forgot', () => {
      const graduatedState: SM2State = {
        repetitions: 5,
        easinessFactor: 2.0,
        interval: 30,
        isLearning: false
      };

      const result = algorithm.calculateNext(graduatedState, ResponseQuality.FORGOT);
      
      expect(result.resetToLearning).toBe(true);
      expect(result.state.isLearning).toBe(true);
      expect(result.state.learningStep).toBe(0);
      expect(result.state.repetitions).toBe(0);
    });

    it('should handle progression through learning steps', () => {
      let state: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      // Progress through each learning step
      const result1 = algorithm.calculateNext(state, ResponseQuality.GOOD);
      expect(result1.state.learningStep).toBe(1);
      expect(result1.state.isLearning).toBe(true);

      const result2 = algorithm.calculateNext(result1.state, ResponseQuality.GOOD);
      expect(result2.graduated).toBe(true);
      expect(result2.state.isLearning).toBe(false);
    });
  });

  describe('ease factor modifications', () => {
    it('should reduce ease factor on hard responses', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.5,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.HARD);
      
      expect(result.state.easinessFactor).toBeLessThan(2.5);
      expect(result.easeChange).toBeLessThan(0);
    });

    it('should increase ease factor on easy responses', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.0,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.easinessFactor).toBeGreaterThan(2.0);
      expect(result.easeChange).toBeGreaterThan(0);
    });

    it('should not change ease factor on good responses', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.3,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(result.state.easinessFactor).toBe(2.3);
      expect(result.easeChange).toBe(0);
    });

    it('should enforce minimum ease factor', () => {
      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 1.31, // Just above minimum
        interval: 5,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
      
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should enforce maximum ease factor', () => {
      const state: SM2State = {
        repetitions: 10,
        easinessFactor: 2.95,
        interval: 100,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.easinessFactor).toBeLessThanOrEqual(3.0);
    });
  });

  describe('interval calculations', () => {
    it('should calculate exponentially increasing intervals', () => {
      let state: SM2State = {
        repetitions: 1,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: false
      };

      const intervals: number[] = [];
      
      // Simulate several successful reviews
      for (let i = 0; i < 5; i++) {
        const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
        intervals.push(result.state.interval);
        state = result.state;
      }
      
      // Each interval should generally be larger than the previous
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
      }
    });

    it('should handle fractional intervals correctly', () => {
      const state: SM2State = {
        repetitions: 2,
        easinessFactor: 1.5, // Low ease factor
        interval: 1,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(result.state.interval).toBeGreaterThan(0);
      expect(Number.isFinite(result.state.interval)).toBe(true);
    });

    it('should apply easy bonus correctly', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.0,
        interval: 10,
        isLearning: false
      };

      const goodResult = algorithm.calculateNext(state, ResponseQuality.GOOD);
      const easyResult = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(easyResult.state.interval).toBeGreaterThan(goodResult.state.interval);
    });
  });

  describe('stress testing with extreme values', () => {
    it('should handle maximum safe integer intervals', () => {
      const state: SM2State = {
        repetitions: 1000,
        easinessFactor: 3.0,
        interval: Number.MAX_SAFE_INTEGER / 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(Number.isSafeInteger(result.state.interval)).toBe(true);
      expect(result.state.interval).toBeGreaterThan(0);
    });

    it('should handle consecutive forgot responses', () => {
      let state: SM2State = {
        repetitions: 10,
        easinessFactor: 2.5,
        interval: 100,
        isLearning: false
      };

      // Apply forgot response multiple times
      for (let i = 0; i < 10; i++) {
        const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
        state = result.state;
        
        expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
        expect(state.repetitions).toBe(0);
        expect(state.isLearning).toBe(true);
      }
    });

    it('should handle alternating good/forgot pattern', () => {
      let state: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      // Simulate difficult learning pattern
      for (let i = 0; i < 5; i++) {
        const goodResult = algorithm.calculateNext(state, ResponseQuality.GOOD);
        if (goodResult.graduated) {
          const forgotResult = algorithm.calculateNext(goodResult.state, ResponseQuality.FORGOT);
          state = forgotResult.state;
        } else {
          state = goodResult.state;
        }
        
        expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
        expect(state.interval).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration edge cases', () => {
    it('should handle custom learning steps', () => {
      const customAlgorithm = new SM2Algorithm({
        learningSteps: [0.5, 5, 30] // 30 seconds, 5 minutes, 30 minutes
      });

      let state: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      // Progress through custom learning steps
      const result1 = customAlgorithm.calculateNext(state, ResponseQuality.GOOD);
      expect(result1.state.learningStep).toBe(1);
      
      const result2 = customAlgorithm.calculateNext(result1.state, ResponseQuality.GOOD);
      expect(result2.state.learningStep).toBe(2);
      
      const result3 = customAlgorithm.calculateNext(result2.state, ResponseQuality.GOOD);
      expect(result3.graduated).toBe(true);
    });

    it('should handle extreme ease factor limits', () => {
      const extremeAlgorithm = new SM2Algorithm({
        minEase: 1.0,
        maxEase: 5.0
      });

      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 1.1,
        interval: 10,
        isLearning: false
      };

      const result = extremeAlgorithm.calculateNext(state, ResponseQuality.FORGOT);
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('data integrity checks', () => {
    it('should maintain state consistency across calculations', () => {
      const initialState: SM2State = {
        repetitions: 3,
        easinessFactor: 2.2,
        interval: 7,
        isLearning: false
      };

      const result = algorithm.calculateNext(initialState, ResponseQuality.GOOD);
      
      // Verify state consistency
      expect(result.state.repetitions).toBe(initialState.repetitions + 1);
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.3);
      expect(result.state.easinessFactor).toBeLessThanOrEqual(3.0);
      expect(result.state.interval).toBeGreaterThan(0);
      expect(result.interval).toBe(result.state.interval);
    });

    it('should preserve original state immutability', () => {
      const originalState: SM2State = {
        repetitions: 5,
        easinessFactor: 2.5,
        interval: 15,
        isLearning: false
      };

      const stateCopy = { ...originalState };
      algorithm.calculateNext(originalState, ResponseQuality.HARD);
      
      // Original state should remain unchanged
      expect(originalState).toEqual(stateCopy);
    });
  });
});