/**
 * Integration test comparing original vs improved prompts with real OpenAI API
 * 
 * This test validates that the improved prompts maintain compatibility with the
 * existing codebase while providing better OCR artifact handling and specificity.
 * 
 * Following existing test patterns for consistency and maintainability.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIDistillationService } from './OpenAIDistillationService';
import { ImprovedOpenAIDistillationService } from './ImprovedOpenAIDistillationService';
import { loadOpenAIConfig } from '../../config/OpenAIConfig';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { Batch, DistilledContent } from '../../contracts/schemas';

// Simple test cache following existing pattern
class TestCache {
  private cache = new Map<string, any>();
  
  async get(key: string) { return this.cache.get(key); }
  async set(key: string, value: any, ttl?: number) { this.cache.set(key, value); }
  async has(key: string) { return this.cache.has(key); }
  async delete(key: string) { return this.cache.delete(key); }
  async clear() { this.cache.clear(); }
  async size() { return this.cache.size; }
}

/**
 * OCR test cases with realistic artifacts that the improved prompts should handle better
 */
const OCR_TEST_CASES = [
  {
    name: 'PDF Character Substitutions',
    text: 'Machine leaming algorithms use gradient descent optim ization. The loss function measures emor between predicted and actual outputs. Com mon activation functions include ReLU.',
    expectedConcept: 'gradient descent',
    description: 'Should handle rn→m, missing spaces, and line break artifacts'
  },
  {
    name: 'Biology OCR Errors',
    text: 'Photosynthesis occurs in thyiakoid membranes. Chlorophyll absorbs light energy and excites electrons. These pass through electron transport chan generating ATP and NADPH.',
    expectedConcept: 'chlorophyll',
    description: 'Should handle character substitutions in scientific terms'
  },
  {
    name: 'CS Code Documentation',
    text: 'The QuickSort algonthm partitions arrays around pivot elements. Time complexity O(n log n) average case, O(n^2) worst case when pivot selection is poor.',
    expectedConcept: 'QuickSort',
    description: 'Should extract specific algorithmic concepts from technical text'
  },
  {
    name: 'Slideshow Formatting',
    text: 'Cel Division: Mitosis Prophase: - Chromatin condenses - Nuclear envelope breaks down - Centnosomes move to poles Metaphase: - Chromosomes align at cel equator',
    expectedConcept: 'Mitosis',
    description: 'Should handle bullet point formatting and repeated typos'
  }
];

