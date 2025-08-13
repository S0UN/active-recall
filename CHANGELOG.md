# Changelog

All notable changes to the Active Recall project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2025-01-13

### Added - Sprint 1: Data Models & Core Contracts ✅

#### Core Data Layer
- **Complete Zod Schema System** (`src/core/contracts/schemas.ts`)
  - 5 core schemas: Batch, ConceptCandidate, ConceptArtifact, FolderManifest + supporting schemas
  - Runtime validation at all data boundaries with automatic TypeScript type inference
  - 18 comprehensive schema validation tests

#### Domain Models
- **ConceptCandidate Domain Model** (`src/core/domain/ConceptCandidate.ts`)
  - Rich domain object with business logic for text processing
  - Multi-step normalization pipeline (lowercase, trim, collapse spaces, remove UI artifacts)
  - Quality scoring algorithm to filter low-quality text
  - Deterministic ID generation based on content hash + metadata
  - 19 comprehensive behavioral tests

- **FolderPath Value Object** (`src/core/domain/FolderPath.ts`)
  - Immutable hierarchical path representation with validation
  - Path operations: parent, child, ancestors, siblings, relationships
  - Special folder support: Unsorted, Provisional with type detection
  - Cross-platform file system compatibility (max depth 4, reserved names, safe characters)
  - 38 comprehensive operation tests

#### Repository Interface Contracts
- **Repository Interfaces** (`src/core/contracts/repositories.ts`)
  - IConceptArtifactRepository: Artifact storage with idempotent operations
  - IFolderRepository: Folder hierarchy management with atomic operations
  - IBatchRepository: Input batch audit trail storage
  - 37 contract tests that any implementation must pass

#### Integration & Testing
- **End-to-End Integration Tests** (`src/core/contracts/integration.test.ts`)
  - Complete pipeline flow validation: Batch → Candidate → Artifact → Storage
  - Schema composition verification (all schemas work together)
  - Referential integrity testing across data relationships
  - Error handling and edge case validation

#### Infrastructure
- **Development Environment Setup**
  - Docker Compose with Qdrant (vector DB) and Redis (cache)
  - Health checks and persistent volume configuration
  - Development-optimized service settings

#### Configuration System
- **Comprehensive Environment Configuration** (`.env`)
  - 150+ configuration options with clear documentation
  - Feature flags for gradual rollout strategy
  - Processing thresholds and quality settings
  - Integration bridge configuration for existing system
  - LLM and AI feature preparation (disabled by default)

#### Documentation
- **Complete Design Documentation** (`docs/SPRINT-1-DESIGN-EXPLAINED.md`)
  - Detailed explanation of all design decisions and rationale
  - Architecture patterns and integration strategies
  - Infrastructure setup and configuration explanation
  - Development workflow and data inspection procedures

### Changed

#### Code Organization
- Cleaned up Sprint 0 skeleton code (removed empty directories and unused files)
- Organized code into clear domain/contracts structure
- Removed premature interface definitions not needed until later sprints

#### Testing Infrastructure
- Enhanced test setup with reflect-metadata for dependency injection compatibility
- Created contract test framework for repository implementations
- Established comprehensive integration testing patterns

### Technical Metrics
- **117 passing tests** with comprehensive behavioral coverage
- **0 technical debt** (no TODO/FIXME comments)
- **Type-safe throughout** with strict TypeScript checking
- **Self-documenting code** with clear method and class names

### Foundation for Sprint 2
- Repository interfaces ready for file system and database implementations
- Domain models handle all business logic processing
- Schema system ensures data integrity throughout pipeline
- Configuration and infrastructure ready for storage layer implementation

---

## [1.0.0] - 2025-01-09

### Added - Sprint 0: Foundation & Architecture ✅

#### Core System Setup
- Project structure and development environment
- TypeScript configuration with strict type checking
- Vitest testing framework setup
- Docker Compose for external dependencies

#### Existing System (Pre-Sprint 0)
- OCR-based text capture system
- Window monitoring and polling services
- Basic classification and batching services
- Electron desktop application framework

### Infrastructure
- Dependency injection container pattern
- Configuration management system
- Error handling framework
- Development scripts and tooling

---

## Format Notes

- **Added** for new features
- **Changed** for changes in existing functionality  
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** in case of vulnerabilities

Each entry includes the sprint context and completion status for better project tracking.