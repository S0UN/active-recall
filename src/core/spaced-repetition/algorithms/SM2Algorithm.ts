/**
 * SM-2 Algorithm Implementation
 * 
 * Pure functional implementation of the SuperMemo-2 spaced repetition algorithm
 * with improvements from Anki to prevent "low interval hell" and provide better
 * user experience.
 * 
 * Key features:
 * - Pure functions with no side effects
 * - Configurable parameters
 * - Minimum ease factor protection
 * - Easy bonus multiplier
 * - Graduated intervals for learning
 */

import { ResponseQuality } from '../domain/ReviewSchedule';

/**
 * Configuration parameters for the SM-2 algorithm
 */
export interface SM2Config {
  /** Minimum ease factor (default: 1.3, prevents low interval hell) */
  minEase: number;
  
  /** Maximum ease factor (default: 2.5) */
  maxEase: number;
  
  /** Multiplier applied to easy responses (default: 1.3) */
  easyBonus: number;
  
  /** Global interval modifier (default: 1.0) */
  intervalModifier: number;
  
  /** Learning steps in minutes for new cards (default: [1, 10]) */
  learningSteps: number[];
  
  /** Graduating interval in days (default: 1) */
  graduatingInterval: number;
  
  /** Easy interval in days (default: 4) */
  easyInterval: number;
  
  /** Factor to reduce ease on hard responses (default: 0.15) */
  hardFactor: number;
  
  /** Factor to reduce ease on forgot responses (default: 0.2) */
  forgotFactor: number;
  
  /** Factor to increase ease on easy responses (default: 0.15) */
  easyFactor: number;
}

/**
 * Default SM-2 configuration based on Anki's implementation
 */
export const DEFAULT_SM2_CONFIG: SM2Config = {
  minEase: 1.3,
  maxEase: 3.0, // Allow ease factor to grow beyond 2.5
  easyBonus: 1.3,
  intervalModifier: 1.0,
  learningSteps: [1, 10], // 1 minute, 10 minutes
  graduatingInterval: 1,
  easyInterval: 4,
  hardFactor: 0.15,
  forgotFactor: 0.2,
  easyFactor: 0.15
};

/**
 * Current state of a card in the SM-2 algorithm
 */
export interface SM2State {
  /** Number of successful reviews (n) */
  repetitions: number;
  
  /** Ease factor (EF) - multiplier for interval calculation */
  easinessFactor: number;
  
  /** Current interval in days */
  interval: number;
  
  /** Learning step index (null if graduated from learning) */
  learningStep?: number;
  
  /** Whether the card is in learning mode */
  isLearning: boolean;
}

/**
 * Result of applying SM-2 algorithm calculation
 */
export interface SM2Result {
  /** Updated state */
  state: SM2State;
  
  /** Next review interval in days */
  interval: number;
  
  /** Whether the card graduated from learning */
  graduated: boolean;
  
  /** Whether the card was reset to learning */
  resetToLearning: boolean;
  
  /** Calculated ease factor change */
  easeChange: number;
}

/**
 * SM-2 Algorithm implementation as pure functions
 */
export class SM2Algorithm {
  private readonly config: SM2Config;

  constructor(config: Partial<SM2Config> = {}) {
    this.config = { ...DEFAULT_SM2_CONFIG, ...config };
  }

  /**
   * Create initial state for a new card
   */
  createInitialState(): SM2State {
    return {
      repetitions: 0,
      easinessFactor: 2.5,
      interval: 0, // Will be calculated based on learning steps
      learningStep: 0, // Start at first learning step
      isLearning: true
    };
  }

  /**
   * Calculate next review parameters based on response quality
   */
  calculateNext(currentState: SM2State, quality: ResponseQuality): SM2Result {
    switch (quality) {
      case ResponseQuality.FORGOT:
        return this.handleForgot(currentState);
      case ResponseQuality.HARD:
        return this.handleHard(currentState);
      case ResponseQuality.GOOD:
        return this.handleGood(currentState);
      case ResponseQuality.EASY:
        return this.handleEasy(currentState);
    }
  }

