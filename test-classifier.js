/**
 * Classification Model Testing Script
 * Tests different classification strategies with realistic content scenarios
 */

const { container } = require('./dist/main/container');
const { UniversalModelFactory } = require('./dist/main/services/analysis/impl/UniversalModelFactory');

// Realistic test scenarios that users encounter
const testScenarios = {
  studying: [
    // Programming/CS content
    {
      name: "Programming tutorial",
      text: "function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[arr.length - 1]; const left = []; const right = []; for (let i = 0; i < arr.length - 1; i++) { if (arr[i] < pivot) { left.push(arr[i]); } else { right.push(arr[i]); } } return [...quickSort(left), pivot, ...quickSort(right)]; }"
    },
    {
      name: "Computer science textbook",
      text: "Algorithm analysis involves determining the computational complexity of algorithms. Big O notation describes the upper bound of an algorithm's time complexity. For example, binary search has O(log n) time complexity while linear search has O(n)."
    },
    {
      name: "Data structures lecture",
      text: "A binary tree is a hierarchical data structure where each node has at most two children, referred to as left and right child. Tree traversal algorithms include in-order, pre-order, and post-order traversal."
    },
    {
      name: "Math concepts",
      text: "Linear algebra forms the foundation of machine learning. Matrix multiplication, eigenvalues, and eigenvectors are essential concepts for understanding principal component analysis and neural networks."
    },
    {
      name: "Academic paper",
      text: "Abstract: This paper presents a novel approach to natural language processing using transformer architectures. We demonstrate improved performance on sentiment analysis tasks with 95% accuracy on benchmark datasets."
    },
    {
      name: "Programming documentation",
      text: "The useState hook is a function that lets you add React state to function components. It returns an array with two elements: the current state value and a function that lets you update it."
    },
    
    // Other academic content
    {
      name: "Physics textbook",
      text: "Newton's second law states that the acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass. F = ma, where F is force, m is mass, and a is acceleration."
    },
    {
      name: "Biology notes",
      text: "Mitosis is the process by which a single cell divides to produce two identical daughter cells. The phases include prophase, metaphase, anaphase, and telophase."
    }
  ],
  
  idle: [
    // Entertainment content
    {
      name: "Spotify interface",
      text: "What do you want to play? Connect a device Playlist Hide announcement AirPods Pro This computer Saweetie - TWICE here! Follow No other devices found PlagueBoyMax DailyMix3 Restart your speaker Follow setup instructions New release from Made For Kali Uchis Don't see your device? The Weekend, Daniel Brent Faisal, GIVEON Overslept feat."
    },
    {
      name: "YouTube video",
      text: "Subscribe to my channel and hit the bell icon for notifications! Today we're doing a reaction to the latest Marvel trailer. Like this video if you enjoyed it!"
    },
    {
      name: "Social media",
      text: "Just had the best coffee at this new cafe downtown! ☕ The latte art was incredible. #coffee #morning #blessed 247 likes 18 comments Share"
    },
    {
      name: "News website",
      text: "Breaking News: Local weather forecast shows sunny skies this weekend. Sports scores: Lakers beat Warriors 112-108. Celebrity news: Actor announces new movie project."
    },
    {
      name: "Shopping website",
      text: "Add to cart $29.99 Free shipping on orders over $50 Customer reviews 4.5 stars Size: Medium Color: Blue Quantity: 1 Buy now Add to wishlist"
    },
    {
      name: "Gaming content",
      text: "Level up! You gained 250 XP New achievement unlocked: Master Explorer Inventory full - sell items at merchant Next quest: Defeat the Dragon Boss"
    },
    {
      name: "Recipe website",
      text: "Chocolate chip cookies recipe: Preheat oven to 375°F. Mix flour, baking soda, and salt. Cream butter and sugars. Add eggs and vanilla. Bake for 10-12 minutes."
    },
    {
      name: "Email inbox",
      text: "You have 12 new messages Promotional offer: 50% off all items Meeting reminder: Team standup at 2pm Package delivered to your door Order confirmation: Thank you for your purchase"
    }
  ],
  
  ambiguous: [
    // Edge cases that might be tricky
    {
      name: "Programming job posting",
      text: "Software Engineer position available. Requirements: 3+ years JavaScript experience, knowledge of React, Node.js. Competitive salary and benefits. Apply now!"
    },
    {
      name: "Tech news",
      text: "Apple announces new iPhone with improved camera and longer battery life. The device features the latest A17 chip and supports 5G connectivity."
    },
    {
      name: "Code in email",
      text: "Hi team, here's the fix for the bug: if (user.isLoggedIn()) { showDashboard(); } else { redirectToLogin(); } Let me know if you have questions!"
    }
  ]
};

