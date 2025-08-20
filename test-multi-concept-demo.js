/**
 * Demo script to test multi-concept extraction with real study content
 */

import { OpenAIDistillationService } from './src/core/services/impl/OpenAIDistillationService.js';
import { ConceptCandidate } from './src/core/domain/ConceptCandidate.js';
import { loadOpenAIConfig } from './src/core/config/OpenAIConfig.js';

// Simple in-memory cache for demo
class DemoCache {
  constructor() { this.cache = new Map(); }
  async get(key) { return this.cache.get(key) || null; }
  async set(key, value, ttl) { this.cache.set(key, value); }
  async has(key) { return this.cache.has(key); }
  async delete(key) { return this.cache.delete(key); }
  async clear() { this.cache.clear(); }
  async size() { return this.cache.size; }
}

// Real study content examples
const studyContent = {
  // Example 1: Computer Science concepts
  computerScience: `
    Object-Oriented Programming (OOP) is a programming paradigm based on the concept of objects, 
    which can contain data and code. The main principles of OOP include encapsulation, inheritance, 
    and polymorphism. Encapsulation refers to bundling data and methods that work on that data 
    within one unit, like a class.

    Data Structures are ways of organizing and storing data so that they can be used efficiently. 
    Common data structures include arrays, linked lists, stacks, queues, trees, and hash tables. 
    Each structure has its own advantages and is suited for different types of operations.

    Algorithms are step-by-step procedures for solving problems or performing tasks. Algorithm 
    complexity is measured using Big O notation, which describes how the runtime or space 
    requirements grow as the input size increases. Common complexities include O(1), O(log n), 
    O(n), and O(n²).
  `,

  // Example 2: Biology concepts  
  biology: `
    Photosynthesis is the process by which plants convert light energy, usually from the sun, 
    into chemical energy stored in glucose. This process occurs in the chloroplasts and involves 
    two main stages: the light-dependent reactions and the Calvin cycle. The overall equation 
    is 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂.

    Cell division is the process by which a single cell divides to form two or more daughter cells. 
    There are two main types: mitosis (for growth and repair) and meiosis (for sexual reproduction). 
    Mitosis produces two identical diploid cells, while meiosis produces four genetically different 
    haploid gametes.

    DNA replication is the process of making an identical copy of DNA. It occurs during the S phase 
    of the cell cycle and is essential for cell division. The process is semi-conservative, meaning 
    each new DNA molecule consists of one original strand and one newly synthesized strand.
  `,

  // Example 3: Mixed content (should extract only educational parts)
  mixed: `
    Check out our amazing summer sale! 50% off all electronics!

    Machine Learning is a subset of artificial intelligence that enables computers to learn and 
    make decisions from data without being explicitly programmed. Common types include supervised 
    learning (using labeled data), unsupervised learning (finding patterns in unlabeled data), 
    and reinforcement learning (learning through trial and error).

    Free shipping on orders over $50! Limited time offer!

    Neural Networks are computing systems inspired by biological neural networks. They consist 
    of interconnected nodes (neurons) organized in layers. Deep learning uses neural networks 
    with multiple hidden layers to learn complex patterns from large amounts of data.
  `
};

async function testMultiConceptExtraction() {
  console.log('🚀 Testing Multi-Concept Extraction System\n');

  try {
    // Initialize the service
    const config = loadOpenAIConfig();
    const cache = new DemoCache();
    const service = new OpenAIDistillationService(config, cache);

    console.log('✅ Service initialized successfully\n');

    // Test each content type
    for (const [contentType, text] of Object.entries(studyContent)) {
      console.log(`📚 Testing ${contentType.toUpperCase()} content:`);
      console.log('─'.repeat(50));

      try {
        // Create test batch
        const testBatch = {
          batchId: `demo-${contentType}-${Date.now()}`,
          window: 'Demo Test',
          topic: contentType,
          entries: [{ text, timestamp: new Date() }],
          createdAt: new Date()
        };

        // Create candidate and normalize
        const candidateRaw = new ConceptCandidate(testBatch, text, 0);
        const candidate = candidateRaw.normalize();

        console.log(`📝 Input text length: ${text.length} characters`);

        // Test single concept extraction
        console.log('\n🔍 Single Concept Extraction:');
        const singleResult = await service.distill(candidate);
        console.log(`   Title: ${singleResult.title}`);
        console.log(`   Summary: ${singleResult.summary.substring(0, 100)}...`);
        console.log(`   Cached: ${singleResult.cached}`);

        // Test multi-concept extraction
        console.log('\n🔍 Multi-Concept Extraction:');
        const multiResult = await service.distillMultiple(candidate);
        console.log(`   Total concepts found: ${multiResult.totalConcepts}`);
        
        multiResult.concepts.forEach((concept, i) => {
          console.log(`   ${i + 1}. ${concept.title}`);
          console.log(`      Summary: ${concept.summary.substring(0, 80)}...`);
          if (concept.relevanceScore) {
            console.log(`      Relevance: ${concept.relevanceScore}`);
          }
        });

        console.log(`   Source hash: ${multiResult.sourceContentHash.substring(0, 8)}...`);
        console.log(`   Cached: ${multiResult.cached}`);

      } catch (error) {
        console.log(`❌ Error processing ${contentType}: ${error.message}`);
      }

      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Test API usage tracking
    console.log('📊 API Usage Statistics:');
    console.log(`   Total requests made: ${service.getRequestCount()}`);
    console.log(`   Provider: ${service.getProvider()}`);

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

// Run the demo
testMultiConceptExtraction().catch(console.error);