  /**
   * Handle "Forgot" response - reset to learning
   */
  private handleForgot(state: SM2State): SM2Result {
    const newEase = this.adjustEase(state.easinessFactor, -this.config.forgotFactor);
    
    const newState: SM2State = {
      repetitions: 0,
      easinessFactor: newEase,
      interval: this.convertMinutesToDays(this.config.learningSteps[0]),
      learningStep: 0,
      isLearning: true
    };

    return {
      state: newState,
      interval: newState.interval,
      graduated: false,
      resetToLearning: true,
      easeChange: Math.round((newEase - state.easinessFactor) * 100) / 100
    };
  }

  /**
   * Handle "Hard" response - reduce ease, advance normally
   */
  private handleHard(state: SM2State): SM2Result {
    if (state.isLearning) {
      return this.advanceLearningStep(state);
    }

    const newEase = this.adjustEase(state.easinessFactor, -this.config.hardFactor);
    const newInterval = Math.round(state.interval * newEase * 1.2 * this.config.intervalModifier);

    const newState: SM2State = {
      repetitions: state.repetitions + 1,
      easinessFactor: newEase,
      interval: Math.max(1, newInterval),
      learningStep: undefined,
      isLearning: false
    };

    return {
      state: newState,
      interval: newState.interval,
      graduated: false,
      resetToLearning: false,
      easeChange: Math.round((newEase - state.easinessFactor) * 100) / 100
    };
  }

  /**
   * Handle "Good" response - maintain ease, advance normally
   */
  private handleGood(state: SM2State): SM2Result {
    if (state.isLearning) {
      return this.advanceLearningStep(state);
    }

    const newInterval = this.calculateGoodInterval(state);

    const newState: SM2State = {
      repetitions: state.repetitions + 1,
      easinessFactor: state.easinessFactor, // No change for good
      interval: newInterval,
      learningStep: undefined,
      isLearning: false
    };

    return {
      state: newState,
      interval: newInterval,
      graduated: false,
      resetToLearning: false,
      easeChange: 0
    };
  }

  /**
   * Handle "Easy" response - increase ease, give bonus interval
   */
  private handleEasy(state: SM2State): SM2Result {
    if (state.isLearning) {
      // Easy response in learning - graduate immediately
      const newEase = this.adjustEase(state.easinessFactor, this.config.easyFactor);
      const newState: SM2State = {
        repetitions: 1,
        easinessFactor: newEase,
        interval: this.config.easyInterval,
        learningStep: undefined,
        isLearning: false
      };

      return {
        state: newState,
        interval: newState.interval,
        graduated: true,
        resetToLearning: false,
        easeChange: Math.round((newEase - state.easinessFactor) * 100) / 100
      };
    }

    const newEase = this.adjustEase(state.easinessFactor, this.config.easyFactor);
    const baseInterval = this.calculateGoodInterval({ ...state, easinessFactor: newEase });
    const easyInterval = Math.round(baseInterval * this.config.easyBonus);

    const newState: SM2State = {
      repetitions: state.repetitions + 1,
      easinessFactor: newEase,
      interval: easyInterval,
      learningStep: undefined,
      isLearning: false
    };

    return {
      state: newState,
      interval: easyInterval,
      graduated: false,
      resetToLearning: false,
      easeChange: Math.round((newEase - state.easinessFactor) * 100) / 100
    };
  }

  /**
   * Advance through learning steps
   */
  private advanceLearningStep(state: SM2State): SM2Result {
    const currentStep = state.learningStep ?? 0;
    const nextStep = currentStep + 1;

    // Check if we should graduate
    if (nextStep >= this.config.learningSteps.length) {
      // Graduate to reviewing
      const newState: SM2State = {
        repetitions: 1,
        easinessFactor: state.easinessFactor,
        interval: this.config.graduatingInterval,
        learningStep: undefined,
        isLearning: false
      };

      return {
        state: newState,
        interval: newState.interval,
        graduated: true,
        resetToLearning: false,
        easeChange: 0
      };
    }

    // Continue learning
    const nextInterval = this.convertMinutesToDays(this.config.learningSteps[nextStep]);
    const newState: SM2State = {
      repetitions: 0, // Stay at 0 during learning
      easinessFactor: state.easinessFactor,
      interval: nextInterval,
      learningStep: nextStep,
      isLearning: true
    };

    return {
      state: newState,
      interval: nextInterval,
      graduated: false,
      resetToLearning: false,
      easeChange: 0
    };
  }