async function testClassificationStrategy(strategyType, modelName, topic = 'computer science') {
  console.log(`\n=== Testing ${strategyType} strategy with ${modelName} ===`);
  console.log(`Topic: ${topic}\n`);
  
  try {
    const factory = container.resolve('ModelFactory');
    const strategy = await factory.createStrategy(strategyType, modelName, {
      topic: topic,
      threshold: 0.5
    });
    
    const results = {
      studying: [],
      idle: [],
      ambiguous: []
    };
    
    // Test studying scenarios
    console.log("📚 STUDYING CONTENT:");
    for (const scenario of testScenarios.studying) {
      try {
        const result = await strategy.classifyWithConfidence(scenario.text);
        results.studying.push({
          name: scenario.name,
          classification: result.classification,
          confidence: result.confidence.toFixed(3),
          correct: result.classification === 'studying'
        });
        
        const emoji = result.classification === 'studying' ? '✅' : '❌';
        console.log(`${emoji} ${scenario.name}: ${result.classification} (${result.confidence.toFixed(3)})`);
      } catch (error) {
        console.log(`❌ ${scenario.name}: ERROR - ${error.message}`);
      }
    }
    
    // Test idle scenarios
    console.log("\n🎵 IDLE/ENTERTAINMENT CONTENT:");
    for (const scenario of testScenarios.idle) {
      try {
        const result = await strategy.classifyWithConfidence(scenario.text);
        results.idle.push({
          name: scenario.name,
          classification: result.classification,
          confidence: result.confidence.toFixed(3),
          correct: result.classification === 'idle'
        });
        
        const emoji = result.classification === 'idle' ? '✅' : '❌';
        console.log(`${emoji} ${scenario.name}: ${result.classification} (${result.confidence.toFixed(3)})`);
      } catch (error) {
        console.log(`❌ ${scenario.name}: ERROR - ${error.message}`);
      }
    }
    
    // Test ambiguous scenarios
    console.log("\n🤔 AMBIGUOUS CONTENT:");
    for (const scenario of testScenarios.ambiguous) {
      try {
        const result = await strategy.classifyWithConfidence(scenario.text);
        results.ambiguous.push({
          name: scenario.name,
          classification: result.classification,
          confidence: result.confidence.toFixed(3)
        });
        
        console.log(`ℹ️  ${scenario.name}: ${result.classification} (${result.confidence.toFixed(3)})`);
      } catch (error) {
        console.log(`❌ ${scenario.name}: ERROR - ${error.message}`);
      }
    }
    
    // Calculate accuracy
    const studyingCorrect = results.studying.filter(r => r.correct).length;
    const idleCorrect = results.idle.filter(r => r.correct).length;
    const totalCorrect = studyingCorrect + idleCorrect;
    const totalTests = results.studying.length + results.idle.length;
    const accuracy = (totalCorrect / totalTests * 100).toFixed(1);
    
    console.log(`\n📊 RESULTS SUMMARY:`);
    console.log(`Overall Accuracy: ${accuracy}% (${totalCorrect}/${totalTests})`);
    console.log(`Studying Detection: ${studyingCorrect}/${results.studying.length} correct`);
    console.log(`Idle Detection: ${idleCorrect}/${results.idle.length} correct`);
    
    return {
      strategy: strategyType,
      model: modelName,
      accuracy: parseFloat(accuracy),
      studyingAccuracy: (studyingCorrect / results.studying.length * 100).toFixed(1),
      idleAccuracy: (idleCorrect / results.idle.length * 100).toFixed(1),
      results
    };
    
  } catch (error) {
    console.error(`Failed to test ${strategyType} with ${modelName}:`, error.message);
    return null;
  }
}

async function runAllTests() {
  console.log("🧪 Starting Classification Model Testing\n");
  
  const testConfigurations = [
    { strategy: 'zero-shot', model: 'roberta-large-mnli' },
    { strategy: 'zero-shot', model: 'distilbert-base-uncased-mnli' },
    { strategy: 'zero-shot', model: 'microsoft/deberta-v3-large' },
    { strategy: 'zero-shot', model: 'facebook/bart-large-mnli' }
  ];
  
  const allResults = [];
  
  for (const config of testConfigurations) {
    const result = await testClassificationStrategy(config.strategy, config.model);
    if (result) {
      allResults.push(result);
    }
    
    // Wait a bit between tests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Compare results
  console.log("\n\n🏆 COMPARISON OF ALL MODELS:");
  console.log("Model".padEnd(25) + "Accuracy".padEnd(10) + "Studying".padEnd(10) + "Idle");
  console.log("-".repeat(55));
  
  allResults.sort((a, b) => b.accuracy - a.accuracy);
  
  for (const result of allResults) {
    const modelName = result.model.replace('microsoft/', '').replace('facebook/', '');
    console.log(
      modelName.padEnd(25) + 
      `${result.accuracy}%`.padEnd(10) + 
      `${result.studyingAccuracy}%`.padEnd(10) + 
      `${result.idleAccuracy}%`
    );
  }
  
  console.log("\n✨ Testing complete!");
}

// Test with different topics
async function testDifferentTopics() {
  console.log("\n🎯 Testing different topic configurations:");
  
  const topics = [
    'computer science',
    'programming',
    'studying',
    'academic content',
    'learning material'
  ];
  
  for (const topic of topics) {
    console.log(`\n--- Testing topic: "${topic}" ---`);
    await testClassificationStrategy('zero-shot', 'roberta-large-mnli', topic);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Run the tests
if (require.main === module) {
  runAllTests()
    .then(() => testDifferentTopics())
    .catch(console.error);
}

module.exports = { testClassificationStrategy, testScenarios };