# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-07-27

### Changed
- Comprehensive errorhandling improvements: custom domain errors, failfast validation, narrow exception catching, elimination of null returns, and centralized ErrorHandler

## [1.0.2] - 2025-07-31

### Added
- **Multi-Model AI Classification System**: Implemented scalable architecture for multiple transformer models
  - Created IModelFactory interface with factory pattern for model instantiation
  - Added UniversalClassificationService supporting all major transformer models
  - Downloaded and integrated 4 AI models: DistilBERT, BART-large-mnli, RoBERTa-large-mnli, DeBERTa-v3-large
  - Implemented model configuration system with performance specifications
- **Text Segmentation Service**: Advanced OCR text processing for improved accuracy
  - Created ITextSegmenter interface with sentence-based segmentation (line-based fallback)
  - Added SegmentedClassificationService for intelligent text analysis
  - Segment-level classification with configurable confidence thresholds
- **Enhanced Testing**: Added 30+ new tests including real AI model integration tests
  - Real-time AI classification verification with downloaded models
  - End-to-end flow testing from segmentation to classification
  - Factory pattern and dependency injection testing
- **Text Preprocessing Service**: Implemented comprehensive text preprocessing with Python SymSpell integration
  - Created ITextPreprocessor interface with dependency injection support
  - Added spell checking with automatic dictionary download
  - OCR output cleaning (UI artifacts, navigation elements, file paths)
  - Real-time spell correction for improved classification accuracy
- **Build Process**: Updated to automatically copy Python files to dist/ directory
- **Virtual Environment**: Set up Python environment with requirements.txt for spell checking dependencies

### Changed
- **Architecture Refactoring**: Implemented Single Responsibility Principle (SRP) across classification services
  - Removed preprocessing from classification services (SRP violation fix)
  - SegmentedClassificationService now orchestrates the full pipeline
  - Clean separation: preprocessing → segmentation → classification → threshold evaluation
- **Dependency Injection**: Updated container.ts with factory-based model selection
  - Dynamic model instantiation based on environment configuration
  - Removed direct preprocessing dependencies from classification services
- **Model Performance**: Upgraded from DistilBERT-only to multi-model architecture
  - BART-large-mnli: 1.63GB, highest accuracy, 10-15s initialization
  - RoBERTa-large-mnli: 1.42GB, high accuracy, 8-12s initialization  
  - DeBERTa-v3-large: 1.74GB, highest accuracy, 12-18s initialization
  - Real AI testing shows 54.5-85.7% confidence on technical content
- **Clean Code Refactoring**: Massive codebase cleanup following CLAUDE.md principles
  - Replaced console.log with proper logging throughout codebase
  - Extracted complex methods into smaller, focused functions (ElectronCaptureService)
  - Removed unnecessary comments in favor of self-documenting code
  - Improved method names (performIdleRevalidation, handleWindowChange, processCurrentWindow)
  - Better abstraction levels in Orchestrator class
- **Fail-Fast Architecture**: Removed ALL fallback logic per clean coding principles
  - No graceful degradation - system fails properly when components fail
  - Eliminated fallback handling in classification services

### Removed
- All preprocessing logic from UniversalClassificationService (SRP compliance)
- Legacy DistilBARTService preprocessing dependencies
- All fallback logic across the entire codebase
- CI/CD workflows (moved to .github_disabled/)
- Large comment blocks and inline documentation
- Old DistilBARTService.real.test.ts file

### Fixed
- Model name mapping for local model paths (facebook/bart-large-mnli → bart-large-mnli)
- Test expectations updated for new model resolution system
- State classes (IdleState, StudyingState) updated to use new method names
- Method signature consistency across state pattern implementation

## [Unreleased]
### Security