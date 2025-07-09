# GEMINI.md

## Project Overview

This project is a local-first AI-powered active recall and passive study tracker for students and lifelong learners.  
It continuously observes what the user studies (via screen/audio capture or smart link tracking), compresses raw inputs into meaningful concepts, stores them locally in a semantic knowledge graph, and generates quizzes using spaced repetition to help users retain what they learn.

Core principle: Clarity before action — never guess what to build.

---

## Design Philosophy

- Clarity First: No contributor or AI agent may make changes unless they are 95% confident they understand the requirement.
- Local-First: Raw data stays on-device; semantic compression ensures privacy and minimal storage.
- Lightweight & Efficient: Prefer smart polling or link tracking to avoid unnecessary compute load. Although Tauri is more lightweight, we are building with electron as I am more comfortable with TS/JS. Try to be lightweight in other ways. 
- Explain Everything: All proposals must be clearly explained and approved before implementation.

---

## Technical Context

Main system parts:
- Passive Capture:  
  - Option A: Screen and audio → OCR and Whisper STT.
  - Option B: Smart context tracking → Browser extension logs URLs, timestamps, or pages.
- Semantic Compression:  
  - Use Gemini API (e.g., Gemini 2.5 Flash) or a local LLM like Ollama to turn text into concept paths.
- Storage:  
  - Store compressed concepts in SQLite or DuckDB; embeddings in Qdrant or Chroma.
- Quiz Engine:  
  - Spaced repetition algorithm (SM2 or similar) generates daily quizzes.

Preferred LLM usage:  
- Use cloud APIs for speed while prototyping; migrate to local LLM for full privacy.
- Keep token costs low with smart chunking and relevance filters.

---

## Recommended Stack

| Layer          | Primary Options                  | Alternatives                   |
|----------------|----------------------------------|--------------------------------|
| App Shell      | Electron (Node.js + TypeScript)  | Tauri (Rust), Python (PySide)    |
| OCR            | Tesseract                        | EasyOCR                        |
| Speech to Text | whisper.cpp                      | Cloud Whisper API              |
| Classifier     | BART-MNLI / DistilBART-MNLI      | MiniLM                         |
| LLM            | Gemini API                       | Ollama or LM Studio (local)    |
| Storage        | SQLite + Qdrant                  | DuckDB + Chroma                |

---

## System Architecture

The system is designed as a local-first, privacy-preserving background application that turns passive study habits into a structured, active recall system. The core workflow is highly optimized for efficiency and intelligence, leveraging context to minimize resource usage.

### Core Workflow: Intelligent Context-Aware Processing

1.  **Background Polling (Window-Change Poller):**
    *   The app runs as a lightweight background service, primarily driven by a fast (e.g., 500ms-1s) poller that monitors the active window.
    *   It reads the focused window's ID and title using `active-win`.

2.  **Per-Tab/Window State Cache:**
    *   A cache maintains the `mode` ("Idle" or "Studying") and `lastClassified` timestamp for each unique window/tab (`<windowId>::<title>`).
    *   This cache allows the system to remember the classification of specific contexts, preventing redundant work.

3.  **Intelligent OCR Triggering:**
    *   **New Window/Tab**: If a never-before-seen window/tab comes into focus, a **one-off full pipeline run** (`Capture -> OCR -> Classify`) is immediately triggered. The result updates the cache, and if "Studying", the text is batched.
    *   **Stale Idle Tab**: If an "Idle" window/tab is refocused after a significant period (e.g., 15 minutes), a one-off full pipeline run is re-triggered to re-evaluate its relevance.
    *   **Studying OCR Poller**: If the currently focused window/tab is in "Studying" mode, a slower, dedicated poller (e.g., every 30-60s) continuously performs `Capture -> OCR -> Classify` to track ongoing study.

4.  **Local Relevance Filtering:**
    *   Extracted text is immediately passed to a local, one-shot classifier (e.g., BART-MNLI).
    *   The classifier checks if the text is relevant to user-defined study topics, acting as a fast gatekeeper to prevent processing irrelevant information.

5.  **Semantic Compression (Cloud API) & Batching:**
    *   Relevant text snippets are accumulated in an in-memory buffer (`GeminiBatcher`).
    *   The batcher flushes (sends concatenated text to Gemini API for semantic compression) when a token count or time threshold is met.
    *   The Gemini API transforms raw text into structured JSON (concept paths, summaries, quiz seeds).

