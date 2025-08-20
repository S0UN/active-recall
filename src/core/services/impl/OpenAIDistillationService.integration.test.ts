/**
 * Integration test for OpenAIDistillationService with real API
 * 
 * This test uses the actual OpenAI API to verify the implementation works correctly.
 * It should only be run locally with a valid API key in the .env file.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIDistillationService } from './OpenAIDistillationService';
import { loadOpenAIConfig } from '../../config/OpenAIConfig';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { Batch } from '../../contracts/schemas';

// Simple in-memory cache for testing
class TestCache {
  private cache = new Map<string, any>();
  
  async get(key: string) {
    return this.cache.get(key);
  }
  
  async set(key: string, value: any, ttl?: number) {
    this.cache.set(key, value);
  }
  
  async has(key: string) {
    return this.cache.has(key);
  }
  
  async delete(key: string) {
    return this.cache.delete(key);
  }
  
  async clear() {
    this.cache.clear();
  }
  
  async size() {
    return this.cache.size;
  }
}

describe('OpenAIDistillationService - Real API Integration', () => {
  let service: OpenAIDistillationService;
  
  // Create a test batch
  const testBatch: Batch = {
    batchId: 'test-batch-123',
    window: 'Test Window',
    topic: 'Computer Science',
    entries: [{
      text: 'Test entry',
      timestamp: new Date(),
    }],
    createdAt: new Date()
  };

  beforeAll(() => {
    try {
      const config = loadOpenAIConfig();
      const cache = new TestCache();
      service = new OpenAIDistillationService(config, cache);
      console.log('[SUCCESS] OpenAI service initialized successfully');
    } catch (error) {
      console.error('[ERROR] Failed to initialize OpenAI service:', error);
      throw error;
    }
  });

  describe('Single concept extraction', () => {
    it('should extract a single concept from educational text', async () => {
      const text = `Neural networks are computational models inspired by biological neural networks. 
                    They consist of interconnected nodes called neurons that process information 
                    using connectionist approaches to computation.`;
      
      const candidateRaw = new ConceptCandidate(testBatch, text, 0);
      const candidate = candidateRaw.normalize();
      
      console.log('[TESTING] Testing single concept extraction...');
      const result = await service.distill(candidate);
      
      console.log('[RESULT] Single concept result:');
      console.log('  Title:', result.title);
      console.log('  Summary:', result.summary);
      
      expect(result.title).toBeTruthy();
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.title.length).toBeLessThanOrEqual(100);
      
      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThanOrEqual(50);
      expect(result.summary.length).toBeLessThanOrEqual(500);
      
      expect(result.contentHash).toBe(candidate.contentHash);
    }, 30000); // 30 second timeout for API call
  });

  describe('Multi-concept extraction', () => {
    it('should extract multiple concepts from a longer text', async () => {
      const text = `
        Machine learning is a subset of artificial intelligence that enables systems to learn 
        and improve from experience without being explicitly programmed. It focuses on developing 
        computer programs that can access data and use it to learn for themselves.
        
        Deep learning is a specialized form of machine learning that uses neural networks with 
        multiple layers. These deep neural networks attempt to simulate the behavior of the human 
        brain, allowing it to learn from large amounts of data.
        
        Natural language processing (NLP) is a branch of AI that helps computers understand, 
        interpret and manipulate human language. NLP draws from many disciplines including 
        computer science and computational linguistics.
      `;
      
      const candidateRaw = new ConceptCandidate(testBatch, text, 0);
      const candidate = candidateRaw.normalize();
      
      console.log('[TESTING] Testing multi-concept extraction...');
      const result = await service.distillMultiple!(candidate);
      
      console.log('[RESULT] Multi-concept results:');
      console.log(`  Found ${result.totalConcepts} concepts:`);
      result.concepts.forEach((concept, i) => {
        console.log(`  ${i + 1}. ${concept.title}`);
        console.log(`     Summary: ${concept.summary.substring(0, 100)}...`);
        if (concept.relevanceScore) {
          console.log(`     Relevance: ${concept.relevanceScore}`);
        }
      });
      
      expect(result.concepts).toBeDefined();
      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.concepts.length).toBeLessThanOrEqual(5);
      
      // Should extract at least 2 concepts from this text
      expect(result.concepts.length).toBeGreaterThanOrEqual(2);
      
      // Check each concept
      result.concepts.forEach(concept => {
        expect(concept.title).toBeTruthy();
        expect(concept.title.length).toBeLessThanOrEqual(100);
        expect(concept.summary).toBeTruthy();
        expect(concept.summary.length).toBeGreaterThanOrEqual(50);
        expect(concept.summary.length).toBeLessThanOrEqual(500);
      });
      
      expect(result.totalConcepts).toBe(result.concepts.length);
      expect(result.sourceContentHash).toBe(candidate.contentHash);
    }, 30000); // 30 second timeout for API call
  });

  describe('Non-educational content filtering', () => {
    it('should reject non-educational content', async () => {
      const text = `Check out our amazing deals on electronics! 
                    Free shipping on orders over $50. 
                    Limited time offer - buy now!`;
      
      const candidateRaw = new ConceptCandidate(testBatch, text, 0);
      const candidate = candidateRaw.normalize();
      
      console.log('[TESTING] Testing non-educational content filtering...');
      
      await expect(service.distill(candidate)).rejects.toThrow('study-related');
      console.log('[SUCCESS] Non-educational content correctly rejected');
    }, 30000);
  });

  describe('API configuration', () => {
    it('should be using the correct model from config', () => {
      const provider = service.getProvider();
      expect(provider).toBe('openai');
      console.log('[SUCCESS] Using provider:', provider);
    });
    
    it('should track API request count', async () => {
      const initialCount = service.getRequestCount();
      console.log('[STATS] Initial request count:', initialCount);
      
      const text = 'Simple test concept for counting requests.';
      const candidateRaw = new ConceptCandidate(testBatch, text, 0);
      const candidate = candidateRaw.normalize();
      
      await service.distill(candidate);
      
      const newCount = service.getRequestCount();
      console.log('[STATS] New request count:', newCount);
      
      expect(newCount).toBe(initialCount + 1);
    }, 30000);
  });
});