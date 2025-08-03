import { injectable } from 'tsyringe';
import { UniversalModelFactory } from '../main/services/analysis/impl/UniversalModelFactory';
import Logger from 'electron-log';

export interface TestScenario {
  name: string;
  text: string;
  expectedCategory: 'studying' | 'idle';
}

export interface TestResult {
  scenario: string;
  expected: string;
  actual: string;
  confidence: number;
  correct: boolean;
}

export interface ModelTestResults {
  model: string;
  strategy: string;
  topic: string;
  accuracy: number;
  studyingAccuracy: number;
  idleAccuracy: number;
  results: TestResult[];
}

@injectable()
export class ClassificationTester {
  
  private readonly testScenarios: TestScenario[] = [
    // STUDYING scenarios
    {
      name: "Programming tutorial",
      text: "function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[arr.length - 1]; const left = []; const right = []; for (let i = 0; i < arr.length - 1; i++) { if (arr[i] < pivot) { left.push(arr[i]); } else { right.push(arr[i]); } } return [...quickSort(left), pivot, ...quickSort(right)]; }",
      expectedCategory: 'studying'
    },
    {
      name: "Computer science concepts",
      text: "Algorithm analysis involves determining the computational complexity of algorithms. Big O notation describes the upper bound of an algorithm's time complexity. Binary search has O(log n) complexity.",
      expectedCategory: 'studying'
    },
    {
      name: "Data structures",
      text: "A binary tree is a hierarchical data structure where each node has at most two children. Tree traversal algorithms include in-order, pre-order, and post-order traversal.",
      expectedCategory: 'studying'
    },
    {
      name: "Programming documentation",
      text: "The useState hook lets you add React state to function components. It returns an array with the current state value and a function to update it.",
      expectedCategory: 'studying'
    },
    {
      name: "Academic paper abstract",
      text: "This paper presents a novel approach to natural language processing using transformer architectures. We demonstrate improved performance on sentiment analysis tasks.",
      expectedCategory: 'studying'
    },
    {
      name: "Math concepts",
      text: "Linear algebra forms the foundation of machine learning. Matrix multiplication, eigenvalues, and eigenvectors are essential for principal component analysis.",
      expectedCategory: 'studying'
    },
    {
      name: "Physics textbook",
      text: "Newton's second law states that acceleration is directly proportional to net force and inversely proportional to mass. F = ma.",
      expectedCategory: 'studying'
    },
    {
      name: "Wikipedia programming article",
      text: "Computer programming involves designing and implementing algorithms by writing code in programming languages. Programmers use high-level languages.",
      expectedCategory: 'studying'
    },
    
    // IDLE scenarios  
    {
      name: "Spotify interface",
      text: "What do you want to play? Connect a device Playlist AirPods Pro This computer Saweetie TWICE Follow No other devices found PlagueBoyMax DailyMix3 New release Don't see your device?",
      expectedCategory: 'idle'
    },
    {
      name: "YouTube comments",
      text: "Subscribe and hit the bell icon! Today we're reacting to the latest Marvel trailer. Like this video if you enjoyed it! 247 likes 18 comments",
      expectedCategory: 'idle'
    },
    {
      name: "Social media post",
      text: "Just had the best coffee at this new cafe downtown! ☕ The latte art was incredible. #coffee #morning #blessed Share Like Comment",
      expectedCategory: 'idle'
    },
    {
      name: "Shopping website",
      text: "Add to cart $29.99 Free shipping Customer reviews 4.5 stars Size: Medium Color: Blue Quantity: 1 Buy now Add to wishlist",
      expectedCategory: 'idle'
    },
    {
      name: "Gaming interface",
      text: "Level up! You gained 250 XP New achievement unlocked: Master Explorer Inventory full Next quest: Defeat the Dragon Boss",
      expectedCategory: 'idle'
    },
    {
      name: "Recipe website",
      text: "Chocolate chip cookies recipe: Preheat oven to 375°F. Mix flour, baking soda, salt. Cream butter and sugars. Bake 10-12 minutes.",
      expectedCategory: 'idle'
    },
    {
      name: "Email inbox",
      text: "You have 12 new messages Promotional offer: 50% off Meeting reminder: Team standup Package delivered Order confirmation Thank you",
      expectedCategory: 'idle'
    },
    {
      name: "News website",
      text: "Breaking News: Weather forecast shows sunny skies. Sports scores: Lakers beat Warriors 112-108. Celebrity announces new movie project.",
      expectedCategory: 'idle'
    }
  ];

  constructor(private readonly modelFactory: UniversalModelFactory) {}