  /**
   * Calculate interval for good response in reviewing phase
   */
  private calculateGoodInterval(state: SM2State): number {
    if (state.repetitions === 0) {
      return 1; // First review after learning
    }
    if (state.repetitions === 1) {
      return 6; // Second review
    }
    
    // Standard SM-2 formula for subsequent reviews
    const newInterval = Math.round(state.interval * state.easinessFactor * this.config.intervalModifier);
    return Math.max(1, newInterval);
  }

  /**
   * Adjust ease factor within configured bounds
   */
  private adjustEase(currentEase: number, change: number): number {
    const newEase = currentEase + change;
    const bounded = Math.max(
      this.config.minEase,
      Math.min(this.config.maxEase, newEase)
    );
    // Round to avoid floating point precision issues
    return Math.round(bounded * 100) / 100;
  }

  /**
   * Convert minutes to fractional days (minimum 1 day)
   */
  private convertMinutesToDays(minutes: number): number {
    const days = minutes / (24 * 60);
    return Math.max(1, Math.round(days * 100) / 100); // Round to 2 decimal places, min 1 day
  }

  /**
   * Get configuration
   */
  getConfig(): SM2Config {
    return { ...this.config };
  }

  /**
   * Check if a state represents a mature card (long intervals)
   */
  static isMature(state: SM2State): boolean {
    return !state.isLearning && state.interval >= 21;
  }

  /**
   * Check if a state represents a young card (short intervals but graduated)
   */
  static isYoung(state: SM2State): boolean {
    return !state.isLearning && state.interval < 21;
  }

  /**
   * Calculate retention probability based on interval and ease
   * This is an estimate based on typical forgetting curves
   */
  static calculateRetentionProbability(state: SM2State, daysElapsed: number): number {
    if (state.isLearning) {
      return 0.8; // Learning cards have different retention characteristics
    }

    // Simplified retention model: higher ease = better retention
    const baseRetention = 0.9;
    const easeBonus = (state.easinessFactor - 1.3) * 0.1; // 0.0 to 0.12
    const timeDecay = Math.exp(-daysElapsed / (state.interval * 2));
    
    const retention = baseRetention + easeBonus * timeDecay;
    return Math.max(0.1, Math.min(0.99, retention));
  }
}

/**
 * Utility functions for SM-2 algorithm
 */
export class SM2Utils {
  /**
   * Convert SM2State to ReviewParameters (for compatibility with domain model)
   */
  static toReviewParameters(state: SM2State): {
    repetitions: number;
    easinessFactor: number;
    interval: number;
  } {
    return {
      repetitions: state.repetitions,
      easinessFactor: state.easinessFactor,
      interval: state.interval
    };
  }

  /**
   * Create SM2State from ReviewParameters
   */
  static fromReviewParameters(params: {
    repetitions: number;
    easinessFactor: number;
    interval: number;
  }): SM2State {
    return {
      repetitions: params.repetitions,
      easinessFactor: params.easinessFactor,
      interval: params.interval,
      learningStep: params.repetitions === 0 ? 0 : undefined,
      isLearning: params.repetitions === 0
    };
  }

  /**
   * Calculate expected reviews per day for a set of cards
   */
  static calculateDailyReviews(states: SM2State[]): number {
    return states.reduce((total, state) => {
      if (state.isLearning) {
        return total + 2; // Learning cards reviewed multiple times
      }
      return total + (1 / state.interval); // 1/interval = daily probability
    }, 0);
  }

  /**
   * Estimate study time needed based on intervals
   */
  static estimateStudyMinutes(states: SM2State[], averageSecondsPerCard: number = 15): number {
    const dueCards = states.filter(state => state.isLearning || state.interval <= 1).length;
    return Math.round((dueCards * averageSecondsPerCard) / 60);
  }
}