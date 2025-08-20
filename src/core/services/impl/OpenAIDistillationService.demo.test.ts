/**
 * Demo test for multi-concept extraction with real study content
 * Run with: npm test -- OpenAIDistillationService.demo.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIDistillationService } from './OpenAIDistillationService';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { loadOpenAIConfig } from '../../config/OpenAIConfig';
import { Batch } from '../../contracts/schemas';

// Simple test cache
class TestCache {
  private cache = new Map<string, any>();
  async get(key: string) { return this.cache.get(key) || null; }
  async set(key: string, value: any, ttl?: number) { this.cache.set(key, value); }
  async has(key: string) { return this.cache.has(key); }
  async delete(key: string) { return this.cache.delete(key); }
  async clear() { this.cache.clear(); }
  async size() { return this.cache.size; }
}

describe('Multi-Concept Extraction Demo', () => {
  let service: OpenAIDistillationService;

  beforeAll(() => {
    const config = loadOpenAIConfig();
    const cache = new TestCache();
    service = new OpenAIDistillationService(config, cache);
  });

  it('should extract multiple concepts from computer science content', async () => {
    const computerScienceText = `
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
    `;

    const testBatch: Batch = {
      batchId: 'demo-cs-batch',
      window: 'Computer Science Study Session',
      topic: 'Programming Fundamentals',
      entries: [{ text: computerScienceText, timestamp: new Date() }],
      createdAt: new Date()
    };

    console.log('\n[DEMO] Testing Computer Science Multi-Concept Extraction');
    console.log('='.repeat(60));

    const candidateRaw = new ConceptCandidate(testBatch, computerScienceText, 0);
    const candidate = candidateRaw.normalize();

    console.log(`[INFO] Input text length: ${computerScienceText.length} characters`);

    // Test single concept
    console.log('\n[EXTRACT] Single Concept Result:');
    const singleResult = await service.distill(candidate);
    console.log(`   Title: ${singleResult.title}`);
    console.log(`   Summary: ${singleResult.summary.substring(0, 100)}...`);

    // Test multi-concept
    console.log('\n[EXTRACT] Multi-Concept Results:');
    const multiResult = await service.distillMultiple(candidate);
    console.log(`   Total concepts found: ${multiResult.totalConcepts}`);
    
    multiResult.concepts.forEach((concept, i) => {
      console.log(`   ${i + 1}. ${concept.title}`);
      console.log(`      Summary: ${concept.summary.substring(0, 80)}...`);
      if (concept.relevanceScore) {
        console.log(`      Relevance: ${concept.relevanceScore}`);
      }
    });

    // Validate results
    expect(multiResult.concepts.length).toBeGreaterThan(1);
    expect(multiResult.concepts.length).toBeLessThanOrEqual(5);
    expect(multiResult.totalConcepts).toBe(multiResult.concepts.length);
    
    // Should find OOP, Data Structures, and Algorithms
    const titles = multiResult.concepts.map(c => c.title.toLowerCase());
    expect(titles.some(title => title.includes('object') || title.includes('oop'))).toBe(true);
    
    console.log('\n[SUCCESS] Computer Science test completed successfully!');
  }, 30000);

  it('should extract multiple concepts from biology content', async () => {
    const biologyText = `
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
    `;

    const testBatch: Batch = {
      batchId: 'demo-bio-batch',
      window: 'Biology Study Session',
      topic: 'Cell Biology',
      entries: [{ text: biologyText, timestamp: new Date() }],
      createdAt: new Date()
    };

    console.log('\n[DEMO] Testing Biology Multi-Concept Extraction');
    console.log('='.repeat(60));

    const candidateRaw = new ConceptCandidate(testBatch, biologyText, 0);
    const candidate = candidateRaw.normalize();

    console.log(`[INFO] Input text length: ${biologyText.length} characters`);

    // Test multi-concept
    console.log('\n[EXTRACT] Multi-Concept Results:');
    const multiResult = await service.distillMultiple(candidate);
    console.log(`   Total concepts found: ${multiResult.totalConcepts}`);
    
    multiResult.concepts.forEach((concept, i) => {
      console.log(`   ${i + 1}. ${concept.title}`);
      console.log(`      Summary: ${concept.summary.substring(0, 80)}...`);
      if (concept.relevanceScore) {
        console.log(`      Relevance: ${concept.relevanceScore}`);
      }
    });

    // Validate results
    expect(multiResult.concepts.length).toBeGreaterThan(1);
    expect(multiResult.concepts.length).toBeLessThanOrEqual(5);
    
    // Should find Photosynthesis, Cell Division, and DNA Replication
    const titles = multiResult.concepts.map(c => c.title.toLowerCase());
    expect(titles.some(title => title.includes('photo') || title.includes('synthesis'))).toBe(true);
    
    console.log('\n[SUCCESS] Biology test completed successfully!');
  }, 30000);

  it('should filter non-educational content from mixed text', async () => {
    const mixedText = `
      Check out our amazing summer sale! 50% off all electronics!

      Machine Learning is a subset of artificial intelligence that enables computers to learn and 
      make decisions from data without being explicitly programmed. Common types include supervised 
      learning (using labeled data), unsupervised learning (finding patterns in unlabeled data), 
      and reinforcement learning (learning through trial and error).

      Free shipping on orders over $50! Limited time offer!

      Neural Networks are computing systems inspired by biological neural networks. They consist 
      of interconnected nodes (neurons) organized in layers. Deep learning uses neural networks 
      with multiple hidden layers to learn complex patterns from large amounts of data.

      Don't miss out - shop now before this deal expires!
    `;

    const testBatch: Batch = {
      batchId: 'demo-mixed-batch',
      window: 'Mixed Content Test',
      topic: 'Content Filtering Demo',
      entries: [{ text: mixedText, timestamp: new Date() }],
      createdAt: new Date()
    };

    console.log('\n[DEMO] Testing Mixed Content Filtering');
    console.log('='.repeat(60));

    const candidateRaw = new ConceptCandidate(testBatch, mixedText, 0);
    const candidate = candidateRaw.normalize();

    console.log(`[INFO] Input text length: ${mixedText.length} characters`);

    // Test multi-concept (should extract only educational content)
    console.log('\n[EXTRACT] Multi-Concept Results (should filter out promotional content):');
    const multiResult = await service.distillMultiple(candidate);
    console.log(`   Total concepts found: ${multiResult.totalConcepts}`);
    
    multiResult.concepts.forEach((concept, i) => {
      console.log(`   ${i + 1}. ${concept.title}`);
      console.log(`      Summary: ${concept.summary.substring(0, 80)}...`);
      if (concept.relevanceScore) {
        console.log(`      Relevance: ${concept.relevanceScore}`);
      }
    });

    // Validate results - should extract ML and Neural Networks, but filter out sales content
    expect(multiResult.concepts.length).toBeGreaterThan(0);
    expect(multiResult.concepts.length).toBeLessThanOrEqual(5);
    
    // Should find Machine Learning and Neural Networks concepts
    const titles = multiResult.concepts.map(c => c.title.toLowerCase());
    const summaries = multiResult.concepts.map(c => c.summary.toLowerCase());
    
    expect(titles.some(title => title.includes('machine') || title.includes('learning'))).toBe(true);
    
    // Should NOT contain promotional content
    const allText = (titles.join(' ') + ' ' + summaries.join(' ')).toLowerCase();
    expect(allText.includes('sale') || allText.includes('shipping') || allText.includes('discount')).toBe(false);
    
    console.log('\n[SUCCESS] Content filtering test completed successfully!');
  }, 30000);

  it('should show API usage statistics', async () => {
    console.log('\n[STATS] API Usage Statistics:');
    console.log('='.repeat(30));
    console.log(`   Total requests made: ${service.getRequestCount()}`);
    console.log(`   Provider: ${service.getProvider()}`);
    console.log(`   Cache size: ${await (service as any).contentCache.size()}`);
    
    expect(service.getRequestCount()).toBeGreaterThan(0);
    expect(service.getProvider()).toBe('openai');
  });
});