  public async testModel(
    strategyType: 'zero-shot' | 'embedding' | 'hybrid',
    modelName: string,
    topic: string = 'computer science',
    threshold: number = 0.5
  ): Promise<ModelTestResults> {
    
    Logger.info(`Testing ${strategyType} strategy with ${modelName}`, { topic, threshold });
    
    try {
      const strategy = await this.modelFactory.createStrategy(strategyType, modelName, {
        topic,
        threshold
      });

      const results: TestResult[] = [];
      
      for (const scenario of this.testScenarios) {
        try {
          const classificationResult = await strategy.classifyWithConfidence(scenario.text);
          
          // Convert classification result to studying/idle
          const actual = this.normalizeClassification(classificationResult.classification);
          const correct = actual === scenario.expectedCategory;
          
          results.push({
            scenario: scenario.name,
            expected: scenario.expectedCategory,
            actual,
            confidence: classificationResult.confidence,
            correct
          });
          
          const emoji = correct ? '✅' : '❌';
          Logger.info(`${emoji} ${scenario.name}: ${actual} (${classificationResult.confidence.toFixed(3)})`);
          
        } catch (error) {
          Logger.error(`Failed to test scenario "${scenario.name}":`, error);
          results.push({
            scenario: scenario.name,
            expected: scenario.expectedCategory,
            actual: 'error',
            confidence: 0,
            correct: false
          });
        }
      }
      
      return this.calculateResults(results, strategyType, modelName, topic);
      
    } catch (error) {
      Logger.error(`Failed to create strategy ${strategyType} with ${modelName}:`, error);
      throw error;
    }
  }

  public async compareModels(topic: string = 'computer science'): Promise<ModelTestResults[]> {
    const modelsToTest = [
      { strategy: 'zero-shot' as const, model: 'roberta-large-mnli' },
      { strategy: 'zero-shot' as const, model: 'distilbert-base-uncased-mnli' },
      { strategy: 'zero-shot' as const, model: 'microsoft/deberta-v3-large' },
      { strategy: 'zero-shot' as const, model: 'facebook/bart-large-mnli' }
    ];

    const results: ModelTestResults[] = [];
    
    for (const config of modelsToTest) {
      try {
        const result = await this.testModel(config.strategy, config.model, topic);
        results.push(result);
        Logger.info(`Completed testing ${config.model}: ${result.accuracy}% accuracy`);
      } catch (error) {
        Logger.error(`Skipped ${config.model} due to error:`, error);
      }
    }
    
    // Sort by accuracy
    results.sort((a, b) => b.accuracy - a.accuracy);
    
    this.printComparison(results);
    
    return results;
  }

  public async testDifferentTopics(modelName: string = 'roberta-large-mnli'): Promise<Record<string, ModelTestResults>> {
    const topics = [
      'computer science',
      'programming', 
      'studying',
      'academic content',
      'learning material',
      'educational content'
    ];
    
    const results: Record<string, ModelTestResults> = {};
    
    for (const topic of topics) {
      try {
        Logger.info(`Testing topic: "${topic}"`);
        results[topic] = await this.testModel('zero-shot', modelName, topic);
        Logger.info(`Topic "${topic}" accuracy: ${results[topic].accuracy}%`);
      } catch (error) {
        Logger.error(`Failed to test topic "${topic}":`, error);
      }
    }
    
    this.printTopicComparison(results);
    
    return results;
  }

  private normalizeClassification(classification: string): 'studying' | 'idle' {
    const lower = classification.toLowerCase();
    if (lower.includes('study') || lower.includes('learn') || lower.includes('academic') || 
        lower.includes('education') || lower.includes('computer science') || lower.includes('programming')) {
      return 'studying';
    }
    return 'idle';
  }

  private calculateResults(
    results: TestResult[], 
    strategy: string, 
    model: string, 
    topic: string
  ): ModelTestResults {
    const totalTests = results.length;
    const correctTests = results.filter(r => r.correct).length;
    
    const studyingTests = results.filter(r => r.expected === 'studying');
    const studyingCorrect = studyingTests.filter(r => r.correct).length;
    
    const idleTests = results.filter(r => r.expected === 'idle');
    const idleCorrect = idleTests.filter(r => r.correct).length;
    
    return {
      model,
      strategy,
      topic,
      accuracy: (correctTests / totalTests) * 100,
      studyingAccuracy: (studyingCorrect / studyingTests.length) * 100,
      idleAccuracy: (idleCorrect / idleTests.length) * 100,
      results
    };
  }

  private printComparison(results: ModelTestResults[]): void {
    Logger.info("\n🏆 MODEL COMPARISON RESULTS:");
    Logger.info("Model".padEnd(25) + "Accuracy".padEnd(10) + "Studying".padEnd(10) + "Idle");
    Logger.info("-".repeat(55));
    
    for (const result of results) {
      const modelName = result.model.replace('microsoft/', '').replace('facebook/', '');
      Logger.info(
        modelName.padEnd(25) + 
        `${result.accuracy.toFixed(1)}%`.padEnd(10) + 
        `${result.studyingAccuracy.toFixed(1)}%`.padEnd(10) + 
        `${result.idleAccuracy.toFixed(1)}%`
      );
    }
  }

  private printTopicComparison(results: Record<string, ModelTestResults>): void {
    Logger.info("\n🎯 TOPIC COMPARISON RESULTS:");
    Logger.info("Topic".padEnd(20) + "Accuracy".padEnd(10) + "Studying".padEnd(10) + "Idle");
    Logger.info("-".repeat(50));
    
    const sortedTopics = Object.entries(results)
      .sort(([,a], [,b]) => b.accuracy - a.accuracy);
    
    for (const [topic, result] of sortedTopics) {
      Logger.info(
        topic.padEnd(20) + 
        `${result.accuracy.toFixed(1)}%`.padEnd(10) + 
        `${result.studyingAccuracy.toFixed(1)}%`.padEnd(10) + 
        `${result.idleAccuracy.toFixed(1)}%`
      );
    }
  }
}