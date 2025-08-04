# Configuration Guide

## Environment Variables

### Model Configuration

#### USE_FULL_MODELS

Controls whether the application uses full-precision models or quantized models for classification.

**Options:**
- `true` - Use full-precision models (higher accuracy, more memory usage)
- `false` (default) - Use quantized models (lower memory usage, slightly reduced accuracy)

**How to set:**

1. **macOS/Linux (Terminal):**
   ```bash
   # Set for current session only
   export USE_FULL_MODELS=true
   npm start
   
   # Or inline with the command
   USE_FULL_MODELS=true npm start
   ```

2. **Windows (Command Prompt):**
   ```cmd
   set USE_FULL_MODELS=true
   npm start
   ```

3. **Windows (PowerShell):**
   ```powershell
   $env:USE_FULL_MODELS="true"
   npm start
   ```

4. **Using .env file (recommended for development):**
   Create a `.env` file in the project root:
   ```
   USE_FULL_MODELS=true
   ```

5. **VS Code launch.json:**
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Electron Main",
     "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
     "program": "${workspaceFolder}/dist/main/main.js",
     "env": {
       "USE_FULL_MODELS": "true"
     }
   }
   ```

**Model Differences:**

| Model Type | Size | Accuracy | Memory Usage | Speed |
|------------|------|----------|--------------|-------|
| Quantized | ~50-200MB | ~95-98% of full | Low (1-2GB) | Fast |
| Full | ~500MB-2GB | 100% | High (4-8GB) | Slower |

**When to use full models:**
- Production environments with sufficient memory
- When maximum accuracy is critical
- Benchmarking and testing
- Research and development

**When to use quantized models (default):**
- Development environments
- Memory-constrained systems
- Quick testing and prototyping
- Most general use cases

### Other Environment Variables

#### Polling Intervals

- `WINDOW_CHANGE_POLL_MS` - Window change detection interval (default: 5000ms)
- `STUDYING_OCR_POLL_MS` - OCR polling interval when studying (default: 30000ms)  
- `IDLE_REVAL_POLL_MS` - Idle state revalidation interval (default: 10000ms)

#### Classification Thresholds

- `CLASSIFICATION_CONFIDENCE_THRESHOLD` - Minimum confidence for classification (default: 0.5)

## Configuration Files

### CLAUDE.md

The `CLAUDE.md` file in your project root can contain project-specific instructions and configurations that Claude will read and follow.

### settings.json

Application settings can be configured in `settings.json`:

```json
{
  "models": {
    "useFullModels": false,
    "defaultModel": "distilbert-base-uncased-mnli"
  },
  "polling": {
    "windowChangeIntervalMs": 5000,
    "studyingOcrIntervalMs": 30000,
    "idleRevalidationIntervalMs": 10000
  },
  "classification": {
    "confidenceThreshold": 0.5
  }
}
```

## Model Path Configuration

Models are stored in:
- Quantized models: `./models/` directory
- Full models: `./models-full/` directory

The application automatically selects the correct path based on the `USE_FULL_MODELS` setting.