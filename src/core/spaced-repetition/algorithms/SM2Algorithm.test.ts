/**
 * SM-2 Algorithm Tests
 * 
 * Comprehensive tests for the SM-2 spaced repetition algorithm implementation.
 * Tests algorithm correctness, edge cases, and configuration handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SM2Algorithm, SM2Config, SM2State, DEFAULT_SM2_CONFIG, SM2Utils } from './SM2Algorithm';
import { ResponseQuality } from '../domain/ReviewSchedule';

describe('SM2Algorithm', () => {
  let algorithm: SM2Algorithm;

  beforeEach(() => {
    algorithm = new SM2Algorithm();
  });

  describe('createInitialState', () => {
    it('should create correct initial state for new card', () => {
      const state = algorithm.createInitialState();
      
      expect(state.repetitions).toBe(0);
      expect(state.easinessFactor).toBe(2.5);
      expect(state.interval).toBe(0);
      expect(state.learningStep).toBe(0);
      expect(state.isLearning).toBe(true);
    });
  });

  describe('learning phase', () => {
    let initialState: SM2State;

    beforeEach(() => {
      initialState = algorithm.createInitialState();
    });

    it('should advance through learning steps with good responses', () => {
      // First good response - advance to step 1
      const result1 = algorithm.calculateNext(initialState, ResponseQuality.GOOD);
      
      expect(result1.state.isLearning).toBe(true);
      expect(result1.state.learningStep).toBe(1);
      expect(result1.state.repetitions).toBe(0);
      expect(result1.graduated).toBe(false);

      // Second good response - graduate
      const result2 = algorithm.calculateNext(result1.state, ResponseQuality.GOOD);
      
      expect(result2.state.isLearning).toBe(false);
      expect(result2.state.learningStep).toBeUndefined();
      expect(result2.state.repetitions).toBe(1);
      expect(result2.graduated).toBe(true);
      expect(result2.state.interval).toBe(DEFAULT_SM2_CONFIG.graduatingInterval);
    });

    it('should graduate immediately on easy response', () => {
      const result = algorithm.calculateNext(initialState, ResponseQuality.EASY);
      
      expect(result.state.isLearning).toBe(false);
      expect(result.graduated).toBe(true);
      expect(result.state.repetitions).toBe(1);
      expect(result.state.interval).toBe(DEFAULT_SM2_CONFIG.easyInterval);
      expect(result.state.easinessFactor).toBe(2.65); // 2.5 + 0.15
    });

    it('should reset to first learning step on forgot response', () => {
      // Advance to second learning step
      const advanced = algorithm.calculateNext(initialState, ResponseQuality.GOOD);
      
      // Then forget
      const result = algorithm.calculateNext(advanced.state, ResponseQuality.FORGOT);
      
      expect(result.state.isLearning).toBe(true);
      expect(result.state.learningStep).toBe(0);
      expect(result.state.repetitions).toBe(0);
      expect(result.resetToLearning).toBe(true);
      expect(result.state.easinessFactor).toBe(2.3); // 2.5 - 0.2
    });
  });

  describe('reviewing phase', () => {
    let reviewingState: SM2State;

    beforeEach(() => {
      reviewingState = {
        repetitions: 2,
        easinessFactor: 2.5,
        interval: 6,
        isLearning: false
      };
    });

    it('should calculate correct interval for good response', () => {
      const result = algorithm.calculateNext(reviewingState, ResponseQuality.GOOD);
      
      expect(result.state.repetitions).toBe(3);
      expect(result.state.easinessFactor).toBe(2.5); // No change
      expect(result.state.interval).toBe(15); // 6 * 2.5
      expect(result.graduated).toBe(false);
      expect(result.easeChange).toBe(0);
    });

    it('should apply easy bonus and increase ease', () => {
      const result = algorithm.calculateNext(reviewingState, ResponseQuality.EASY);
      
      expect(result.state.repetitions).toBe(3);
      expect(result.state.easinessFactor).toBe(2.65); // 2.5 + 0.15
      expect(result.state.interval).toBe(21); // Math.round(6 * 2.65 * 1.3)
      expect(result.easeChange).toBe(0.15);
    });

    it('should reduce ease and apply hard multiplier for hard response', () => {
      const result = algorithm.calculateNext(reviewingState, ResponseQuality.HARD);
      
      expect(result.state.repetitions).toBe(3);
      expect(result.state.easinessFactor).toBe(2.35); // 2.5 - 0.15
      expect(result.state.interval).toBe(17); // Math.round(6 * 2.35 * 1.2)
      expect(result.easeChange).toBe(-0.15);
    });

    it('should reset to learning on forgot response', () => {
      const result = algorithm.calculateNext(reviewingState, ResponseQuality.FORGOT);
      
      expect(result.state.isLearning).toBe(true);
      expect(result.state.repetitions).toBe(0);
      expect(result.state.learningStep).toBe(0);
      expect(result.state.easinessFactor).toBe(2.3); // 2.5 - 0.2
      expect(result.resetToLearning).toBe(true);
    });
  });

  describe('ease factor bounds', () => {
    it('should not allow ease factor below minimum', () => {
      const lowEaseState: SM2State = {
        repetitions: 5,
        easinessFactor: 1.4,
        interval: 10,
        isLearning: false
      };

      const result = algorithm.calculateNext(lowEaseState, ResponseQuality.HARD);
      expect(result.state.easinessFactor).toBe(1.3); // Should clamp to minimum
    });

    it('should not allow ease factor above maximum', () => {
      const highEaseState: SM2State = {
        repetitions: 10,
        easinessFactor: 2.9,
        interval: 50,
        isLearning: false
      };

      const result = algorithm.calculateNext(highEaseState, ResponseQuality.EASY);
      expect(result.state.easinessFactor).toBe(3.0); // Should clamp to maximum
    });

    it('should handle multiple consecutive failures without going below minimum', () => {
      let state = algorithm.createInitialState();
      
      // Graduate first
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      
      // Then fail repeatedly
      for (let i = 0; i < 10; i++) {
        state = algorithm.calculateNext(state, ResponseQuality.FORGOT).state;
      }
      
      expect(state.easinessFactor).toBe(1.3);
    });
  });

  describe('custom configuration', () => {
    it('should use custom configuration values', () => {
      const customConfig: Partial<SM2Config> = {
        minEase: 1.5,
        maxEase: 3.0,
        easyBonus: 1.5,
        graduatingInterval: 2
      };
      
      const customAlgorithm = new SM2Algorithm(customConfig);
      const config = customAlgorithm.getConfig();
      
      expect(config.minEase).toBe(1.5);
      expect(config.maxEase).toBe(3.0);
      expect(config.easyBonus).toBe(1.5);
      expect(config.graduatingInterval).toBe(2);
      
      // Should still have defaults for unspecified values
      expect(config.hardFactor).toBe(DEFAULT_SM2_CONFIG.hardFactor);
    });

    it('should apply custom learning steps', () => {
      const customAlgorithm = new SM2Algorithm({
        learningSteps: [5, 15, 60] // 5min, 15min, 60min
      });
      
      let state = customAlgorithm.createInitialState();
      
      // Should take 3 good responses to graduate
      state = customAlgorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.isLearning).toBe(true);
      expect(state.learningStep).toBe(1);
      
      state = customAlgorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.isLearning).toBe(true);
      expect(state.learningStep).toBe(2);
      
      const result = customAlgorithm.calculateNext(state, ResponseQuality.GOOD);
      expect(result.graduated).toBe(true);
      expect(result.state.isLearning).toBe(false);
    });
  });

  describe('interval calculations', () => {
    it('should follow SM-2 progression for first few reviews', () => {
      let state = algorithm.createInitialState();
      
      // Graduate from learning
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      
      expect(state.interval).toBe(1); // Graduating interval
      expect(state.repetitions).toBe(1);
      
      // First review after graduation -> 6 days
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.interval).toBe(6);
      expect(state.repetitions).toBe(2);
      
      // Second review -> 6 * 2.5 = 15 days
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.interval).toBe(15);
      expect(state.repetitions).toBe(3);
    });

    it('should ensure minimum interval of 1 day', () => {
      const lowIntervalState: SM2State = {
        repetitions: 3,
        easinessFactor: 1.3,
        interval: 1,
        isLearning: false
      };

      const result = algorithm.calculateNext(lowIntervalState, ResponseQuality.HARD);
      expect(result.state.interval).toBeGreaterThanOrEqual(1);
    });
  });

  describe('learning step conversion', () => {
    it('should convert minutes to days correctly', () => {
      const algorithm = new SM2Algorithm({
        learningSteps: [1, 1440] // 1 minute, 1 day in minutes
      });
      
      let state = algorithm.createInitialState();
      
      // First step: 1 minute -> should be 1 day (minimum)
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.interval).toBe(1);
      
      // Second step: 1440 minutes = 1 day
      state = algorithm.calculateNext(state, ResponseQuality.GOOD).state;
      expect(state.interval).toBe(1);
    });
  });
});

describe('SM2Algorithm static methods', () => {
  describe('isMature', () => {
    it('should identify mature cards correctly', () => {
      const matureState: SM2State = {
        repetitions: 5,
        easinessFactor: 2.0,
        interval: 25,
        isLearning: false
      };
      
      expect(SM2Algorithm.isMature(matureState)).toBe(true);
    });

    it('should not identify learning cards as mature', () => {
      const learningState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        learningStep: 0,
        isLearning: true
      };
      
      expect(SM2Algorithm.isMature(learningState)).toBe(false);
    });

    it('should not identify young cards as mature', () => {
      const youngState: SM2State = {
        repetitions: 2,
        easinessFactor: 2.5,
        interval: 6,
        isLearning: false
      };
      
      expect(SM2Algorithm.isMature(youngState)).toBe(false);
    });
  });

  describe('isYoung', () => {
    it('should identify young cards correctly', () => {
      const youngState: SM2State = {
        repetitions: 2,
        easinessFactor: 2.5,
        interval: 6,
        isLearning: false
      };
      
      expect(SM2Algorithm.isYoung(youngState)).toBe(true);
    });

    it('should not identify learning cards as young', () => {
      const learningState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        learningStep: 0,
        isLearning: true
      };
      
      expect(SM2Algorithm.isYoung(learningState)).toBe(false);
    });

    it('should not identify mature cards as young', () => {
      const matureState: SM2State = {
        repetitions: 5,
        easinessFactor: 2.0,
        interval: 25,
        isLearning: false
      };
      
      expect(SM2Algorithm.isYoung(matureState)).toBe(false);
    });
  });

  describe('calculateRetentionProbability', () => {
    it('should calculate reasonable retention for learning cards', () => {
      const learningState: SM2State = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1,
        learningStep: 0,
        isLearning: true
      };
      
      const retention = SM2Algorithm.calculateRetentionProbability(learningState, 0);
      expect(retention).toBe(0.8);
    });

    it('should calculate higher retention for easier cards', () => {
      const easyState: SM2State = {
        repetitions: 5,
        easinessFactor: 2.5,
        interval: 30,
        isLearning: false
      };
      
      const hardState: SM2State = {
        repetitions: 5,
        easinessFactor: 1.5,
        interval: 10,
        isLearning: false
      };
      
      const easyRetention = SM2Algorithm.calculateRetentionProbability(easyState, 1);
      const hardRetention = SM2Algorithm.calculateRetentionProbability(hardState, 1);
      
      expect(easyRetention).toBeGreaterThan(hardRetention);
    });

    it('should show decreasing retention over time', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.0,
        interval: 15,
        isLearning: false
      };
      
      const retention0 = SM2Algorithm.calculateRetentionProbability(state, 0);
      const retention5 = SM2Algorithm.calculateRetentionProbability(state, 5);
      const retention15 = SM2Algorithm.calculateRetentionProbability(state, 15);
      
      expect(retention0).toBeGreaterThan(retention5);
      expect(retention5).toBeGreaterThan(retention15);
    });
  });
});

describe('SM2Utils', () => {
  describe('conversion methods', () => {
    it('should convert between SM2State and ReviewParameters', () => {
      const state: SM2State = {
        repetitions: 3,
        easinessFactor: 2.0,
        interval: 15,
        isLearning: false
      };
      
      const params = SM2Utils.toReviewParameters(state);
      expect(params.repetitions).toBe(3);
      expect(params.easinessFactor).toBe(2.0);
      expect(params.interval).toBe(15);
      
      const backToState = SM2Utils.fromReviewParameters(params);
      expect(backToState.repetitions).toBe(3);
      expect(backToState.easinessFactor).toBe(2.0);
      expect(backToState.interval).toBe(15);
      expect(backToState.isLearning).toBe(false);
    });

    it('should handle learning state conversion', () => {
      const learningParams = {
        repetitions: 0,
        easinessFactor: 2.5,
        interval: 1
      };
      
      const state = SM2Utils.fromReviewParameters(learningParams);
      expect(state.isLearning).toBe(true);
      expect(state.learningStep).toBe(0);
    });
  });

  describe('calculateDailyReviews', () => {
    it('should estimate daily reviews correctly', () => {
      const states: SM2State[] = [
        { repetitions: 0, easinessFactor: 2.5, interval: 1, isLearning: true, learningStep: 0 },
        { repetitions: 3, easinessFactor: 2.0, interval: 10, isLearning: false },
        { repetitions: 5, easinessFactor: 2.5, interval: 30, isLearning: false }
      ];
      
      const dailyReviews = SM2Utils.calculateDailyReviews(states);
      
      // Learning card: 2, interval 10: 0.1, interval 30: ~0.033
      const expected = 2 + (1/10) + (1/30);
      expect(dailyReviews).toBeCloseTo(expected, 2);
    });
  });

  describe('estimateStudyMinutes', () => {
    it('should estimate study time for due cards', () => {
      const states: SM2State[] = [
        { repetitions: 0, easinessFactor: 2.5, interval: 1, isLearning: true, learningStep: 0 },
        { repetitions: 3, easinessFactor: 2.0, interval: 1, isLearning: false },
        { repetitions: 5, easinessFactor: 2.5, interval: 30, isLearning: false }
      ];
      
      const studyMinutes = SM2Utils.estimateStudyMinutes(states, 30); // 30 seconds per card
      
      // 2 due cards * 30 seconds / 60 = 1 minute
      expect(studyMinutes).toBe(1);
    });
  });
});