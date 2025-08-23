# Active Recall - Documentation Hub

A production-grade AI-powered knowledge management system with intelligent content organization and spaced repetition learning.

## 🚀 Quick Navigation

| I want to... | Go to |
|--------------|-------|
| **Get started immediately** | [Quick Start Guide](../README.md) |
| **Understand the system** | [System Overview](#system-overview) |
| **Learn spaced repetition** | [Spaced Repetition Quick Start](./guides/spaced-repetition-quick-start.md) |
| **Integrate the API** | [API References](#api--reference-documentation) |
| **Understand the code** | [Code Architecture](./reference/complete-code-architecture.md) |
| **Contribute to development** | [Development Guidelines](./development/CLAUDE.md) |

---

## 📋 System Overview

### Core Capabilities

**🧠 Intelligent Content Organization**
- Automatic semantic routing using AI-powered content analysis
- Multi-folder concept placement with confidence scoring
- Vector similarity search with Qdrant database integration

**📚 Spaced Repetition Learning System**
- SuperMemo-2 algorithm with modern Anki enhancements
- LLM-powered question generation from any content
- Personalized review scheduling and progress tracking
- 95%+ test coverage with production-ready reliability

**🔄 Content Processing Pipeline**
- DISTILL → EMBED → ROUTE architecture
- Real-time processing (5-7 seconds for OCR text)
- Cost-optimized OpenAI API usage
- Comprehensive error handling and recovery

### Technical Highlights

- **Clean Architecture**: SOLID principles, domain-driven design
- **Production Ready**: Comprehensive testing, error handling, monitoring
- **Performance Optimized**: Vector indexing, caching, batch operations
- **Developer Friendly**: Type-safe APIs, comprehensive documentation

---

## 📚 Documentation Structure

### 🎯 Getting Started

| Document | Description | Time to Read |
|----------|-------------|--------------|
| [**Spaced Repetition Quick Start**](./guides/spaced-repetition-quick-start.md) | Get productive with spaced repetition in 10 minutes | ⏱️ 10 min |
| [**Gemini Integration Guide**](./guides/gemini-integration.md) | Set up Google Gemini API integration | ⏱️ 15 min |

### 🏗️ System Architecture

| Document | Description | Audience |
|----------|-------------|----------|
| [**Spaced Repetition System**](./systems/spaced-repetition.md) | Complete implementation guide with design decisions | Developers, Architects |
| [**Intelligent Folder System**](./systems/intelligent-folder-system.md) | Core routing algorithm and mathematical foundations | Architects, Advanced Developers |
| [**Multi-Folder Storage**](./systems/multi-folder-storage.md) | Multi-placement concept storage system | Developers |

### 📖 API & Reference Documentation

| Document | Description | Use Case |
|----------|-------------|----------|
| [**Spaced Repetition API**](./reference/spaced-repetition-api.md) | Complete API reference with all methods and types | Integration, Development |
| [**Distillation API**](./reference/distillation-api.md) | Content processing API reference | Integration |
| [**Complete Code Architecture**](./reference/complete-code-architecture.md) | File-by-file implementation guide | Understanding, Maintenance |
| [**Architecture Status**](./reference/architecture-status.md) | Current implementation status and capabilities | Project Planning |

### 👨‍💻 Development Resources

| Document | Description | Audience |
|----------|-------------|----------|
| [**Development Guidelines**](./development/CLAUDE.md) | Code patterns, testing standards, architecture decisions | Contributors |
| [**Implementation Notes**](./development/MIMIIR.MD) | Technical decisions and implementation details | Contributors |

### 📁 Historical Reference

| Location | Contents |
|----------|----------|
| [**Archives**](./archives/) | Historical planning documents, superseded designs, sprint plans |

---

## 🔧 Quick Setup Examples

### Basic Content Organization

```typescript
import { SmartRouter } from './src/core/services';

const router = new SmartRouter();

// Process and route content automatically
const result = await router.processContent({
	text: "Linear algebra is the study of vectors...",
	title: "Linear Algebra Fundamentals"
});

console.log(`Routed to folder: ${result.folderName}`);
console.log(`Confidence: ${result.confidence}`);
```

### Spaced Repetition Learning

```typescript
import { 
	QuestionManagementService,
	ReviewSchedulerService 
} from './src/core';

// Generate questions and create review schedule
const result = await questionService.generateAndScheduleQuestions(
	"Quantum mechanics describes the behavior of matter and energy..."
);

// Get personalized study session
const session = await schedulerService.getStudySession({
	maxCards: 20,
	prioritizeDifficult: true
});

console.log(`Study session: ${session.schedules.length} cards`);
```

---

## 🏃‍♂️ Development Workflow

### For New Contributors

1. **Read**: [Complete Code Architecture](./reference/complete-code-architecture.md) - Understand the codebase
2. **Setup**: Follow [main README](../README.md) for local development setup
3. **Guidelines**: Review [Development Guidelines](./development/CLAUDE.md)
4. **Practice**: Try [Spaced Repetition Quick Start](./guides/spaced-repetition-quick-start.md)

### For System Integration

1. **API Reference**: [Spaced Repetition API](./reference/spaced-repetition-api.md) or [Distillation API](./reference/distillation-api.md)
2. **Quick Start**: [10-minute integration guide](./guides/spaced-repetition-quick-start.md)
3. **Architecture**: Understanding from [system documentation](./systems/)

### For Architecture Understanding

1. **System Overview**: [Intelligent Folder System](./systems/intelligent-folder-system.md)
2. **Implementation Deep-Dive**: [Spaced Repetition System](./systems/spaced-repetition.md)
3. **Current Status**: [Architecture Status](./reference/architecture-status.md)

---

## 📊 System Statistics

### Test Coverage & Quality
- **284 passing tests** across all components
- **95%+ test coverage** with comprehensive edge cases
- **Contract testing** ensures repository implementations work correctly
- **Integration testing** with real external services (OpenAI, Qdrant)

### Performance Benchmarks
- **Content Processing**: 5-7 seconds for OCR text from browser extensions
- **Question Generation**: 500-2000ms per OpenAI API call (network dependent)
- **Repository Operations**: < 10ms for indexed lookups
- **Study Sessions**: < 100ms for session generation with 10,000+ schedules

### Architecture Metrics
- **Clean Code Compliance**: SOLID principles throughout
- **Domain-Driven Design**: Rich value objects, aggregate roots, business logic encapsulation
- **Error Handling**: Comprehensive error hierarchy with recovery strategies
- **Configuration**: Zero magic numbers, all parameters externalized

---

## 🎯 Common Use Cases

### Academic Content Management
- **Students**: Organize notes, generate study questions, track learning progress
- **Educators**: Create structured course materials with automatic categorization
- **Researchers**: Manage research papers with semantic organization

### Development Integration
- **Learning Apps**: Integrate spaced repetition for any learning content
- **Content Systems**: Add intelligent categorization to existing platforms
- **Educational Tools**: Enhance with AI-powered question generation

### Enterprise Applications
- **Training Systems**: Corporate learning with progress tracking
- **Knowledge Management**: Intelligent content organization at scale
- **Documentation**: Automated categorization of technical documentation

---

## 🤝 Contributing

We welcome contributions! Please see:

- [Development Guidelines](./development/CLAUDE.md) for coding standards
- [Architecture Documentation](./systems/) for system understanding
- [API References](./reference/) for integration patterns

### Documentation Updates

When contributing code changes, please update relevant documentation:

- **New Features**: Update API references and system documentation
- **Bug Fixes**: Update behavior documentation if changed
- **Architecture Changes**: Update design documents and code architecture guide

---

## 📞 Support & Resources

### Getting Help
- **Quick Issues**: Check [Quick Start Guide](./guides/spaced-repetition-quick-start.md) troubleshooting section
- **Integration Help**: See [API References](./reference/) for complete method documentation
- **Architecture Questions**: Review [System Documentation](./systems/)

### External Resources
- **SuperMemo-2 Algorithm**: Original spaced repetition research
- **OpenAI API**: Documentation for LLM integration
- **Qdrant Documentation**: Vector database setup and usage
- **TypeScript Handbook**: For understanding type definitions

---

*This documentation is maintained in sync with the codebase. Last updated: January 2025*