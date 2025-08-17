# Concept Organizer — Product & Engineering Plan (v1)

## Purpose
Convert noisy OCR'd study snippets into durable Concept Artifacts, automatically filed into a semantically coherent, poly-hierarchical knowledge base. The system should be idempotent, auditable, cost-aware, and swappable (local ↔ cloud).

## What "Good" Looks Like
- Concepts land where a human would expect to find them
- Reruns produce no dupes or drift (deterministic IDs; atomic writes)
- Latency feels snappy; heavy/ambiguous work happens asynchronously
- The tree self-maintains (rename/split/merge jobs) with minimal human review
- LLM use is targeted, capped, and logged; the system functions without it (Unsorted fallback)

## Deployment Shape: Hybrid (Recommended)
- **Device**: OCR, batching, session assembly, local cache of artifacts
- **Cloud**: embeddings (optional), vector DB, routing/rerank, rename/tidy, audit storage
- **Pros**: raw capture stays local; cloud handles accuracy/scale; easy "local day" toggle
- **Note**: Per-user (or per-collection) vector namespaces simplify privacy and deletes

## Architecture & Patterns

### Core Style: Pipes & Filters with Strategy-based Orchestrator
- **MimirEngine** executes a sequence of steps (strategies), each with a clear contract
- Open for extension: steps can be added/reordered without touching others
- Observability: every step logs structured telemetry (IDs everywhere)

## Major Components

### SessionAssembler
- Converts flushed batches into Concept Candidates
- Normalizes text, removes boilerplate, stitches adjacent snippets
- Rejects tiny/noisy fragments via configurable minimums
- Computes content_hash for dedup and caching

### ConceptExtractor (lightweight, LLM only if needed)
- Default: each cleaned chunk becomes a candidate
- If confidence is low, asks for a short title hint and key terms (cheap prompt)

### Router (embeddings-first, LLM-second)
- Produces routing decision using Folder-Path Index
- High confidence → file to best folder
- Low confidence → send to Unsorted/<topic-hint> (provisional)
- Ambiguous → optional LLM arbitration or propose new folder (depth-bounded)
- Adds cross-links if close second nearly ties

### FolderManager
- Enforces naming (Title Case; shallow punctuation)
- Caps max depth (e.g., 4)
- Creates folders atomically
- Tracks provisional status
- Maintains folder manifests (stats, description, centroid cache)

### ArtifactWriter
- Writes Concept Artifact (JSON; optional Markdown twin)
- Deterministic filenames
- Atomic writes
- Idempotent behavior
- Appends structured AuditLog entry

### Deduper
- Before writing, probes Concept Index for near-duplicates
- Same-path links instead of new artifacts
- Cross-path near-dupes create cross-links and enter ReviewQueue

### AuditLog
- Append-only JSONL with:
	- Inputs, thresholds, top-K folder candidates
	- Final decision, confidence
	- Prompts/responses if LLM used
	- Operator (auto/human)
	- Timestamps

### ReviewQueue
- Holds low-confidence and cross-path conflicts
- Starts as JSON/SQLite
- Grows into minimal UI (approve/move) later

### Renamer (background)
- Periodically reviews provisional folders
- Collects examples
- Asks LLM for concise folder name + one-line description
- Performs atomic rename
- Updates alias map and indices
- Logs events

### TidyJob (scheduled)
- Merges tiny highly similar folders
- Splits bloated heterogeneous ones
- Reprocesses Unsorted after tree improvement

## Data Contracts

### Input: Batch (from BatcherService)
```json
{
	"window": "string",
	"topic": "string (programming, chemistry, etc.)",
	"entries": [
		{ "text": "string", "timestamp": "optional" }
	],
	"sessionMarkers": { "start": "optional", "end": "optional" }
}
```

### Intermediate: Concept Candidate
```json
{
	"candidate_id": "deterministic from (batchId, index, normalized text)",
	"raw_text": "stitched text",
	"source": {
		"window": "string",
		"topic": "string",
		"batchId": "string",
		"entryCount": "number"
	},
	"title_hint": "optional",
	"key_terms": ["optional"]
}
```