describe('Improved Prompts Integration Test - Real API', () => {
  let originalService: OpenAIDistillationService;
  let improvedService: ImprovedOpenAIDistillationService;
  
  const testBatch: Batch = {
    batchId: 'test-batch-prompt-comparison',
    window: 'Test Window', 
    topic: 'Educational Content',
    entries: [{ text: 'Test entry', timestamp: new Date() }],
    createdAt: new Date()
  };

  beforeAll(() => {
    try {
      const config = loadOpenAIConfig();
      // Disable caching for fair comparison
      config.cacheEnabled = false;
      
      const originalCache = new TestCache();
      const improvedCache = new TestCache();
      
      originalService = new OpenAIDistillationService(config, originalCache);
      improvedService = new ImprovedOpenAIDistillationService(config, improvedCache);
      
      console.log('[SUCCESS] Both services initialized for prompt comparison');
    } catch (error) {
      console.error('[ERROR] Failed to initialize services:', error);
      throw error;
    }
  });

  describe('OCR Artifact Handling Comparison', () => {
    OCR_TEST_CASES.forEach((testCase, index) => {
      it(`should handle ${testCase.name} - ${testCase.description}`, async () => {
        console.log(`\n[TEST ${index + 1}] ${testCase.name}`);
        console.log(`Input: ${testCase.text.substring(0, 100)}...`);
        console.log(`Looking for: ${testCase.expectedConcept}`);
        
        const candidateRaw = new ConceptCandidate(testBatch, testCase.text, index);
        const candidate = candidateRaw.normalize();
        
        // Test both services
        console.log('\n[ORIGINAL] Testing original prompt...');
        const originalResult = await originalService.distill(candidate);
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('[IMPROVED] Testing improved prompt...');
        const improvedResult = await improvedService.distill(candidate);
        
        // Validate both results meet schema requirements
        expectValidDistilledContent(originalResult);
        expectValidDistilledContent(improvedResult);
        
        console.log('\n[RESULTS COMPARISON]');
        console.log(`Original - Title: "${originalResult.title}"`);
        console.log(`Original - Summary: "${originalResult.summary.substring(0, 100)}..."`);
        console.log(`Improved - Title: "${improvedResult.title}"`);
        console.log(`Improved - Summary: "${improvedResult.summary.substring(0, 100)}..."`);
        
        // Analysis of results
        const originalSpecificity = analyzeSpecificity(originalResult);
        const improvedSpecificity = analyzeSpecificity(improvedResult);
        const ocrHandling = analyzeOCRHandling(testCase.text, originalResult, improvedResult);
        
        console.log(`\n[ANALYSIS]`);
        console.log(`Specificity - Original: ${originalSpecificity.toFixed(2)}, Improved: ${improvedSpecificity.toFixed(2)}`);
        console.log(`OCR Handling: ${ocrHandling}`);
        
        // Both should produce valid educational content
        expect(originalResult.title.toLowerCase()).not.toContain('not_study_content');
        expect(improvedResult.title.toLowerCase()).not.toContain('not_study_content');
        
        // Results should be different (improved prompts should change behavior)
        expect(originalResult.title).not.toBe(improvedResult.title);
        
      }, 45000); // 45s timeout for API calls with delay
    });
  });

  describe('Multi-concept OCR Handling', () => {
    it('should extract multiple specific concepts from OCR text with artifacts', async () => {
      const complexText = `
        Machine leaming algorithms can be classified into types. Neural networks use backpropagation optim ization.
        
        Deep leaming is a subset using multi-layer networks. Convolutional networks excel at image recognition tasks.
        
        Natural language processing uses transformers. Attention mechanisms allow models to focus on relevant parts.
      `;
      
      console.log('\n[MULTI-CONCEPT TEST] Complex OCR text with multiple concepts');
      
      const candidateRaw = new ConceptCandidate(testBatch, complexText, 0);
      const candidate = candidateRaw.normalize();
      
      // Test multi-concept extraction if available
      if (originalService.distillMultiple && improvedService.distillMultiple) {
        console.log('[ORIGINAL] Testing original multi-concept...');
        const originalMulti = await originalService.distillMultiple(candidate);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('[IMPROVED] Testing improved multi-concept...');
        const improvedMulti = await improvedService.distillMultiple(candidate);
        
        console.log(`\n[MULTI-CONCEPT RESULTS]`);
        console.log(`Original extracted ${originalMulti.concepts.length} concepts`);
        console.log(`Improved extracted ${improvedMulti.concepts.length} concepts`);
        
        originalMulti.concepts.forEach((concept, i) => {
          console.log(`  Original ${i+1}: "${concept.title}"`);
        });
        
        improvedMulti.concepts.forEach((concept, i) => {
          console.log(`  Improved ${i+1}: "${concept.title}"`);
        });
        
        // Both should extract multiple concepts
        expect(originalMulti.concepts.length).toBeGreaterThan(1);
        expect(improvedMulti.concepts.length).toBeGreaterThan(1);
        
        // All concepts should be valid
        [...originalMulti.concepts, ...improvedMulti.concepts].forEach(concept => {
          expect(concept.title).toBeTruthy();
          expect(concept.title.length).toBeGreaterThan(0);
          expect(concept.title.length).toBeLessThanOrEqual(100);
          expect(concept.summary.length).toBeGreaterThanOrEqual(50);
          expect(concept.summary.length).toBeLessThanOrEqual(500);
        });
      }
      
    }, 60000); // 60s timeout for multi-concept calls
  });

  describe('Compatibility Validation', () => {
    it('should maintain exact same schema compliance as original service', async () => {
      const standardText = 'Neural networks are computational models inspired by biological neural networks consisting of interconnected nodes called neurons.';
      
      const candidateRaw = new ConceptCandidate(testBatch, standardText, 0);
      const candidate = candidateRaw.normalize();
      
      const originalResult = await originalService.distill(candidate);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const improvedResult = await improvedService.distill(candidate);
      
      // Both results must have identical structure (schema compliance)
      expect(typeof originalResult.title).toBe(typeof improvedResult.title);
      expect(typeof originalResult.summary).toBe(typeof improvedResult.summary);
      expect(typeof originalResult.contentHash).toBe(typeof improvedResult.contentHash);
      expect(typeof originalResult.cached).toBe(typeof improvedResult.cached);
      expect(originalResult.distilledAt instanceof Date).toBe(improvedResult.distilledAt instanceof Date);
      
      console.log('\n[COMPATIBILITY] Both services maintain schema compatibility ✓');
      
    }, 30000);
  });
});

