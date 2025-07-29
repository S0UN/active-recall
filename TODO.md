# Classification Improvement TODO

## Implementation Strategy for Arbitrary Category Classification

### 1. Pre-process Your OCR
- [ ] **Spell-check via SymSpell or similar**
  - Implement spell correction to handle OCR errors
  - Use SymSpell library for fast correction
  
- [ ] **Strip boilerplate (UI chrome, menus, headers)**
  - Remove common UI elements from OCR text
  - Filter out navigation, menus, status bars
  - Extract only meaningful content
  

*This ensures whatever comes into your classifier is as clean as possible.*

### 2. Zero-Shot Classification via NLI
Use a natural-language-inference model to ask "does this text entail the label?" for any label string the user types:

- [ ] **Upgrade to better model**
  - Model options: `roberta-large-mnli`, `deberta-v3-large-mnli`, or any MNLI-fine-tuned transformer
  - Recommended: `facebook/bart-large-mnli`
  
- [ ] **Implement improved pipeline**
  ```javascript
  const classifier = pipeline('zero-shot-classification',
    { model: 'facebook/bart-large-mnli' });

  const result = await classifier(
    ocrChunk,
    [userCategory],              // your single candidate
    { hypothesis_template:
      'This text is about {}.' }
  );
  // result.labels = [ userCategory ]
  // result.scores = [ 0.82 ]   // probability of entailment
  ```
  
- [ ] **Set decision threshold**
  - Decision: if scores[0] ≥ τ (e.g. 0.7), label it a match
  - Tune threshold based on real data

*Because the pipeline embeds both the text and the exact category phrase, it works no matter what the user types, without any retraining.*

### 3. Aggregate Across Chunks
If you split into N sentences/paragraphs, you'll get N scores. Aggregate by:

- [ ] **Implement Max aggregation**
  - If any chunk scores above τ, call it a match
  
- [ ] **Implement Average aggregation**  
  - Take the mean score and compare to a (possibly higher) threshold
  
- [ ] **Experiment on dev set**
  - Test on real screen captures to pick the best rule

### 4. Fallback: Embedding Similarity
If you ever want an even lighter-weight check (or a second opinion):

- [ ] **Implement sentence embeddings**
  - Use sentence-transformers (e.g. `all-MiniLM-L6-v2`)
  - Embed both OCR text and category
  
- [ ] **Compute cosine similarity**
  - If ≥ 0.65 (tuneable), treat as a match
  
- [ ] **Log disagreements**
  - When NLI and embedding similarity disagree, log for analysis

### 5. Confidence-Driven Clarification
For low-confidence cases (score between two thresholds, say 0.4–0.7):

- [ ] **Ask user for confirmation**
  - "Are you really looking at X?"
  
- [ ] **Show OCR snippet**
  - Display snippet of OCR'd text alongside category for thumbs-up

## Why This Scales
- **Arbitrary labels**: Never bake in specific keywords or examples
- **Off-the-shelf**: No per-category training data needed  
- **Calibratable**: Thresholds and aggregations can be tweaked as you collect usage data

## Next Steps Priority Order
1. [ ] **Swap DistilBART for Huggingface zero-shot pipeline**
2. [ ] **Pick initial τ (e.g. 0.7) and evaluate on real screenshots**
3. [ ] **Log mismatches and refine chunk-aggregation rule**

*This will give you a truly general, plug-and-play solution for "Is this screen about category Y?" no matter what Y is.*

## Implementation Notes
- Create new `BartLargeClassificationService` implementing `IClassificationService`
- Keep `DistilBARTService` for comparison/fallback
- Use container DI to switch between implementations
- Follow TDD approach with comprehensive tests
- Maintain backward compatibility with existing API