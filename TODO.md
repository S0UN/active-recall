# MIMIR TODO - Active Recall Study Tracker

## High Priority Issues


### 1. Classification Model Improvements  
- [ ] **Better Zero-Shot Classification Model**
	- Upgrade from DistilBERT to RoBERTa-large-mnli or DeBERTa-v3-large
	- Implement facebook/bart-large-mnli for improved accuracy
	- Add confidence threshold tuning based on real usage data


## Completed 

### Text Preprocessing (DONE)
-  **Spell-check via SymSpell** - Implemented with Python integration
- **Strip boilerplate UI elements** - Comprehensive text cleaning implemented
-  **Integration testing** - E2E tests with real preprocessing pipeline

## Future Enhancements

### Advanced Classification Pipeline
- [ ] **Upgrade to RoBERTa/DeBERTa models**
- [ ] **Implement chunk aggregation strategies**
- [ ] **Add embedding similarity fallbacks**
- [ ] **Confidence-driven user confirmation**

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