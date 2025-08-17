# Active Recall - Documentation

This directory contains all project documentation organized by category.

## Documentation Structure

### **Core System Documentation**
**Current implementation and architecture**
- `IMPLEMENTATION-ROADMAP.md` - Sprint-by-sprint development plan and current architecture
- `CURRENT-ARCHITECTURE-STATUS.md` - System design overview and component status
- `CONCEPT-ORGANIZER-PLAN.md` - Original concept organization system design
- `CLEAN-CODE-IMPLEMENTATION.md` - Clean code refactoring report and principles applied

### **Sprint Progress Documentation**
**Development milestones and completion reports**
- `SPRINT-0-COMPLETION.md` - Project setup and foundation sprint completion
- `SPRINT-1-COMPLETION.md` - Data models and core contracts sprint completion
- `SPRINT-1-DESIGN-EXPLAINED.md` - Detailed explanation of Sprint 1 design decisions
- `NEXT-SESSION-CONTEXT.md` - Context for continuing development sessions

### `/development/`
**Development guidelines and AI assistant instructions**
- `CLAUDE.md` - Primary development guidelines and coding standards (TDD, clean architecture)

### **Root Documentation**
**Project changelogs and high-level documentation**
- `CHANGELOG.md` - Standard changelog format
- `study.md` - Additional study-related documentation

## Key Documents for Understanding the Project

### For New Developers
1. **Start here**: `development/CLAUDE.md` - Core development philosophy and clean code guidelines
2. **Architecture overview**: `CURRENT-ARCHITECTURE-STATUS.md` - Current system design and components
3. **Implementation details**: `IMPLEMENTATION-ROADMAP.md` - Sprint structure and technical implementation
4. **Clean code practices**: `CLEAN-CODE-IMPLEMENTATION.md` - Refactoring achievements and principles

### For Technical Understanding
1. **Intelligent routing system**: `CONCEPT-ORGANIZER-PLAN.md` - Core concept organization approach
2. **Clean architecture**: `CLEAN-CODE-IMPLEMENTATION.md` - Service extraction and SRP compliance
3. **Configuration system**: `IMPLEMENTATION-ROADMAP.md` - Sprint 2 configuration-driven behavior
4. **Development process**: `development/CLAUDE.md` - TDD and clean code practices

### For Project Status
1. **Current milestone**: Sprint 2 Complete - Clean Code Architecture with Intelligent Routing
2. **Latest achievements**: `CLEAN-CODE-IMPLEMENTATION.md` - Comprehensive refactoring report
3. **Architecture status**: `CURRENT-ARCHITECTURE-STATUS.md` - Component implementation status
4. **Next developments**: `IMPLEMENTATION-ROADMAP.md` - Sprint 3+ planning

## Current Status

**The Active Recall system has completed Sprint 2** with:

### **Intelligent Routing Pipeline (DISTILL → EMBED → ROUTE)**
- **LLM-Powered Distillation** - Extracts titles and summaries from raw content
- **Dual Vector Strategy** - Title vectors for deduplication, context vectors for routing
- **Vector Search Integration** - Qdrant-ready similarity matching with centroid scoring
- **Smart Decision Making** - Confidence-based routing with review queue for ambiguous cases

### **Clean Code Architecture (2025)**
- **Service Extraction** - Broke 700+ line SmartRouter into focused services following SRP
- **Zero Magic Numbers** - Complete configuration-driven behavior via PipelineConfig
- **Pure Functions** - Mathematical utilities (ScoringUtilities) without side effects
- **Intention-Revealing Names** - Self-documenting code without comments
- **Dependency Inversion** - Swappable AI services (OpenAI, local models)

### **Production Ready Implementation**
- **95%+ Test Coverage** - Comprehensive testing of extracted services
- **TypeScript Compilation** - Full type safety with Zod validation
- **Configuration System** - Environment-based tuning with sensible defaults
- **Error Handling** - Graceful degradation and proper error boundaries

## Intelligent Concept Organization System

Our core innovation is an **AI-powered concept organization system** that automatically routes captured knowledge to appropriate folders using:

### **Technical Architecture**
- **DISTILL**: OpenAI LLM enriches raw content with titles and summaries
- **EMBED**: Dual vector generation (title + context) using text-embedding-3-small
- **ROUTE**: Vector similarity search with weighted folder scoring and confidence thresholds

### **Clean Code Implementation**
- **VectorClusteringService**: Pure clustering algorithms extracted from main router
- **ConceptRoutingDecisionMaker**: Decision logic without side effects
- **ScoringUtilities**: Mathematical functions with configuration-driven weights
- **PipelineConfig**: Centralized configuration eliminating all magic numbers

### **Configuration-Driven Behavior**
```typescript
// All thresholds configurable via environment
routing: {
  highConfidenceThreshold: 0.82,  // Auto-route threshold
  lowConfidenceThreshold: 0.65,   // Review queue threshold
  newTopicThreshold: 0.50,        // Unsorted threshold
}
folderScoring: {
  avgSimilarityWeight: 0.6,       // Average similarity emphasis
  maxSimilarityWeight: 0.3,       // Maximum similarity emphasis
  countBonusMultiplier: 0.02,     // Count bonus calculation
}
```

## Development Philosophy

This project follows **strict Clean Code and TDD practices**:

### **Clean Code Principles (2025)**
- **Single Responsibility Principle** - Each service has one clear purpose
- **Pure Functions** - Mathematical operations without side effects
- **Meaningful Names** - Intention-revealing throughout, no comments needed
- **Configuration Over Constants** - Zero magic numbers, all configurable
- **Dependency Inversion** - Interface-based design for testability

### **Testing Excellence**
- **Every feature starts with failing tests**
- **Extracted services tested independently**
- **Configuration system comprehensively validated**
- **Integration tests verify end-to-end pipeline**
- **Real AI testing with actual OpenAI models**

### **Architecture Standards**
- **SOLID principles** applied throughout
- **Extract services** rather than grow monolithic classes
- **Immutability by default** with extensive use of `readonly`
- **Type safety** with TypeScript and Zod validation

See `development/CLAUDE.md` for complete development guidelines and `CLEAN-CODE-IMPLEMENTATION.md` for detailed refactoring achievements.

## Next Steps

**Sprint 3: LLM Enhancement & Summarization**
- Enhanced content summarization
- LLM arbitration for ambiguous routing decisions
- Token budget management
- Advanced concept extraction

See `IMPLEMENTATION-ROADMAP.md` for complete development planning and future sprint details.