6.  **Privacy-First Storage:**
    *   The structured metadata is stored locally in a dual-database system (e.g., SQLite for graph, Qdrant for vectors).
    *   Crucially, the original raw text and screenshots are **immediately discarded** to protect user privacy and minimize storage footprint.

7.  **Active Recall Loop (Quiz Generation):**
    *   When it's time for a quiz, the system uses the Gemini API to **expand** stored, compressed concepts into clear, quiz-ready questions.
    *   Quizzes are delivered based on a spaced repetition schedule (e.g., SM2 algorithm) to maximize long-term retention.

This entire loop—**intelligent capture → context-aware classification → batched compression → privacy-first storage → active recall**—creates a powerful, automated "second brain" that helps users remember what they learn, optimized for efficiency and user experience.

---

## Contribution Workflow

### The 95% Confidence Rule

Rule:  
Do not make any changes unless you have 95% confidence you know what to build.  
Always ask clarifying questions until you reach that confidence.


---

### Good Practices

- We are building production level code and highly value scalability and organization.
- Explain Before You Build: Always provide a clear, step-by-step plan. Get explicit approval from the project owner.
- Before building any module of code, we will discuss the system design and design pattern as well make a .md file of the design. 
- Ask Questions: If anything is unclear, ask. Do not guess.
- Document Everything: Every change must include what changed, why, and its impact.
- Keep It Local: Store raw data locally and discard it after semantic compression.
- Respect Costs: Optimize Gemini or other AI API usage for cost and relevance.
- Nothing I tell you is concrete and you can propose solutions. If you think there is a better way of doing soemthing, we can do that. 

---

## Example User Story

As a student, I want the system to know what I’m studying, compress it into clear concept nodes, store it privately, and quiz me later so I don’t forget what I learned.

---

## Non-Negotiables

- Follow the “95% confidence” rule.  
- Never push unreviewed or unexplained changes.  
- Respect mobile-first, accessible, and privacy-first design standards.  
- Keep all code tested, well-commented, and documented.
- Develop everything in a scalable manner, following SOLID principles. 

---

## Software Development Principles

- Although These are not commandmants we have to follow extremely strictly, we should try following these prniciples:
*   **S - Single Responsibility Principle (SRP):** A class should have only one reason to change — do one thing only.
*   **O - Open/Closed Principle (OCP):** Software entities should be open for extension but closed for modification.
*   **L - Liskov Substitution Principle (LSP):** Subtypes must be substitutable for their base types without breaking the program.
*   **I - Interface Segregation Principle (ISP):** No client should be forced to depend on methods it doesn’t use — better to have many small interfaces than a big one.
*   **D - Dependency Inversion Principle (DIP):** High-level modules should not depend on low-level modules; both should depend on abstractions.
*   **Abstraction:** Hide complex details behind a simple interface.
*   **Encapsulation:** Bundle data and methods that operate on that data together.
*   **Modularity:** Break a big system into smaller, independent parts (modules).
*   **Separation of Concerns:** Keep different parts of a program focused on different tasks.
*   **DRY (Don’t Repeat Yourself):** Avoid duplicate code by reusing logic.
*   **KISS (Keep It Simple, Stupid):** Simpler solutions are easier to maintain and less error-prone.
*   **YAGNI (You Aren’t Gonna Need It):** Don’t add functionality until it’s necessary.
*   **Fail Fast:** Detect errors as early as possible. 

---

## Questions

If you are ever unsure — ask first.  
The goal is clarity, quality, and collaboration.

---

## Production-Grade Best Practices

This section outlines the key architectural and coding standards we will follow to ensure the application is secure, scalable, and maintainable.

### 1. Electron IPC & MVC-Style Architecture

We will treat the Electron Main Process as a backend server and the Renderer Process as a frontend client, using a structure similar to MVC.

*   **Project Structure:**
    ```bash
    src/
    ├── main/                  # Main Process (Backend)
    │   ├── main.ts            # Entry point: bootstraps app, registers IPC
    │   ├── services/          # Business logic (Processing, Storage, etc.)
    │   ├── ipc-handlers/      # "Controllers": Defines and groups IPC routes
    │   └── utils/             # Logging, error handling, etc.
    │
    ├── renderer/              # Renderer Process (Frontend UI code)
    │   └── ...
    │
    ├── preload.ts             # Secure bridge between Main and Renderer
    └── shared-types/          # Global TypeScript types (e.g., for IPC)
    ```

