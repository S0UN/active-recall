# Architecture Documentation

## System Design and Implementation Architecture

###  Documents in this folder:

- **`FACTORY-DESIGN-AND-MODEL-SELECTION.md`** - Comprehensive guide to the extensible factory architecture implementing Strategy + Factory patterns for classification approaches
- **`FINAL-IMPLEMENTATION.md`** - Production system architecture and key design decisions  
- **`Orchestrator-Architecture.md`** - Orchestrator service design and state management system

###  Key Architectural Components

**Classification System**:
- **UniversalModelFactory** - Extensible factory supporting multiple AI strategies
- **Strategy Pattern** - Zero-shot, embedding, and hybrid classification approaches
- **Automatic Model Selection** - Performance-based strategy recommendations

**Study Tracking Pipeline**:
- **Orchestrator** - Central coordination of capture → OCR → classification
- **State Management** - Idle/Studying states with intelligent transitions
- **Polling System** - Efficient screen monitoring and processing

**Performance Characteristics**:
- **Real-time processing** - <200ms per text segment
- **High accuracy** - 85-99% confidence on academic content  
- **Scalable architecture** - Handles multi-paragraph documents
- **Production-ready** - Comprehensive error handling and monitoring