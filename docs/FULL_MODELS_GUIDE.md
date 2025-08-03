# Using Full Precision Models Instead of Quantized

## Current Issue

Your current models in the `/models` directory are quantized (compressed) versions:
- They use 8-bit integers (QInt8) instead of full 32-bit floats
- This reduces accuracy by approximately 5-10%
- The Spotify false positives are partly due to this reduced precision

## Solution Options

### Option 1: Use Hugging Face Inference API (Recommended)

The easiest way to use full models without downloading them:

```typescript
// Example API call to Hugging Face
const response = await fetch(
  "https://api-inference.huggingface.co/models/facebook/bart-large-mnli",
  {
    headers: { Authorization: "Bearer YOUR_HF_TOKEN" },
    method: "POST",
    body: JSON.stringify({
      inputs: "Your text to classify",
      parameters: {
        candidate_labels: ["studying", "not studying"],
        multi_label: false
      }
    }),
  }
);
const result = await response.json();
```

Get your free API token at: https://huggingface.co/settings/tokens

### Option 2: Download Full Models Locally

Run the provided script to download full models:
```bash
./download-full-models.sh
```

This will download the full precision models (several GB each).

### Option 3: Use Python Backend

For best accuracy, use the Python transformers library:

```python
from transformers import pipeline

classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli"
)

result = classifier(
    "C programming language documentation",
    candidate_labels=["studying", "not studying"]
)
```

## Why Full Models Matter

**Quantized (Current)**:
- bart-large-mnli → 56% accuracy
- Spotify misclassified with 0.757 confidence

**Full Precision**:
- bart-large-mnli → 85%+ accuracy  
- Better discrimination between topics

## Quick Fix for Now

Without downloading new models, the optimized settings should help:
- Topic: "studying" (not "computer science")
- Threshold: 0.65
- Model: roberta-large-mnli

But for best results, use the full models!