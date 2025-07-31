# MIMIR TODO - Active Recall Study Tracker

## 🔥 HIGH PRIORITY - Model Discrimination Issues (CRITICAL)

### Model Performance Problems Identified
Current models (BART, RoBERTa, DeBERTa) show poor discrimination:
- **BART**: Too conservative (~30% confidence on all content)
- **DeBERTa**: HIGH false positives (classifies Netflix as studying 75% confidence)  
- **RoBERTa**: Inconsistent (misses legitimate study content)
- **Overall accuracy**: ~50% - INSUFFICIENT for production

### Immediate Next Steps
- [ ] **Try academic-specialized models (allenai/scibert-scivocab-uncased)**
  - Minimal code changes - just update MODEL_SPECIFICATIONS config
  - Download: `git clone https://huggingface.co/Xenova/scibert-scivocab-uncased`
  - Expected improvement: 70-80% chance of better textbook content detection
- [ ] **Test SciBERT discrimination on real textbook vs entertainment content**
- [ ] **If SciBERT fails, try other academic models (BiomedNLP-PubMedBERT, facebook/bart-large-cnn)**
- [ ] **Implement ensemble voting system if single models insufficient**

### Architecture Integration (MEDIUM PRIORITY)
- [ ] **Integrate SegmentedClassificationService into Orchestrator pipeline**
- [ ] **Update VisionService to use new segmented classification**
- [ ] **Implement dynamic confidence thresholds based on model performance**

## ✅ COMPLETED 

### Multi-Model AI Classification System (DONE)
- ✅ **Text Preprocessing** - SymSpell integration with Python
- ✅ **Text Segmentation** - Sentence-based with line-based fallback  
- ✅ **Model Factory Pattern** - Scalable architecture for multiple models
- ✅ **Downloaded Models** - BART, RoBERTa, DeBERTa all working with real AI
- ✅ **Comprehensive Testing** - 30+ tests including real AI integration
- ✅ **SRP Architecture** - Clean separation: preprocessing → segmentation → classification

### Performance & Reliability  
- [ ] **Local model caching optimization**
- [ ] **Error recovery mechanisms**
- [ ] **Performance monitoring and metrics**
- [ ] **Memory usage optimization**

## Technical Debt
- [ ] **Remove any remaining console.log statements**
- [ ] **Add comprehensive error handling tests**  
- [ ] **Implement proper logging service interface**
- [ ] **Create integration tests for full pipeline**