*   **IPC Handlers as Controllers:** IPC handlers in `ipc-handlers/` are our "routes." They should be thin, responsible only for receiving requests from the UI, calling the appropriate service, and returning a response.

*   **Services for Business Logic:** The core logic (database operations, file access, API calls) lives in `services/`. These modules should be pure, testable Node.js/TypeScript, with no direct dependency on Electron APIs where possible.

### 2. Security: The Sandbox and Preload Script

Security is non-negotiable. We will follow Electron's modern security guidelines.

*   **`nodeIntegration: false`**: We will never enable direct Node.js access in the Renderer.
*   **`contextIsolation: true`**: This is the default and must remain enabled to keep the Main and Renderer worlds separate.
*   **`preload.ts` is the Bridge**: The `preload.ts` script is the *only* way the frontend should communicate with the backend. It uses `contextBridge` to expose a minimal, secure API to the Renderer (e.g., `window.api.startCapture()`).

### 3. Error Handling

We will implement robust, centralized error handling.

*   **Custom Error Class**: We will create a custom `AppError` class that extends `Error` and includes an `isOperational` flag. This allows us to distinguish between expected operational errors (e.g., "File not found") and true programmer bugs.
*   **Global Exception Handler**: In `main.ts`, we will register a global `process.on('uncaughtException', ...)` handler. This will catch any unexpected errors, log them using our logging service, and prevent the application from crashing silently.
*   **Production vs. Development Modes**: In development, we can show detailed errors. In production, the global handler will catch the error, log it, and show a generic, user-friendly error message. Raw error details will never be shown to the end-user in production unless they are explicitly marked as `isOperational`.

### 4. TypeScript and Typing

Strong typing is essential for maintainability.

*   **Strict Mode**: TypeScript's `strict` mode will always be enabled in `tsconfig.json`.
*   **Shared Types**: For any data structures shared between the Main and Renderer processes (especially over the IPC bridge), we will define types in a `src/shared-types/` directory. This ensures both sides of the bridge agree on the data shape.
*   **Type-Safe IPC**: We will create a type-safe adapter or wrapper for our `contextBridge` API to ensure that the data sent and received via IPC is fully typed, providing compile-time safety and excellent autocompletion.

### 5. Dependency Management

We will use Dependency Injection (DI) to manage our services.

*   **DI Container**: We will consider using a lightweight DI container like `tsyringe`.
*   **Benefits**: This decouples our components. For example, our IPC handlers won't create `new ProcessingService()`. Instead, the service will be injected into the handler's constructor. This makes our services easier to test in isolation by allowing us to inject mock dependencies.

### 6. Configuration Management

We will use a dedicated library for managing user settings and application configuration.

*   **Tool**: `electron-store` is the recommended choice. It provides a simple, robust, and persistent key-value store.
*   **Usage**: This will be used for storing user preferences, such as the application exclude list, polling frequency, and study topics.
*   **Secrets**: For sensitive information like API keys, we will use `electron-keytar` to leverage the operating system's secure credential manager (macOS Keychain, Windows Credential Manager).

### 7. Structured Logging

We will implement structured logging to ensure we can effectively debug issues in both development and production.

*   **Tool**: `electron-log` is the standard for this. It's highly configurable and can write to multiple "transports" (file, console).
*   **Format**: Logs should be in a structured format (like JSON), containing a timestamp, log level (info, warn, error), a clear message, and relevant context (e.g., which service or function the log came from).
*   **Log Levels**: We will use different log levels in development (e.g., `debug`) versus production (e.g., `info` or `warn`) to avoid excessive noise.

### 8. Code Style & Linting

To maintain a consistent and high-quality codebase, we will automate code formatting and linting.

*   **Formatter**: We will use **Prettier** to automatically format code on save. This eliminates all arguments about code style.
*   **Linter**: We will use **ESLint** with a strict ruleset to catch potential bugs and enforce best practices before the code is even run.
*   **Automation**: These tools will be configured to run automatically as a pre-commit hook to ensure no unformatted or unlinted code enters the main branch.

### 9. Testing Strategy

We will focus on unit testing our core business logic.

*   **Scope**: The primary focus will be on testing the `services/`. Since these are pure TypeScript/Node.js modules, they can be tested without needing to run the full Electron application.
*   **Framework**: We will use a standard JavaScript testing framework like **Jest** or **Vitest**.
*   **Mocking**: We will use mocking to isolate services from their dependencies. For example, when testing the `ProcessingService`, we will mock the `StorageService` and the Gemini API client.
