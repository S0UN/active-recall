# Knowledge Base Routing & Organization System — Implementation Guide

## 0. Mental Models
- **Pipes & Filters:** A pipeline of independent steps that transform data.
- **Strategy-Based Orchestrator:** Coordinator that runs swappable, ordered strategies.
- **DAG, Not Tree:** Knowledge base as a graph — folders can have multiple parents.
- **Artifacts as Source of Truth:** Files + manifests + audit logs are canonical; indices are rebuildable.

---

## 1. Information Retrieval (IR) Foundations
- **Dense Embeddings:**
  - Semantic meaning proximity via vector distances (cosine, dot, L2).
  - Normalize vectors for cosine similarity.
  - Short labels are weak — use “title + 2–5 sentence summary” for better accuracy.
- **Approximate Nearest Neighbor (ANN):**
  - **HNSW:** M, efConstruction, efSearch tuning.
  - **IVF / PQ:** Clustering + quantization for RAM savings.
- **Sparse Retrieval (Lexical):**
  - BM25 / tf-idf / SPLADE for keyword precision.
- **Hybrid Retrieval:** Combine dense + sparse.
- **Reranking:** Cross-encoder rescoring for top-k.
- **Query Expansion:** HyDE for short queries; normalize acronyms.

---

## 2. Data Modeling & Files
- **Entities:** Document, Concept Candidate, Concept Artifact, Folder, Path Alias, Audit Event, Session Manifest.
- **Deterministic IDs:** Derived from stable inputs.
- **Content Hashing:** Skip re-embedding unchanged content.
- **Payload Discipline:** Chunk text small (~200–250 tokens).
- **Artifacts:** Include title, summary, quiz seeds, routing info, provenance, versions.
- **Folder Manifests:** Stable IDs, stats, centroid cache, description, provisional flag.
- **Alias Map:** old_path → new_path mapping.

---

## 3. Poly-Hierarchy (Multiple Parents)
- **Folder Identity vs Path:** Stable folder IDs; paths are display routes.
- **Scoring Placement:**
  - Centroid similarity.
  - Max exemplar similarity.
  - Lexical overlap.
  - Depth/variance penalties.
- **Decision Rules:**
  - High-confidence threshold.
  - Margin over runner-up.
  - Cross-links for strong secondary matches.
- **Maintenance:** Merge duplicates; split heterogeneous folders.

---

## 4. Chunking, Cleaning, Candidate Formation
- **OCR Realities:** Normalize whitespace, de-hyphenate, drop boilerplate.
- **Chunk Size:** 200–250 tokens target.
- **Stitching:** Combine small related snippets.
- **Reject Rules:** Drop too short/noisy chunks.

---

## 5. Index Design
- **Concept Index:**
  - Label vector (title-only).
  - Context vector (title + summary).
- **Folder-Path Index:**
  - Centroid vector.
  - Exemplar set.
  - Lexical footprint.
  - Metadata: parents, depth, size, variance.

---

## 6. Thresholds, Calibration, Metrics
- **Thresholds:** high-conf, low-conf, cross-link delta, dedup same-path, cross-path near-dup.
- **Metrics:** precision@k, recall@k, MRR, nDCG.
- **Calibration:** Tune ANN/search parameters.

---

## 7. LLM Usage
- **Three Jobs:**
  - Summaries.
  - Ambiguity arbitration.
  - Weekly rename proposals.
- **Prompt Design:** Short, structured, JSON outputs.
- **Reliability:** Schema validation, retries, timeouts, caps.
- **Cost Control:** Small prompts; batch renames.

---

## 8. Architecture & Process Topology
- **Deploy Shapes:** Local-only, Cloud-only, Hybrid.
- **Hybrid Split:**
  - Device: OCR, batching, artifact write, local cache.
  - Cloud: embeddings, vector indices, routing, rename/tidy.
- **Per-User Isolation:** Separate indices/namespaces.

---

