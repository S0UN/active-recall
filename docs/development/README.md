# Development Documentation

## Guidelines, Instructions, and Development Process

### 📋 Documents in this folder:

- **`CLAUDE.md`** - **PRIMARY DEVELOPMENT GUIDELINES** - Core development philosophy, TDD practices, coding standards, and AI assistant instructions
- **`CLAUDE-UNDERSTANDING.md`** - Key insights and misunderstandings from the development process  
- **`GEMINI.md`** - Alternative AI assistant instructions and guidelines
- **`MIMIIR.MD`** - Additional development notes and context
- **`TODO.md`** - Development task tracking and project status

### 🎯 Start Here for Development

**Essential Reading**:
1. **`CLAUDE.md`** - Complete development philosophy and standards
2. **`CLAUDE-UNDERSTANDING.md`** - Critical insights to avoid past mistakes

### 💻 Development Philosophy

**TDD is Non-Negotiable**:
- Every production line begins as a failing test
- Red-Green-Refactor cycle strictly followed
- 400+ comprehensive test cases across all components

**Clean Architecture Principles**:
- SOLID principles applied throughout
- No comments in code (self-documenting through clear naming)
- Small, focused functions and classes
- Dependency injection and interface segregation

**Code Quality Standards**:
- TypeScript strict mode always
- No `any` types or type assertions
- Immutable data patterns
- Schema-first development with Zod validation

### 🔬 Testing Excellence

**Test Categories**:
- **Unit Tests** - Behavior-driven, not implementation-focused
- **Real AI Tests** - Using actual models (RoBERTa, DistilBERT, etc.)
- **Integration Tests** - End-to-end pipeline validation
- **OCR Reality Tests** - Realistic textbook/research content

**Test Coverage**:
- ✅ **209 real AI tests** across 4 models and 4 topics
- ✅ **14 realistic OCR tests** with multi-paragraph content
- ✅ **Comprehensive edge cases** and error scenarios
- ✅ **Performance benchmarking** and optimization validation

### 🚀 Current Development Status

**Production-Ready Components**:
- ✅ **Topic Classification System** - 90%+ accuracy validated
- ✅ **Multi-Strategy Factory** - Extensible architecture with auto-selection
- ✅ **OCR Processing Pipeline** - Real textbook content handling
- ✅ **Segmented Classification** - Large document processing

**Next Development Priorities**:
- → **UI Integration** - Connect classification to study tracking interface
- → **User Feedback System** - Learning from user corrections
- → **Analytics Dashboard** - Study insights and progress tracking