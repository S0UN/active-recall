# Project Implementation Plan

This document outlines the phased development plan for the Active Recall application, now incorporating the highly optimized, intelligent context-aware processing pipeline.

---

## Phase 1: Core Intelligent Pipeline (Automated)

**Goal:** Build and validate the central `context-aware capture -> intelligent OCR -> classify -> batch -> compress -> store` data processing chain in an automated, background environment. This phase focuses on ensuring the intelligent pipeline is reliable and efficient.

**Key Steps:**

1.  **Project Scaffolding:** (Completed) Set up the Electron application with TypeScript and the organized service structure.
2.  **Core Utilities & Services:**
    *   Implement `PollingSystem` (for timed events).
    *   Implement `WindowTitleService` (to track active window/tab, including `active-win` integration).
    *   Implement `ScreenCaptureService` (to take screenshots using Electron's `desktopCapturer`).
    *   Implement `OcrService` (to convert images to text using `tesseract.js`).
    *   Implement `ScreenProcessingService` (to combine capture and OCR).
    *   Implement `OneShotClassifier` (for local relevance filtering).
    *   Implement `GeminiBatcher` (to accumulate relevant text).
    *   Implement `SemanticCompressionService` (with mock/stub for Gemini API and storage).
3.  **Per-Tab State Cache:** Implement the in-memory cache to store `mode` and `lastClassified` for each unique window/tab.
4.  **MimirOrchestrator (The Brain):** Implement the central orchestrator that:
    *   Manages the `Window-Change Poller` (fast polling for active window).
    *   Manages the `Studying OCR Poller` (slower polling for active studying tabs).
    *   Implements the intelligent OCR triggering logic (new tab, stale idle tab, continuous studying).
    *   Integrates the `OneShotClassifier` and `GeminiBatcher`.
    *   Handles the `Rapid Tab Switching Delay` to avoid unnecessary OCR.
5.  **User Topic Input:** Implement a basic mechanism for the user to define study topics for the classifier.
6.  **API & Database Stubs:** Ensure mock functions are in place for the Gemini API and the local database for isolated testing of the pipeline.

---

## Phase 2: Refinements, Full Automation & Storage

**Goal:** Refine the intelligent pipeline, integrate live APIs, and implement the robust local storage solution.

**Key Steps:**

1.  **Orchestrator Refinements:** Implement advanced considerations:
    *   `Title Stability & Fuzzy Matching` for window titles.
    *   `Cache Eviction` policy for the Per-Tab State Cache.
    *   Robust `Error Handling & Resilience` for all pipeline steps.
2.  **Live API Integration:** Replace the stubbed `SemanticCompressionService` with live integration to the Gemini API for semantic compression.
3.  **Local Storage Implementation:** Implement the dual-database system:
    *   SQLite for the graph structure.
    *   Qdrant for vector embeddings.
    *   Integrate this with the `SemanticCompressionService` to persist processed concepts.
4.  **Background Service:** Ensure the main Electron process runs persistently in the background (e.g., using a tray icon) even when the main window is closed.
5.  **Application Exclude List:** Implement the user-configurable exclude list for applications that should not be tracked.

---

## Phase 3: The User Interface & Quiz Engine

**Goal:** Build the user-facing application, allowing users to interact with their knowledge graph and engage in active recall sessions.

**Key Steps:**

1.  **Knowledge Graph UI:** Design and develop a user interface to visualize the structured knowledge graph (nodes and edges).
2.  **Classifier Feedback Loop:** Implement a simple UI mechanism (e.g., a "thumbs down" button on a concept) for users to flag misclassified entries.
3.  **Quiz Engine:** Implement the quiz generation logic, using the Gemini API to expand stored concepts into questions.
4.  **Spaced Repetition:** Integrate a spaced repetition algorithm (e.g., SM2) to schedule and deliver quizzes effectively.
5.  **Settings & Configuration:** Build out the user settings interface, including the panel for managing study topics and the application exclude list.