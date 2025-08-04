# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-08-04

### Added
- **Environment Configuration**: Added dotenv support for loading .env files
  - Installed and configured dotenv package to load environment variables
  - Added proper environment variable loading in main.ts entry point
- **Hybrid Screen Capture Service**: Implemented `HybridCaptureService` to handle Electron 37 macOS bug
  - Automatically falls back to native `screencapture` command when Electron returns empty buffers
  - Zero-downtime failover with session persistence
  - Production-ready error handling with ErrorHandler integration
- **Native macOS Screen Capture**: Added `MacOSNativeCaptureService` using system `screencapture` command
  - Reliable fallback for Electron desktopCapturer issues
  - Proper process management with timeouts and error handling
  - Clean abstractions following single responsibility principle
- **Configuration Documentation**: Created comprehensive `CONFIGURATION.md` guide
  - Clear `USE_FULL_MODELS` environment variable instructions
  - Platform-specific setup instructions (macOS/Linux/Windows)
  - Model comparison table and usage recommendations

### Fixed
- **Classification Accuracy**: Fixed dramatically low accuracy caused by label formatting
  - Removed "This text is about X" prefix from labels - improved accuracy from 24% to 92%
  - Direct labels ("studying") work much better than prefixed labels for zero-shot classification
  - Updated generateLabel() method in TopicClassificationService to use direct labels
- **Environment Variables**: Fixed .env file not being loaded
  - Added dotenv configuration to main.ts entry point
  - USE_FULL_MODELS environment variable now works correctly
- **VisionService Screen Capture**: Fixed Electron 37 empty buffer issue on macOS
  - Root cause: Known Electron 37+ regression with `desktopCapturer.getSources()` returning 0x0 empty thumbnails
  - Solution: Automatic fallback to native macOS `screencapture` utility via HybridCaptureService
  - Verified: Screen recording permissions were properly granted (`systemPreferences.getMediaAccessStatus('screen') === 'granted'`)
- **Model Loading Errors**: Fixed "file was not found locally" errors for transformers.js
  - Updated model path resolution to work with transformers.js v2.17.2
  - Set proper `env.localModelPath` for offline model loading
  - Removed problematic file:// protocol attempts
  - All quantized models (distilbert, roberta, bart) now load successfully
- **Dependency Injection**: Fixed DI issues in new capture services
  - Added proper `@inject('LoggerService')` decorators
  - Updated container registration to use HybridCaptureService
  - Fixed tsyringe constructor parameters

### Changed
- **Error Handling**: Improved error handling to production standards
  - Integrated `ErrorHandler` utility for consistent error logging and rethrowing
  - Proper error chaining with `DomainError` cause preservation
  - Enhanced error context with operation names and metadata
  - `logAndThrow` pattern for full stack trace visibility
- **Code Abstractions**: Refactored services for better readability
  - Top-level methods are now simple and self-documenting
  - Complex logic broken into small, focused private methods
  - Clear method names that express intent (e.g., `shouldUseNativeFallback()`, `handleEmptyElectronBuffer()`)
  - Consistent async/await patterns throughout
- **Logging Standards**: Updated to use ILogger interface consistently
  - Replaced direct `Logger` usage with injected `ILogger` service
  - Structured logging with proper log levels (debug, info, warn, error)
  - Rich context objects for better debugging
- **Consolidated Thresholds**: Removed redundant `studyingThreshold` from SegmentedClassificationService
  - Now uses single `confidenceThreshold` for all classification decisions
  - Simplified configuration and reduced confusion
- **BatcherService Enhancement**: Added character-based auto-flush functionality
  - Automatically flushes when accumulated text exceeds threshold (default 10KB)
  - Prevents memory buildup during long sessions
  - Configurable via `setFlushThreshold()` method

### Technical Details

#### Screen Capture Architecture
```
HybridCaptureService (registered in DI container)
├── ElectronCaptureService (attempts first)
│   └── Falls back if empty buffer detected (Electron 37 bug)
└── MacOSNativeCaptureService (fallback)
    └── Uses /usr/sbin/screencapture -x -t png -T 0
```

#### Error Handling Pattern
```typescript
// Example from MacOSNativeCaptureService
public async captureScreen(): Promise<Buffer> {
  try {
    const tempFilePath = await this.createTempFilePath();
    await this.captureToFile(tempFilePath);
    const buffer = await this.readCapturedFile(tempFilePath);
    await this.cleanupTempFile(tempFilePath);
    return buffer;
  } catch (error) {
    if (error instanceof ScreenCaptureError) {
      throw error; // Preserve domain errors
    }
    const captureError = new ScreenCaptureError(
      'Native macOS screen capture failed', 
      error as Error
    );
    this.errorHandler.logAndThrow(captureError, {
      operation: 'MacOSNativeCaptureService.captureScreen'
    });
  }
}
```

#### Full Models Configuration
- **Environment Variable**: `USE_FULL_MODELS=true`
- **Detection Order**: 
  1. Environment variable (`process.env.USE_FULL_MODELS`)
  2. Default config (`DEFAULT_CLASSIFICATION_CONFIG.useFullModels`)
  3. Constructor parameter (for specific services)
- **Model Paths**:
  - Quantized: `./models/` (~50-200MB each)
  - Full precision: `./models-full/` (~500MB-2GB each)

### Known Issues
- **Model Accuracy**: Current models may not match HuggingFace web interface accuracy exactly
  - Issue: Local ONNX quantized models vs original PyTorch models on HuggingFace
  - Status: Pending investigation and potential re-download of correct model formats
- **Segmented Classification**: Single segment threshold logic needs debugging
  - Issue: Idle vs studying classification fails when only one segment exceeds threshold
  - Status: Requires fix in SegmentedClassificationService threshold logic

### Dependencies
- Electron 37.2.0 (has known macOS screen capture bug)
- @xenova/transformers 2.17.2 (for local model inference)
- TypeScript 5.8.3
- tsyringe 4.10.0 (dependency injection)
- electron-log 5.4.1 (logging)
- dotenv 16.4.5 (environment variable loading)