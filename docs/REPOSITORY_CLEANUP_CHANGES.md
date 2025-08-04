# Repository Cleanup Changes

## Date: 2025-08-03

### Summary
This update removes model recommendation functionality to simplify the codebase and implements a configurable delay for tab switching to prevent unnecessary processing.

### Files Changed

#### 1. UniversalModelFactory.ts (`src/main/services/analysis/impl/UniversalModelFactory.ts`)
- **Removed**: `ModelRequirements` and `StrategyRecommendation` types
- **Removed**: `recommendStrategy()` method
- **Removed**: `benchmarkStrategies()` and related methods
- **Modified**: Auto-selection now defaults to `zero-shot` with `roberta-large-mnli` instead of using recommendation system
- **Modified**: `createBestAvailableClassifier()` now directly creates zero-shot classifier

#### 2. StrategyEvaluator.ts (`src/main/services/analysis/impl/StrategyEvaluator.ts`)
- **Removed**: `TestCase`, `BenchmarkResult`, `BenchmarkResults`, and `StrategyCandidate` types
- **Removed**: `recommendStrategy()` method and all related recommendation logic
- **Removed**: `benchmarkStrategies()` method and all benchmarking functionality
- **Kept**: Basic strategy evaluation and performance data functionality

#### 3. DistilBARTService.ts (`src/main/services/analysis/impl/DistilBARTService.ts`)
- **Deleted**: Entire file removed as it's no longer needed with full models

#### 4. Test Files Deleted
- **Deleted**: `src/main/testRunner.ts` - Model testing runner
- **Deleted**: `src/test/ClassificationTester.ts` - Model comparison testing utilities

#### 5. ConfigService.ts (`src/main/configs/ConfigService.ts`)
- **Added**: `newWindowPipelineDelayMs` configuration (default: 15000ms / 15 seconds)
- Configurable via environment variable: `NEW_WINDOW_PIPELINE_DELAY_MS`

#### 6. IPollingConfig.ts (`src/main/configs/IPollingConfig.ts`)
- **Added**: `newWindowPipelineDelayMs: number` to interface

#### 7. Orchestrator.ts (`src/main/services/Orchestrator.ts`)
- **Added**: `pendingPipelineTimer` property to track scheduled pipeline executions
- **Added**: `cancelPendingPipeline()` method to cancel pending executions
- **Added**: `schedulePipelineExecution()` method to delay pipeline execution
- **Modified**: `handleWindowChange()` now schedules delayed pipeline execution instead of immediate
- **Modified**: `configureOptimalStrategy()` simplified to use default strategy
- **Removed**: Strategy recommendation logic

### New Feature: Tab Switching Delay

When switching to a new tab/window, the system now waits for a configurable period (default 15 seconds) before running the full OCR and classification pipeline. If the user switches tabs again before the delay expires, the pending pipeline execution is cancelled.

This prevents unnecessary processing when users are quickly switching between tabs.

### Configuration

The delay can be configured through the environment variable:
```bash
NEW_WINDOW_PIPELINE_DELAY_MS=20000  # 20 seconds
```

### Rationale

1. **Model Recommendation Removal**: With full (non-quantized) models being used, the recommendation system is no longer necessary as the models will be performant enough by default.

2. **Tab Switching Delay**: Prevents resource waste when users are quickly navigating between tabs, improving overall system performance.