# Active Recall - Documentation

This directory contains all project documentation organized by category.

## 📁 Documentation Structure

### 🏗️ `/architecture/`
**System design and architectural decisions**
- `FACTORY-DESIGN-AND-MODEL-SELECTION.md` - Factory pattern implementation and model selection strategy
- `FINAL-IMPLEMENTATION.md` - Production system architecture and design decisions
- `Orchestrator-Architecture.md` - Orchestrator service design and state management

### 🔬 `/research/`
**Research findings and analysis**
- `SINGLE-LABEL-ANALYSIS.md` - Single-label vs binary classification research
- `TOPIC-CLASSIFICATION-ANALYSIS.md` - Topic classification approach analysis and findings

### 💻 `/development/`
**Development guidelines and AI assistant instructions**
- `CLAUDE.md` - Primary development guidelines and coding standards (TDD, clean architecture)
- `CLAUDE-UNDERSTANDING.md` - Key insights and misunderstandings from development process
- `GEMINI.md` - Alternative AI assistant instructions
- `MIMIIR.MD` - Additional development notes
- `TODO.md` - Development task tracking

### 📋 **Root Documentation**
**Project changelogs and high-level documentation**
- `CHANGE.md` - Comprehensive change log with implementation details and success metrics
- `CHANGELOG.md` - Standard changelog format
- `CHANGES.md` - Additional change tracking

## 🎯 Key Documents for Understanding the Project

### For New Developers
1. **Start here**: `development/CLAUDE.md` - Core development philosophy and guidelines
2. **Architecture overview**: `architecture/FINAL-IMPLEMENTATION.md` - System design
3. **Recent progress**: `CHANGE.md` - Latest changes and achievements

### For Technical Understanding
1. **Classification system**: `architecture/FACTORY-DESIGN-AND-MODEL-SELECTION.md`
2. **Research insights**: `research/SINGLE-LABEL-ANALYSIS.md`
3. **Development process**: `development/CLAUDE-UNDERSTANDING.md`

### For Project Status
1. **Latest achievements**: `CHANGE.md` - Comprehensive progress report
2. **Technical milestones**: `architecture/FINAL-IMPLEMENTATION.md`
3. **Research validation**: `research/TOPIC-CLASSIFICATION-ANALYSIS.md`

## 🚀 Current Status

**The Active Recall system is production-ready** with:
- ✅ **90%+ accuracy** on realistic academic content
- ✅ **Real-time performance** (<200ms per segment)
- ✅ **OCR artifact handling** for actual textbook content
- ✅ **Multi-strategy architecture** with automatic model selection
- ✅ **Comprehensive testing** (400+ test cases across all components)

See `CHANGE.md` for detailed success metrics and validation results.

## 📚 Topic Classification System

Our core innovation is a **topic-based classification system** that can accurately detect when users are studying specific subjects by analyzing OCR'd text from their screens. The system supports:

- **Multiple AI strategies**: Zero-shot, embedding similarity, hybrid approaches
- **Cross-domain accuracy**: Chemistry, Programming, Machine Learning, Biology, etc.
- **Real OCR content**: Handles textbook chapters, research papers, tutorials
- **Production performance**: Fast enough for real-time study session tracking

## 🔄 Development Philosophy

This project follows **strict TDD practices** and **clean architecture principles**:
- Every feature starts with a failing test
- SOLID principles applied throughout
- No comments in code (self-documenting through clear naming)
- Comprehensive real AI testing with actual models
- Factory pattern for extensible classification strategies

See `development/CLAUDE.md` for complete development guidelines.