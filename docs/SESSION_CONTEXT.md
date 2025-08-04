# Session Context Summary

## Next Session Prompt
Copy and paste this into your next Claude Code session:

```
Continue from previous session. I'm working on an active-recall application with AI classification. 

Key context:
- We fixed model loading errors, Electron screen capture bug with native fallback, and label formatting (improved accuracy 24%→92%)
- BUT models still don't match HuggingFace accuracy - we have ONNX quantized versions but need actual PyTorch models from HuggingFace
- SegmentedClassificationService has broken threshold logic for single segments
- USE_FULL_MODELS=true works but uses wrong model format

Priority issues to fix:
1. Download correct PyTorch models from HuggingFace (not ONNX versions)
2. Fix idle vs studying classification when only one segment exceeds threshold

Key files: IModelPathResolver.ts, TopicClassificationService.ts, SegmentedClassificationService.ts, HybridCaptureService.ts

See docs/SESSION_CONTEXT.md for full details. Load the todo list to see current status.
```

## Current Status
We have made significant progress fixing core issues but have identified two critical problems that need resolution:

### Completed Fixes ✅
- **Model Loading Errors**: Fixed transformers.js path resolution issues
- **Electron Screen Capture Bug**: Implemented hybrid fallback to native macOS screencapture
- **Label Formatting**: Fixed accuracy from 24% → 92% by removing "This text is about X" prefix
- **Environment Variables**: Added dotenv support, USE_FULL_MODELS now works
- **Error Handling**: Upgraded to production standards with ErrorHandler integration
- **Code Abstractions**: Improved readability with focused methods

### Critical Issues Remaining 🚨
1. **Model Accuracy Mismatch**: Local models don't match HuggingFace web interface accuracy
   - **Root Cause**: We have ONNX quantized versions instead of original PyTorch models
   - **Location**: `/models/` (quantized ONNX) and `/models-full/` (also ONNX, not PyTorch)
   - **Solution Needed**: Download actual PyTorch models from HuggingFace

2. **Segmented Classification Logic**: Broken threshold logic for single segments
   - **Issue**: Idle vs studying classification fails when only one segment exceeds threshold
   - **File**: `SegmentedClassificationService.ts`
   - **Status**: Needs debugging and fix

### Key Files Modified
- `src/main/services/analysis/IModelPathResolver.ts` - Model path resolution
- `src/main/services/analysis/impl/TopicClassificationService.ts` - Label generation
- `src/main/services/capture/impl/HybridCaptureService.ts` - Screen capture fallback
- `src/main/main.ts` - Dotenv configuration
- `.env` - Environment variables (already in .gitignore)

### Environment Configuration
- `USE_FULL_MODELS=true` is working but using wrong model format
- Models are in `/models-full/` but need to be actual HuggingFace PyTorch models
- Current setup uses ONNX versions which may explain accuracy differences

### Next Session Priority
1. Investigate model format differences between local ONNX and HuggingFace PyTorch
2. Download correct model formats from HuggingFace
3. Debug and fix SegmentedClassificationService threshold logic
4. Verify final accuracy matches HuggingFace web interface exactly