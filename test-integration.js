/**
 * Quick integration test to verify the refactored components work together
 */

const { loadPipelineConfig, validatePipelineConfig } = require('./dist/core/config/PipelineConfig');
const { ConceptCandidate } = require('./dist/core/domain/ConceptCandidate');

try {
  console.log('Testing configuration loading...');
  const config = loadPipelineConfig();
  validatePipelineConfig(config);
  console.log('✅ Configuration loads and validates successfully');
  
  console.log('Configuration values:');
  console.log('  High confidence threshold:', config.routing.highConfidenceThreshold);
  console.log('  Vector dimensions:', config.vector.defaultDimensions);
  console.log('  Min text length:', config.textValidation.minTextLength);
  
  console.log('\nTesting ConceptCandidate with configuration...');
  const mockBatch = {
    batchId: 'test-batch-123',
    window: 'Test Window',
    topic: 'Testing',
    entries: [{
      text: 'This is a test concept for integration testing',
      timestamp: new Date()
    }],
    createdAt: new Date()
  };
  
  const candidate = new ConceptCandidate(
    mockBatch, 
    'This is a test concept for integration testing with sufficient length and quality',
    0,
    config
  );
  
  console.log('✅ ConceptCandidate created successfully');
  console.log('  Candidate ID:', candidate.id);
  console.log('  Raw text length:', candidate.rawText.length);
  
  const normalized = candidate.normalize();
  console.log('  Normalized text:', normalized.normalizedText.substring(0, 50) + '...');
  console.log('  Content hash:', normalized.contentHash.substring(0, 16) + '...');
  
  console.log('\n🎉 All integration tests passed! Everything is working correctly.');
  
} catch (error) {
  console.error('❌ Integration test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}