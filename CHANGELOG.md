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
### Security