### Output: Concept Artifact
```json
{
	"artifact_id": "deterministic from (candidate_id, final_path)",
	"title": "short string",
	"summary": "2-5 sentence distilled explanation",
	"quiz_seeds": ["short prompts"],
	"content": {
		"distilled": "note",
		"raw_excerpt": "optional for provenance"
	},
	"routing": {
		"final_path": "Domain/Subdomain/Topic/Concept",
		"cross_links": ["optional paths"],
		"confidence": 0.0-1.0,
		"rationale": "if LLM arbiters",
		"provisional": true/false
	},
	"provenance": {
		"batchId": "string",
		"window": "string",
		"source_uri": "optional",
		"timestamps": {}
	},
	"model_info": {
		"embeddings_model": "name + version",
		"reranker": "optional",
		"llm": "optional + version"
	},
	"audit": {
		"created_at": "ISO string",
		"process_version": "string",
		"decision_log_pointer": "string"
	}
}
```

## Indices

### Concept Index
- Vector per artifact (+ metadata: path, quality score, created_at)
- Two-view vectors:
	- **Label vector**: title only (fast dedup cue)
	- **Context vector**: title + distilled summary (routing/search)

### Folder-Path Index
- Representation per folder path:
	- **Centroid vector**: mean of member concept context vectors
	- **Exemplar set**: small rotating set of representative items
	- **Lexical footprint**: key tokens/phrases
	- **Metadata**: parent(s), depth, size, variance, last_updated, description

## Poly-Hierarchy & Paths (DAG)

### Model
- Concepts = nodes (artifacts)
- Folders = nodes with stable folder_id
- Paths = labels connecting folder to parent(s)
- Each concept has one home folder + optional cross-links
- Filesystem view is projection of DAG

### Storage Options
- **Best**: content-addressed artifacts + index-defined folders + symlinks/alias maps
- **Fallback**: OS tree with symlinks for cross-links + folder manifests

## Placement Scoring

### Blend (not "similar to all")
- Centroid similarity (semantic cohesion)
- Max exemplar similarity (nearest neighbor inside folder)
- Lexical overlap (BM25/tf-idf; stabilizes acronyms/symbols)
- Penalties/bonuses: depth penalty, variance penalty, mild recency/size shaping

### Decision Rule
- Choose highest-scoring folder if ≥ high-confidence threshold AND beats runner-up by margin δ
- Ambiguous band → rerank or LLM tie-break
- Otherwise → Unsorted
- Cross-links: add if runner-up close and strong

## Practical Thresholds

```typescript
const THRESHOLDS = {
	HOME_PLACEMENT_HIGH_CONF: 0.82,
	UNSORTED_FALLBACK: 0.65,
	AMBIGUITY_BAND: [0.65, 0.82], // → rerank/LLM
	CROSS_LINK_DELTA: 0.03,
	CROSS_LINK_MIN_ABSOLUTE: 0.79,
	FOLDER_MERGE_CANDIDATES: 0.90, // centroid sim + member overlap
	MAX_FOLDER_DEPTH: 4
};
```

## Retrieval Strategy

### Embedding Text
- Always embed title + 2-5 sentence distilled explanation for context vector
- Keep label vector (title-only) for cheap dedup/lookups

### Mitigations
- Session-context enrichment: route on title + 1-2 representative sentences
- Two-view vectors: label + context stored per concept
- Hybrid retrieval: dense + lexical (BM25/sparse) to stabilize acronyms
- Folder descriptions: one-line per folder improves routing
- Reranker (cross-encoder) only for top-k in ambiguous band
- Acronym/notation normalization for recurring terms

## LLM Usage Plan

### Summaries
- Title + 2-5 sentences: short, cached via content_hash

### Arbitration (ambiguous cases)
- Choose among top candidates or propose new folder (depth-bounded)
- Return: path, confidence, 1-sentence rationale

### Rename Job (weekly)
- Propose concise folder names + descriptions for provisional folders

### Caps & Fallbacks
- Hard per-day caps
- Timeouts/backoffs
- When exceeded → Unsorted with reason
- Audit: log prompt/response summaries, token counts, model IDs

## Storage Layout

```
KnowledgeBase/
├── Domain/Subdomain/Topic/Concept/       # Leaf folders with artifacts
│   ├── concept-artifact.json
│   └── concept-artifact.md (optional)
├── .folder.json                           # Manifest per folder
├── Unsorted/<coarse-topic>/              # Low-confidence items
├── .indexes/                              # Vector stores/DB files
├── .audit/                                # Append-only JSONL per day
└── .manifests/                            # Session manifests, path aliases
```

## Idempotency & Error Recovery