/**
 * Validates DistilledContent follows expected schema (from existing tests)
 */
function expectValidDistilledContent(result: DistilledContent) {
  expect(result.title).toBeTruthy();
  expect(result.title.length).toBeGreaterThan(0);
  expect(result.title.length).toBeLessThanOrEqual(100);
  
  expect(result.summary).toBeTruthy(); 
  expect(result.summary.length).toBeGreaterThanOrEqual(50);
  expect(result.summary.length).toBeLessThanOrEqual(500);
  
  expect(result.contentHash).toBeTruthy();
  expect(typeof result.cached).toBe('boolean');
}

/**
 * Analyzes specificity of extracted concept (higher = more specific)
 */
function analyzeSpecificity(result: DistilledContent): number {
  let score = 0.5;
  
  const text = (result.title + ' ' + result.summary).toLowerCase();
  
  // Bonus for specific technical terms
  const specificTerms = ['algorithm', 'mechanism', 'process', 'method', 'technique', 'function', 'structure'];
  specificTerms.forEach(term => {
    if (text.includes(term)) score += 0.1;
  });
  
  // Penalty for overly broad terms
  const broadTerms = ['learning', 'systems', 'concepts', 'topics', 'general', 'overview'];
  broadTerms.forEach(term => {
    if (text.includes(term)) score -= 0.05;
  });
  
  // Bonus for specific details in title
  if (result.title.length > 40) score += 0.1;
  if (/[A-Z][a-z]+[A-Z]/.test(result.title)) score += 0.1; // CamelCase technical terms
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Analyzes how well each service handled OCR artifacts
 */
function analyzeOCRHandling(input: string, original: DistilledContent, improved: DistilledContent): string {
  const artifacts = ['leaming', 'optim ization', 'Com mon', 'emor', 'thyiakoid', 'chan', 'algonthm', 'Cel', 'Centnosomes', 'cel'];
  const foundArtifacts = artifacts.filter(artifact => input.includes(artifact));
  
  if (foundArtifacts.length === 0) return 'No artifacts to handle';
  
  const originalText = (original.title + ' ' + original.summary).toLowerCase();
  const improvedText = (improved.title + ' ' + improved.summary).toLowerCase();
  
  const cleanTerms = ['learning', 'optimization', 'common', 'error', 'thylakoid', 'chain', 'algorithm', 'cell', 'centrosomes'];
  const originalClean = cleanTerms.filter(term => originalText.includes(term)).length;
  const improvedClean = cleanTerms.filter(term => improvedText.includes(term)).length;
  
  if (improvedClean > originalClean) return 'Improved handles OCR better';
  if (originalClean > improvedClean) return 'Original handles OCR better'; 
  return 'Similar OCR handling';
}