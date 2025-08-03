import 'reflect-metadata';
import container from './container';
import { ClassificationTester } from '../test/ClassificationTester';
import { UniversalModelFactory } from './services/analysis/impl/UniversalModelFactory';
import Logger from 'electron-log';

async function runClassificationTests() {
  try {
    Logger.info('🧪 Starting Classification Testing Suite');
    
    // Get the model factory from container
    const modelFactory = container.resolve<UniversalModelFactory>('ModelFactory');
    const tester = new ClassificationTester(modelFactory);
    
    // Test 1: Compare all available models
    Logger.info('\n=== COMPARING ALL MODELS ===');
    const modelComparison = await tester.compareModels('computer science');
    
    // Test 2: Test different topics with best model
    const bestModel = modelComparison[0]; // Highest accuracy model
    Logger.info(`\n=== TESTING TOPICS WITH BEST MODEL (${bestModel.model}) ===`);
    const topicComparison = await tester.testDifferentTopics(bestModel.model);
    
    // Test 3: Test roberta specifically since that's what you're using
    Logger.info('\n=== DETAILED ROBERTA TESTING ===');
    const robertaResult = await tester.testModel('zero-shot', 'roberta-large-mnli', 'computer science', 0.5);
    
    // Print summary recommendations
    Logger.info('\n📋 RECOMMENDATIONS:');
    
    const bestTopic = Object.entries(topicComparison)
      .sort(([,a], [,b]) => b.accuracy - a.accuracy)[0];
    
    Logger.info(`✨ Best overall model: ${bestModel.model} (${bestModel.accuracy.toFixed(1)}% accuracy)`);
    Logger.info(`✨ Best topic for roberta: "${bestTopic[0]}" (${bestTopic[1].accuracy.toFixed(1)}% accuracy)`);
    
    // Identify problem areas
    const problemScenarios = robertaResult.results.filter(r => !r.correct);
    if (problemScenarios.length > 0) {
      Logger.info('\n⚠️  MISCLASSIFIED SCENARIOS:');
      problemScenarios.forEach(scenario => {
        Logger.info(`  - ${scenario.scenario}: expected ${scenario.expected}, got ${scenario.actual} (${scenario.confidence.toFixed(3)})`);
      });
    }
    
    // Threshold recommendations
    const highConfidenceErrors = problemScenarios.filter(s => s.confidence > 0.7);
    const lowConfidenceCorrect = robertaResult.results.filter(r => r.correct && r.confidence < 0.6);
    
    if (highConfidenceErrors.length > 0) {
      Logger.info(`\n🎯 Consider increasing threshold above 0.7 to reduce ${highConfidenceErrors.length} high-confidence errors`);
    }
    
    if (lowConfidenceCorrect.length > 0) {
      Logger.info(`\n🎯 ${lowConfidenceCorrect.length} correct predictions had low confidence - current threshold might be appropriate`);
    }
    
    Logger.info('\n✅ Testing complete!');
    
    return {
      modelComparison,
      topicComparison,
      robertaResult,
      recommendations: {
        bestModel: bestModel.model,
        bestTopic: bestTopic[0],
        problemAreas: problemScenarios.map(s => s.scenario)
      }
    };
    
  } catch (error) {
    Logger.error('Testing failed:', error);
    throw error;
  }
}

// Export for use in other modules or run directly
export { runClassificationTests };

if (require.main === module) {
  runClassificationTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}