# System Design: Active Recall Application

This document outlines the system architecture for the Active Recall application. The design prioritizes scalability, maintainability, and efficiency from the outset, using the S.I.M.P.L.E. principles as a guiding framework.

---

## 1. Core Principles (S.I.M.P.L.E.)

Our design philosophy is built on these five principles to ensure long-term scalability:

*   **S - Single Responsibility Principle (SRP):** A class should have only one reason to change — do one thing only.
*   **O - Open/Closed Principle (OCP):** Software entities should be open for extension but closed for modification.
*   **L - Liskov Substitution Principle (LSP):** Subtypes must be substitutable for their base types without breaking the program.
*   **I - Interface Segregation Principle (ISP):** No client should be forced to depend on methods it doesn’t use — better to have many small interfaces than a big one.
*   **D - Dependency Inversion Principle (DIP):** High-level modules should not depend on low-level modules; both should depend on abstractions.

---

## 2. High-Level Architecture

The system is designed as a set of cooperating services within the Electron application.

```
[ User's Screen ]
       |
       v
+--------------------+ 
|  Capture Service   | (Change Detection, Polling, Screenshot)
+--------------------+ 
       |
       v
+--------------------+ 
| Processing Service | (OCR -> Classifier -> Semantic Compression)
+--------------------+ 
       |
       v
+--------------------+ 
|   Storage Service  | (SQLite for Graph, Qdrant for Vectors)
+--------------------+ 
       |
       v
+--------------------+ 
|  Application & API | (Electron Backend, Quiz Engine, UI)
+--------------------+ 

---

## 3. Component Deep Dive

### a. Capture Service
*   **Responsibility:** To efficiently capture screen content.
*   **Technology:** Rust backend service within Tauri.
*   **Scalability:** This service is lightweight by design. The polling logic can be configured remotely to adjust performance. The change detection hash function can be updated (e.g., from MD5 to a more robust perceptual hash) without affecting other services.

### b. Processing Service
*   **Responsibility:** To transform raw screen content into a structured knowledge graph.
*   **Architecture:** This is a pipeline of four distinct, swappable sub-modules:
    1.  **OCR Module:** Takes an image, returns text. (Default: Tesseract)
    2.  **Classifier Module:** Takes text and user topics, returns a relevance score. (Default: `DistilBART-MNLI`)
    3.  **Compression Module:** Takes relevant text, calls the Gemini API, returns structured JSON.
    4.  **Deduplication Module:** Takes the structured JSON, generates a vector embedding, and checks for semantic duplicates against the entire database before passing it to the Storage Service.
*   **Scalability:** This is the most critical area for scalability. By separating these functions, we can scale them independently. In a future cloud-based version, this service could be broken out into serverless functions (e.g., AWS Lambda) to handle heavy loads without bogging down the user's machine.

### c. Storage Service
*   **Responsibility:** To persist and retrieve the knowledge graph and vector embeddings, while handling semantic duplicates.
*   **Architecture:** An abstraction layer in Rust that interacts with the databases. Before writing, it uses the output of the Deduplication module to decide whether to create a new entry or merge with an existing one.
    *   **Structured DB:** SQLite (for local-first).
    *   **Vector DB:** Qdrant (for local-first).
*   **Scalability:** The abstraction layer allows us to easily swap the database implementation. To scale to a multi-device, cloud-synced application, we could replace the local DBs with cloud services like PostgreSQL and a managed vector database, with minimal changes to the application logic.

### d. Application & API Service
*   **Responsibility:** To serve the UI, manage the quiz engine, and expose backend capabilities to the frontend.
*   **Technology:** Electron's IPC (Inter-Process Communication).
*   **Scalability:** The IPC channel is the single, stable entry point for the frontend (renderer process). As we add features, we add new IPC listeners in the backend (main process). This keeps the frontend and backend cleanly separated and allows them to evolve independently.

---

## 4. Scalability Path

This local-first design is the foundation for a scalable cloud-based system.

1.  **Phase 1 (Current):** Fully local-first application.
2.  **Phase 2 (Cloud Sync):** The Storage Service can be updated to sync the local SQLite/Qdrant databases with a central cloud database. This enables multi-device access.
3.  **Phase 3 (Cloud-Offloaded Processing):** For users with low-spec machines or for a premium tier, the entire Processing Service can be offloaded to the cloud. The local app would simply send the screenshot to a cloud endpoint and receive the structured data back, dramatically reducing local resource usage.

This phased approach ensures we can start with a powerful, private, local-first application and scale it to a full-featured cloud service without a complete architectural rewrite.

---

## 5. Future Feature: Cross-Device Sync

To support syncing user data across multiple devices while upholding our strong privacy principles, we will plan for an optional, end-to-end encrypted (E2EE) synchronization feature.

### a. Recommended Approach: E2EE Cloud Sync

*   **How it works:** The user's local database (SQLite and Qdrant data) will be encrypted on the device using a key that only the user possesses. This encrypted data blob is then sent to a simple cloud storage server. The server has zero knowledge of the content, as it cannot decrypt the data. Other devices can then pull this encrypted data and decrypt it locally.
*   **Pros:**
    *   **Maintains Privacy:** The core "local-first" and "privacy-first" principles are upheld.
    *   **Secure:** User data is unreadable to anyone without the key, including the service operators.
*   **Cons:**
    *   **Implementation Complexity:** Requires careful management of user-owned encryption keys.
    *   **Conflict Resolution:** A strategy for merging changes from multiple devices will be necessary to prevent data loss.

### b. Alternative Approach: User-Managed Cloud Sync

*   **How it works:** The application would save its database file directly into a user-designated folder for a third-party cloud service like iCloud Drive, Google Drive, or Dropbox.
*   **Pros:**
    *   **Simplicity:** Much easier to implement, as it offloads the sync mechanism to existing providers.
    *   **User Control:** The user remains in full control of their data and cloud provider.
*   **Cons:**
    *   **Reliability:** Sync speed and conflict resolution are dependent on the third-party service.
    *   **Less Seamless:** May be less of a seamless user experience compared to a built-in E2EE solution.

### c. Implementation Plan

We will proceed with the local-only database for the initial versions of the application. However, the `Storage Service` will be designed with a modular data access layer. This will allow us to add the E2EE sync capability in a future version without requiring a major architectural refactor.
