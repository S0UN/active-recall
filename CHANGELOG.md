# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-07-27

### Changed
- Comprehensive errorhandling improvements: custom domain errors, failfast validation, narrow exception catching, elimination of null returns, and centralized ErrorHandler

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
- Fixed screen capture error on macOS by updating source matching logic to handle platform-specific screen naming conventions ("Entire screen" on macOS vs "Screen 1" on other platforms)
- Added fallback logic to use first available screen source when primary display match fails
- Improved error messages to include list of available screen sources for easier debugging
- Fixed DistilBARTService initialization error by adding proper service initialization in Orchestrator startup sequence

### Changed
- Improved classification accuracy by using broader, more descriptive labels for zero-shot classification
- Added hypothesis template for better zero-shot classification performance
- Added text preprocessing to clean OCR output and remove UI artifacts before classification
- Enhanced logging to show which label scored highest during classification

### Development Session Summary
- Identified classification accuracy issues with current zero-shot approach
- Researched and planned implementation of advanced NLI-based classification pipeline
- Explored dependency inversion patterns (later rolled back in favor of proper IClassificationService implementations)
- Documented comprehensive improvement strategy for arbitrary category classification
### Security