### Deterministic IDs
- Candidates: content_hash-based
- Artifacts: candidate + path

### Reruns
- Identical artifact exists → skip write; repair indices if needed
- Path renamed → resolve via alias map
- Index update fails → artifact still exists; enqueue repair job
- LLM call fails → Unsorted with reason; record conservative confidence

### Validation
- Validate JSON; quarantine corrupt files
- Crash-safe queue for pending writes/updates

## Observability & Adaptivity

### Logging
- Structured JSON with candidate_id/artifact_id/folder_id throughout

### Metrics
- Routing latency
- % high-confidence vs ambiguous vs Unsorted
- LLM token spend
- Arbitration rate
- Rename merges/splits
- Folder variance
- Index sizes

### Polling Intelligence
- Pause when screen unchanged (frame differencing)
- Increase cadence when window changes frequently
- Allow alternate data sources (clipboard, editor buffer, PDFs)

### Feature Flags
- Local-Only Mode
- Reranker on/off
- Hybrid on/off
- LLM daily cap
- Rename/tidy cadence

## Testing Strategy

### Unit Tests
- Router threshold boundaries, margin logic, cross-link decisions
- Deduper same-path vs cross-path
- Artifact writing: idempotency & atomicity
- Audit logger: append-only integrity & rotation

### Integration Tests
- Batch → Candidate → Routing → Dedup → Artifact → Indices → Audit
- Provisional rename cycle & alias propagation
- Tidy (merge/split) on synthetic corpora

### Property Tests
- Same inputs ⇒ same outputs (IDs, filenames, paths)
- Rerunning session yields no new artifacts unless content changes

### Performance Tests
- Batched embedding throughput
- Vector search latency under target Top-K
- Folder centroid recompute cadence

## Rollout Plan

### Milestone 1: Core Pipeline
- Assemble → route → write → index → audit
- Unsorted default; dense vectors only
- Folder centroids; high-confidence auto-file

### Milestone 2: Dedup & Review
- Deduper & cross-links
- ReviewQueue + minimal UI/CLI
- Folder-Path Index improvements

### Milestone 3: Short-text Resilience
- Generate summaries (cached)
- Re-embed concepts (context vectors)
- Add hybrid lexical
- Optional reranker for ambiguous band

### Milestone 4: Operations
- Renamer job (weekly)
- Tidy job (weekly)
- LLM caps & arbitration
- Security & privacy flags
- Backups & rebuild drills
- Metrics dashboard

## Implementation Stack

### Languages
- **TypeScript (Node)**: orchestrator/app logic, files, local caches, desktop/electron, HTTP APIs
- **Python (FastAPI)**: tiny ML sidecar for local embeddings & optional reranker

### Vector & Lexical
- **Qdrant**: managed or container; fast dense HNSW, sparse vectors, nice local story, snapshots
- **Alternative**: Postgres + pgvector + FTS for one DB solution

### LLM & Embeddings
- **Embeddings**: start hosted (cheap, consistent) with local fallback
- **Reranker**: optional, local top-k only
- **LLM**: provider-agnostic adapter; short prompts, JSON outputs, hard caps

### Storage
- **Artifacts**: local filesystem as source of truth; mirror to object storage
- **Metadata DB**: SQLite locally; cloud Postgres if multi-device needed
- **Backups**: snapshot vector store; daily audit rotation; session manifests

## Security & Privacy
- Hybrid default sends distilled text only (no screenshots)
- HTTPS everywhere; managed KMS; at-rest encryption
- "Local-Only Mode" switch
- PII flag routes to private Unsorted

## Costs & Feasibility
- **Feasible** technically and economically
- LLM usage small and controllable
- Embeddings ~pennies hosted; $0 local
- Performance: routing/search fast; reranker only top-k; post-session batched

## Exit Criteria for v1
- ≥70% concepts land high-confidence without LLM
- Ambiguity band ≤20% and declining
- Review backlog manageable (<100 items)
- Rebuild drill succeeds
- Costs within budget

## Notes for Future Extension
- Orchestrator accepts new data sources (clipboard, editor, PDFs, web)
- Polling is metrics-driven (screen change detection, window churn, CPU/battery)
- MimirEngine orchestrates everything before LLM calls
- Thresholds, adapters, model choices all configurable
- Swap providers without redesign

---

**Status**: This is a living document, open for change as we discover better approaches during implementation.