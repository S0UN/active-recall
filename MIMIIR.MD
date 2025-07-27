# MIMIR.md

## Project Overview

A AI‑powered active‑recall and passive study tracker.  
It observes what the user studies (via screen/audio capture or smart link tracking), compresses inputs into meaningful concepts, stores them locally in a semantic knowledge graph, and generates spaced‑repetition quizzes to boost retention.


## Technical Context

- **Capture**  
  - Screen + audio → OCR + STT  
- **Semantic Compression**  
  - LLM (Gemini API or local LLM) → concept paths  
- **Storage**  (we are going to build local for now and move cloud later on)
  - SQLite or DuckDB for graph  
  - Qdrant or Chroma for embeddings  
- **Quiz Engine**  
  - SM2‑style spaced‑repetition  

## Recommended Stack

| Layer          | Primary                        | Alternative                    |
|----------------|--------------------------------|--------------------------------|
| App Shell      | Electron + TypeScript          | Tauri, PySide                  |
| OCR            | Tesseract                      | EasyOCR                        |
| Speech → Text  | whisper.cpp                    | Cloud Whisper API              |
| Classifier     | DistilBART‑MNLI                | MiniLM                         |
| Compression    | Gemini API                     | Ollama (local)                 |
| Storage        | SQLite + Qdrant                | DuckDB + Chroma                |

## Core Workflow

1. **Window‑Change Poller**  
   - Fast background service reads active window every ~500ms.  
2. **Context Cache**  
   - Tracks `<windowId>::<title>` → “Idle” or “Studying” + last check.  
3. **OCR Triggering**  
   - New or stale “Idle” tab → one‑off OCR→classify.  
   - “Studying” tab → periodic OCR every 30–60s.  
4. **Relevance Filter**  
   - Local classifier gates out non‑study content.  
5. **Batched Compression**  
   - Buffer snippets; flush to Gemini API when size/time threshold met.  
   - Receive structured JSON (concepts, quiz seeds).  
6. **Privacy‑First Storage**  
   - Store metadata in SQLite/Qdrant; discard raw text/screenshots.  
7. **Active‑Recall Loop**  
   - Expand stored concepts into quizzes on schedule (SM2).
