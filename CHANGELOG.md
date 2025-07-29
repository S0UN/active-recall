# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-07-27

### Changed
- Comprehensive errorhandling improvements: custom domain errors, failfast validation, narrow exception catching, elimination of null returns, and centralized ErrorHandler

## [Unreleased]

### Added
- **Text Preprocessing Service**: Implemented comprehensive text preprocessing with Python SymSpell integration
  - Created ITextPreprocessor interface with dependency injection support
  - Added spell checking with automatic dictionary download
  - OCR output cleaning (UI artifacts, navigation elements, file paths)
  - Real-time spell correction for improved classification accuracy
- **Enhanced Testing**: Added integration and E2E tests for complete preprocessing pipeline
- **Build Process**: Updated to automatically copy Python files to dist/ directory
- **Virtual Environment**: Set up Python environment with requirements.txt for spell checking dependencies

### Changed
- **Clean Code Refactoring**: Massive codebase cleanup following CLAUDE.md principles
  - Replaced console.log with proper logging throughout codebase
  - Extracted complex methods into smaller, focused functions (ElectronCaptureService)
  - Removed unnecessary comments in favor of self-documenting code
  - Improved method names (performIdleRevalidation, handleWindowChange, processCurrentWindow)
  - Better abstraction levels in Orchestrator class
- **Fail-Fast Architecture**: Removed ALL fallback logic per clean coding principles
  - No graceful degradation - system fails properly when components fail
  - Eliminated fallback handling in DistilBARTService and TextPreprocessor
- **Dependency Injection**: Integrated TextPreprocessor into DistilBARTService via constructor injection
- **Error Handling**: Updated integration tests to expect failures instead of graceful handling

### Removed
- All fallback logic across the entire codebase
- CI/CD workflows (moved to .github_disabled/)
- Large comment blocks and inline documentation
- Old DistilBARTService.real.test.ts file

### Fixed
- State classes (IdleState, StudyingState) updated to use new method names
- Test suite updated for renamed methods (performIdleRevalidation, handleWindowChange)
- Method signature consistency across state pattern implementation
### Security