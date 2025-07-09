# Learning Plan for the Active Recall Project

This document outlines the key technologies and concepts to study before and during the development of this application. The topics are structured from foundational knowledge to specialized areas.

---

### Tier 1: The Core Application Stack

*These are the absolute fundamentals required to build the application shell and backend logic.*

1.  **Node.js & TypeScript:**
    *   **Core Concepts:** Understand the event loop, modules, and asynchronous programming (`async`/`await`).
    *   **Electron Basics:** Learn the main and renderer process architecture.
    *   **Inter-Process Communication (IPC):** Study how to use `ipcMain` and `ipcRenderer` to communicate between the backend and frontend.
    *   **Package Management:** Be proficient with `npm` or `yarn` for managing dependencies.

2.  **Electron Framework:**
    *   **Core Architecture:** Understand the relationship between the Node.js backend (main process) and the Chromium frontend (renderer process).
    *   **Native APIs:** Learn how to access native system features (like file system, notifications) through Electron's APIs.
    *   **Security:** Understand the security implications of running a Node.js backend with web content and how to mitigate risks.

3.  **TypeScript/JavaScript & Frontend Basics:**
    *   **DOM Manipulation:** You'll need to know how to interact with the HTML document to build the UI.
    *   **Frontend Framework (Optional but Recommended):** While not strictly necessary for the MVP, learning a simple frontend framework like Svelte or Vue could make building the UI in Phase 3 much easier.

---

### Tier 2: The AI & Machine Learning Pipeline

*This covers the "brains" of our application—the specific AI technologies we will use.*

1.  **OCR with Tesseract:**
    *   **Concept:** Understand what OCR is and its limitations. Learn about image pre-processing techniques (like binarization and deskewing) that improve accuracy.
    *   **Practical:** Look into how to use a Tesseract wrapper.

2.  **Zero-Shot Text Classification:**
    *   **Concept:** Understand what "zero-shot" means—classifying text into categories without having been explicitly trained on them. This is what allows our user to define their own topics.
    *   **Model:** Read about transformer models like BART or DistilBERT and how they can be used for this task (specifically, using Natural Language Inference or NLI).

3.  **Large Language Models (Prompt Engineering for Gemini):**
    *   **Concept:** This is less about the model and more about how you talk to it. Learn the principles of **prompt engineering**.
    *   **Structured Output:** Focus on how to write prompts that reliably return data in a specific format, like the JSON we need for our knowledge graph. This is a critical skill for this project.

4.  **Vector Embeddings & Semantic Search:**
    *   **Concept:** Understand what a vector embedding is—a numerical representation of text. Learn why searching for similar vectors allows you to find semantically related concepts.
    *   **Vector Databases (Qdrant):** Understand the basic idea of a vector database: it's a specialized tool for storing and efficiently searching through millions of these vector embeddings.

---

### Tier 3: Data & Architecture

*This covers how we store data and structure the application for the long term.*

1.  **SQL Fundamentals (SQLite):**
    *   **Concept:** Refresh your knowledge of basic SQL commands (`SELECT`, `INSERT`, `UPDATE`). Understand how to model relationships between data (our `nodes` and `edges` tables).

2.  **Decoupled & Modular Architecture:**
    *   **Concept:** Study the principles of building software in independent, modular components. Think about how each part of our system (Capture, Process, Store) can operate as a self-contained unit. This is key to making the system maintainable and scalable.

---

### Tier 4: Design Patterns & Architectural Concepts

*These patterns are essential for writing clean, scalable, and maintainable code. They provide reusable solutions to common software design problems.*

**1. High-Level Architectural Patterns:**

*   **Pipeline Architecture:**
    *   **What to search for:** "Pipeline Design Pattern", "Pipes and Filters Architecture".
    *   **What to learn:** Understand how to structure a sequence of processing stages where the output of one stage becomes the input for the next. This creates a highly decoupled and linear data flow, making the system easy to understand and modify.
    *   **Relevance to our project:** This is the core structure of our `Processing Service` (`capture -> ocr -> classify -> compress -> store`).

**2. Backend Patterns (Rust):**

*   **State Pattern:**
    *   **What to search for:** "State Design Pattern in TypeScript/Node.js".
    *   **What to learn:** How to allow an object to alter its behavior when its internal state changes. This is often implemented with classes or objects that represent the different states and their behaviors.
    *   **Relevance to our project:** Essential for managing the `Idle` and `Active` polling modes of the `Capture Service`.

*   **Strategy Pattern:**
    *   **What to search for:** "Strategy Design Pattern in TypeScript/Node.js".
    *   **What to learn:** How to define a family of algorithms (e.g., different OCR libraries), encapsulate each one, and make them interchangeable. This pattern uses interfaces or abstract classes to define a common API.
    *   **Relevance to our project:** Allows us to easily swap out the OCR engine or the classification model without changing the core processing logic.

*   **Builder Pattern:**
    *   **What to search for:** "Builder Pattern in TypeScript".
    *   **What to learn:** A clean, readable way to construct complex objects step-by-step, which is useful for creating the structured JSON `KnowledgeNode` before it's sent to the storage service.

*   **Observer Pattern (Events):**
    *   **What to search for:** "Node.js EventEmitter", "Electron IPC".
    *   **What to learn:** How to create a subscription mechanism for event-driven communication. Node.js has a built-in `EventEmitter` class, and Electron's IPC mechanism is a specialized form of this pattern for communicating between processes.
    *   **Relevance to our project:** Used to notify the UI (renderer process) to refresh when a new concept is successfully processed and stored in the backend (main process).

**3. Frontend Patterns (TypeScript):**

*   **Model-View-Controller (MVC):**
    *   **What to search for:** "MVC design pattern in TypeScript/JavaScript".
    *   **What to learn:** The classic pattern for separating the concerns of data (Model), presentation (View), and user input logic (Controller).
    *   **Relevance to our project:** Helps organize the frontend code by keeping data fetching, DOM manipulation, and event handling logic separate and maintainable.