## 9. Technology Choices
- **Languages:** TypeScript (orchestrator/UI), Python (optional embeddings/reranker).
- **APIs:** Simple JSON HTTP.
- **Vector Stores:** Qdrant (HNSW, sparse), Postgres+pgvector (dense + FTS).
- **Lexical Layer:** Qdrant sparse, Postgres FTS, or external search engine.
- **Storage:** Artifacts in FS + cloud backup; SQLite local metadata.
- **Queues/Scheduling:** In-process queue, cron, or managed scheduler.
- **Why Not LangChain (v1):** Overkill unless chain complexity grows.

---

## 10. Consistency, Idempotency, Filesystem Safety
- Deterministic IDs everywhere.
- Atomic writes (temp → rename).
- Session manifests for rebuilds.
- Audit logs (append-only).
- Alias maps for renames.

---

## 11. Error Handling & Fallbacks
- **Categories:** OCR, embedding, search, LLM, FS, JSON validation.
- **Policies:** Fail closed to Unsorted; never drop data.
- **Retries:** Backoff + jitter.
- **Partial Success:** Artifacts first; indices later.

---

## 12. Observability & Ops
- **Logging:** Structured JSON.
- **Metrics:** Counts, histograms, gauges.
- **Tracing:** Per-candidate trace IDs.
- **Backups:** Daily snapshots & backups.

---

## 13. Performance Engineering
- **ANN Tuning:** efSearch, M, efConstruction.
- **Batch Sizes:** 32–128 for embeddings.
- **Reranker Gating:** Ambiguous band only.
- **Caching:** Embedding & LLM caches.
- **I/O Hygiene:** SSD preferred.

---

## 14. Security & Privacy
- Distilled text only leaves device.
- HTTPS; optional mTLS.
- Encryption at rest & in transit.
- PII detection and routing.
- User controls for data sharing.

---

## 15. Testing & Evaluation
- **Unit Tests:** Router logic, deduper, artifact writer.
- **Integration Tests:** Full pipeline.
- **Property Tests:** Same input → same output.
- **IR Eval:** Labeled set for precision/recall tracking.
- **Perf Tests:** Latency under load.

---

## 16. Cost/Token Economics
- Embeddings: Near-free at API scale; free if local.
- LLM: Tiny prompts, caps, fallback strategies.
- Cloud vector store: Choose managed vs self-hosted.

---

## 17. Human-in-the-Loop & UX
- **Review Queue:** Show inputs, top-k folders, scores.
- **Explanations:** Show decision rationale.
- **Cross-Links:** “Also in” chips.
- **Rename UI:** Show examples and proposals.
- **Search UX:** Collapse duplicates.

---

## 18. Config & Feature Flags
- Thresholds, ANN params, reranker toggle, caps.
- Environment profiles (local-only, hybrid, cloud-only).

---

## 19. Deployment & Packaging
- **Desktop:** Electron or Node daemon with auto-update.
- **Cloud:** Stateless routing service, vector DB, queue, storage.
- **Backups:** Nightly snapshots, tested rebuild scripts.

---

## 20. What to Learn
- IR basics, ANN, reranking, hybrid scoring.
- Embeddings: tokenization, pooling, normalization.
- Threshold calibration & eval.
- Vector DB internals (Qdrant, pgvector).
- Data modeling for retrieval.
- Filesystem safety.
- Distributed consistency.
- LLM ops: prompt design, JSON schema.
- Observability.
- Security/privacy.
- Job orchestration.
- Performance tuning.

---

## Actionable Next Steps
1. Choose deployment shape & vector store.
2. Define contracts (Batch, Candidate, Artifact, Folder, Alias Map, Audit Event, Session Manifest).
3. Implement pipeline (dense routing, artifacts, indices).
4. Add dedup & cross-links + Review Queue.
5. Improve short-topic resilience (summaries, hybrid retrieval, reranker).
6. Maintain poly-hierarchy (renames, tidy ops).
7. Add observability & caps.
8. Implement privacy controls.
9. Start IR evaluation loop.
