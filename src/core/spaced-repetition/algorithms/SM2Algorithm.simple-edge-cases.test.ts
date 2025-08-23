/**
 * Simplified Edge Case Tests for SM2Algorithm
 * 
 * Tests the SM2 algorithm implementation against critical edge cases and boundary values.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SM2Algorithm, SM2State } from './SM2Algorithm';
import { ResponseQuality } from '../domain/ReviewSchedule';

describe('SM2Algorithm Critical Edge Cases', () => {
  let algorithm: SM2Algorithm;

  beforeEach(() => {
    algorithm = new SM2Algorithm();
  });

  describe('boundary value validation', () => {
    it('should handle minimum ease factor (1.3)', () => {
      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 1.3,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
      
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should handle maximum ease factor (3.0)', () => {
      const state: SM2State = {
        repetitions: 10,
        easinessFactor: 3.0,
        interval: 100,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.easinessFactor).toBeLessThanOrEqual(3.0);
    });

    it('should handle learning state transitions', () => {
      const learningState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      const result = algorithm.calculateNext(learningState, ResponseQuality.GOOD);
      
      expect(result.state).toBeDefined();
      expect(result.interval).toBeGreaterThan(0);
    });

    it('should handle review state calculations', () => {
      const reviewState: SM2State = {
        repetitions: 3,
        easinessFactor: 2.5,
        interval: 15,
        isLearning: false
      };

      const result = algorithm.calculateNext(reviewState, ResponseQuality.GOOD);
      
      expect(result.state.repetitions).toBe(4);
      expect(result.state.interval).toBeGreaterThan(15);
      expect(result.state.easinessFactor).toBe(2.5); // Should remain unchanged for GOOD
    });
  });

  describe('response quality handling', () => {
    it('should handle FORGOT responses correctly', () => {
      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 2.0,
        interval: 30,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
      
      expect(result.state.repetitions).toBe(0);
      expect(result.resetToLearning).toBe(true);
      expect(result.state.easinessFactor).toBeLessThan(2.0);
    });

    it('should handle HARD responses', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.5,
        interval: 15,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.HARD);
      
      expect(result.state.repetitions).toBe(4);
      expect(result.state.easinessFactor).toBeLessThan(2.5);
      expect(result.easeChange).toBeLessThan(0);
    });

    it('should handle EASY responses', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.0,
        interval: 15,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.repetitions).toBe(4);
      expect(result.state.easinessFactor).toBeGreaterThan(2.0);
      expect(result.easeChange).toBeGreaterThan(0);
    });
  });

  describe('extreme scenarios', () => {
    it('should handle consecutive forgot responses without breaking', () => {
      let state: SM2State = {
        repetitions: 10,
        easinessFactor: 2.5,
        interval: 100,
        isLearning: false
      };

      // Apply 10 consecutive forgot responses
      for (let i = 0; i < 10; i++) {
        const result = algorithm.calculateNext(state, ResponseQuality.FORGOT);
        state = result.state;
      }

      expect(state.repetitions).toBe(0);
      expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should handle very large intervals', () => {
      const state: SM2State = {
        repetitions: 20,
        easinessFactor: 2.8,
        interval: 365 * 5, // 5 years
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(Number.isFinite(result.state.interval)).toBe(true);
      expect(Number.isInteger(result.state.interval)).toBe(true);
      expect(result.state.interval).toBeGreaterThan(0);
    });

    it('should be deterministic with identical inputs', () => {
      const state: SM2State = {
        repetitions: 5,
        easinessFactor: 2.3,
        interval: 25,
        isLearning: false
      };

      const result1 = algorithm.calculateNext(state, ResponseQuality.GOOD);
      const result2 = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      expect(result1.state).toEqual(result2.state);
      expect(result1.interval).toBe(result2.interval);
      expect(result1.easeChange).toBe(result2.easeChange);
    });
  });

  describe('configuration edge cases', () => {
    it('should handle custom configuration parameters', () => {
      const customAlgorithm = new SM2Algorithm({
        minEase: 1.5,
        maxEase: 2.8,
        easyBonus: 1.5,
        intervalModifier: 0.8,
        learningSteps: [5, 15],
        graduatingInterval: 2,
        easyInterval: 6,
        hardFactor: 0.1,
        forgotFactor: 0.25,
        easyFactor: 0.2
      });

      const state: SM2State = {
        repetitions: 2,
        easinessFactor: 2.0,
        interval: 10,
        isLearning: false
      };

      const result = customAlgorithm.calculateNext(state, ResponseQuality.EASY);
      
      expect(result.state.easinessFactor).toBeLessThanOrEqual(2.8);
      expect(result.state.easinessFactor).toBeGreaterThan(2.0);
    });
  });

  describe('mathematical precision', () => {
    it('should handle floating point calculations correctly', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 1.7,
        interval: 7,
        isLearning: false
      };

      const result = algorithm.calculateNext(state, ResponseQuality.GOOD);
      
      // Ensure calculations produce reasonable values
      expect(result.state.easinessFactor).toBeGreaterThanOrEqual(1.3);
      expect(result.state.easinessFactor).toBeLessThanOrEqual(3.0);
      expect(Number.isInteger(result.state.interval)).toBe(true);
    });

    it('should handle rapid successive calculations', () => {
      let state: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        isLearning: true,
        learningStep: 0
      };

      const startTime = performance.now();
      
      // Perform 1000 calculations
      for (let i = 0; i < 1000; i++) {
        const quality = i % 4 as ResponseQuality;
        const result = algorithm.calculateNext(state, quality);
        state = result.state;
      }
      
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
      expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
      expect(state.easinessFactor).toBeLessThanOrEqual(3.0);
    });
  });
});