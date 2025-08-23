/**
 * Test Suite for ImprovedOpenAIDistillationService
 * 
 * Comprehensive tests ensuring the improved service maintains full compatibility
 * with the original OpenAIDistillationService while providing enhanced OCR handling
 * and concept specificity.
 * 
 * Test Structure:
 * - Basic functionality tests (compatibility with original)
 * - OCR-specific improvement tests
 * - Multi-concept extraction tests
 * - Error handling and validation tests
 * - Performance and configuration tests
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import OpenAI from 'openai';
import { ImprovedOpenAIDistillationService } from './ImprovedOpenAIDistillationService';
import { 
  ConceptCandidate, 
  DistilledContent, 
  MultiConceptDistillation 
} from '../../contracts/schemas';
import { 
  DistillationConfig, 
  DistillationError, 
  DistillationQuotaError 
} from '../IDistillationService';
import { IContentCache } from '../IContentCache';

// =============================================================================
// TEST UTILITIES AND MOCKS
// =============================================================================

vi.mock('openai');

/**
 * Create a mock content cache for testing
 */
function createMockCache(): IContentCache {
  return {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    size: vi.fn()
  };
}

/**
 * Create a test ConceptCandidate with default values
 */
function createTestCandidate(
  text: string = 'Neural networks are computational models inspired by biological neural networks.',
  overrides: Partial<ConceptCandidate> = {}
): ConceptCandidate {
  const defaultCandidate = {
    candidateId: 'test-candidate-123',
    batchId: 'test-batch-456',
    index: 0,
    rawText: text,
    normalizedText: text.toLowerCase(),
    contentHash: 'test-hash-789',
    source: {
      window: 'Test Window',
      topic: 'AI Learning',
      batchId: 'test-batch-456',
      entryCount: 1
    },
    createdAt: new Date()
  };
  
  return {
    normalize: () => ({ ...defaultCandidate, ...overrides }),
    ...defaultCandidate,
    ...overrides
  } as unknown as ConceptCandidate;
}

/**
 * Create a test DistillationConfig with defaults
 */
function createTestConfig(overrides: Partial<DistillationConfig> = {}): DistillationConfig {
  return {
    provider: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-3.5-turbo',
    maxTokens: 200,
    temperature: 0.1,
    cacheEnabled: true,
    multiConceptEnabled: true,
    maxConceptsPerDistillation: 5,
    ...overrides
  };
}

/**
 * Create a mock OpenAI API response for single concept
 */
function createSingleConceptResponse(title: string, summary: string) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({ title, summary })
      }
    }]
  };
}

/**
 * Create a mock OpenAI API response for multiple concepts
 */
function createMultiConceptResponse(
  concepts: Array<{ title: string; summary: string; relevanceScore?: number }>
) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({ concepts })
      }
    }]
  };
}

/**
 * Validate that a DistilledContent object meets schema requirements
 */
function expectValidDistilledContent(
  result: DistilledContent, 
  expectedTitle?: string
): void {
  // Title validation
  expect(result.title).toBeTruthy();
  expect(result.title.length).toBeGreaterThan(0);
  expect(result.title.length).toBeLessThanOrEqual(100);
  
  // Summary validation
  expect(result.summary).toBeTruthy();
  expect(result.summary.length).toBeGreaterThanOrEqual(50);
  expect(result.summary.length).toBeLessThanOrEqual(500);
  
  // Metadata validation
  expect(result.contentHash).toBeTruthy();
  expect(typeof result.cached).toBe('boolean');
  expect(result.distilledAt).toBeInstanceOf(Date);
  
  // Optional title check
  if (expectedTitle) {
    expect(result.title).toBe(expectedTitle);
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('ImprovedOpenAIDistillationService', () => {
  let service: ImprovedOpenAIDistillationService;
  let mockCache: IContentCache;
  let mockOpenAIClient: any;
  let mockCreate: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mocks
    mockCache = createMockCache();
    mockCreate = vi.fn();
    mockOpenAIClient = {
      chat: {
        completions: {
          create: mockCreate
        }
      }
    };
    
    (OpenAI as unknown as Mock).mockImplementation(() => mockOpenAIClient);
    
    // Create service instance
    service = new ImprovedOpenAIDistillationService(
      createTestConfig(), 
      mockCache
    );
  });

  // =========================================================================
  // BASIC FUNCTIONALITY TESTS (Compatibility with Original)
  // =========================================================================

  describe('Basic Functionality', () => {
    it('should extract title and summary from educational text', async () => {
      const candidate = createTestCandidate();
      const expectedTitle = 'Neural Networks';
      const expectedSummary = 'Neural networks are computational models inspired by biological neural networks used for machine learning applications.';

      mockCreate.mockResolvedValueOnce(
        createSingleConceptResponse(expectedTitle, expectedSummary)
      );
      
      const result = await service.distill(candidate);
      
      expectValidDistilledContent(result, expectedTitle);
      expect(result.summary).toBe(expectedSummary);
      expect(result.contentHash).toBe(candidate.contentHash);
    });

    it('should return cached result when available', async () => {
      const candidate = createTestCandidate();
      const cachedResult: DistilledContent = {
        title: 'Cached Title',
        summary: 'This is a cached summary that meets the minimum length requirement for validation.',
        contentHash: 'test-hash-789',
        cached: false,
        distilledAt: new Date()
      };

      (mockCache.get as Mock).mockResolvedValueOnce(cachedResult);

      const result = await service.distill(candidate);

      expect(result.title).toBe(cachedResult.title);
      expect(result.cached).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject non-study content', async () => {
      const candidate = createTestCandidate('Shopping cart checkout process');
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'NOT_STUDY_CONTENT',
              summary: 'NOT_STUDY_CONTENT'
            })
          }
        }]
      });

      await expect(service.distill(candidate))
        .rejects.toThrow('Content is not study-related');
    });

    it('should handle API quota limits', async () => {
      const candidate = createTestCandidate();
      
      // Set request count to limit
      for (let i = 0; i < 1000; i++) {
        (service as any).requestCount++;
      }

      await expect(service.distill(candidate))
        .rejects.toThrow(DistillationQuotaError);
    });

    it('should use fallback extraction on JSON parse error', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      });

      const result = await service.distill(candidate);

      expect(result.title).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThanOrEqual(50);
    });
  });

  // =========================================================================
  // OCR-SPECIFIC IMPROVEMENT TESTS
  // =========================================================================

  describe('OCR Artifact Handling', () => {
    it('should handle character substitution errors', async () => {
      const ocrText = 'Machine leaming algorithms use gradient descent optim ization. Neural networks process infonnation.';
      const candidate = createTestCandidate(ocrText);
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        'Gradient Descent Optimization Algorithm',
        'Gradient descent is an iterative optimization algorithm used to minimize loss functions in machine learning by updating parameters in the direction of steepest descent.'
      ));
      
      const result = await service.distill(candidate);
      
      expectValidDistilledContent(result);
      expect(result.title).toContain('Gradient Descent');
      expect(result.title).not.toContain('leaming'); // OCR error should not appear
    });

    it('should extract specific concepts from biology text with OCR errors', async () => {
      const ocrText = 'Photosynthesis occurs in thyiakoid membranes. Chlorophyll absorbs light and excites electrons.';
      const candidate = createTestCandidate(ocrText);
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        'Chlorophyll Light Energy Absorption in Thylakoids',
        'Chlorophyll molecules in thylakoid membranes absorb specific wavelengths of light energy and become excited, releasing electrons that initiate photosynthetic electron transport chains.'
      ));
      
      const result = await service.distill(candidate);
      
      expectValidDistilledContent(result);
      expect(result.title).toContain('Chlorophyll');
      expect(result.title).toContain('Thylakoid');
    });

    it('should handle code documentation with formatting artifacts', async () => {
      const ocrText = 'The QuickSort algonthm partitions arrays. Time complexity O(n log n) average, O(n^2) worst case.';
      const candidate = createTestCandidate(ocrText);
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        'QuickSort Time Complexity Analysis',
        'QuickSort algorithm achieves O(n log n) average-case time complexity through divide-and-conquer partitioning, but degrades to O(n²) worst-case when pivot selection is consistently poor.'
      ));
      
      const result = await service.distill(candidate);
      
      expectValidDistilledContent(result);
      expect(result.title).toContain('QuickSort');
      expect(result.summary).toContain('O(n');
    });
  });

  // =========================================================================
  // MULTI-CONCEPT EXTRACTION TESTS
  // =========================================================================

  describe('Multi-Concept Extraction', () => {
    it('should extract multiple concepts from educational text', async () => {
      const text = 'Neural networks process information. Deep learning uses multiple layers. Backpropagation trains networks.';
      const candidate = createTestCandidate(text);
      
      const concepts = [
        {
          title: 'Neural Network Information Processing',
          summary: 'Neural networks process information through interconnected nodes that transform input data using weighted connections and activation functions.',
          relevanceScore: 0.9
        },
        {
          title: 'Deep Learning Multi-Layer Architecture',
          summary: 'Deep learning employs multiple hidden layers between input and output to learn hierarchical representations of complex patterns in data.',
          relevanceScore: 0.85
        },
        {
          title: 'Backpropagation Training Algorithm',
          summary: 'Backpropagation algorithm trains neural networks by computing gradients of loss function with respect to weights using chain rule of calculus.',
          relevanceScore: 0.8
        }
      ];

      mockCreate.mockResolvedValueOnce(createMultiConceptResponse(concepts));

      const result = await service.distillMultiple(candidate);

      expect(result.concepts).toHaveLength(3);
      expect(result.totalConcepts).toBe(3);
      expect(result.sourceContentHash).toBe('test-hash-789');
      
      result.concepts.forEach(concept => {
        expect(concept.title).toBeTruthy();
        expect(concept.summary.length).toBeGreaterThanOrEqual(50);
      });
    });

    it('should filter out non-study content in multi-concept mode', async () => {
      const candidate = createTestCandidate('Mixed content');
      
      mockCreate.mockResolvedValueOnce(createMultiConceptResponse([
        {
          title: 'NOT_STUDY_CONTENT',
          summary: 'NOT_STUDY_CONTENT'
        },
        {
          title: 'Valid Learning Concept',
          summary: 'This is a valid educational concept that should be included in the results.',
          relevanceScore: 0.8
        }
      ]));

      const result = await service.distillMultiple(candidate);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].title).toBe('Valid Learning Concept');
    });

    it('should limit number of concepts to maximum', async () => {
      const candidate = createTestCandidate();
      const manyConcepts = Array.from({ length: 10 }, (_, i) => ({
        title: `Concept ${i + 1}`,
        summary: `This is concept ${i + 1} with sufficient content to meet minimum summary length requirements.`,
        relevanceScore: 0.5
      }));

      mockCreate.mockResolvedValueOnce(createMultiConceptResponse(manyConcepts));

      const result = await service.distillMultiple(candidate);

      expect(result.concepts.length).toBeLessThanOrEqual(5); // Default max
    });
  });

  // =========================================================================
  // INPUT VALIDATION TESTS
  // =========================================================================

  describe('Input Validation', () => {
    it('should reject null candidate', async () => {
      await expect(service.distill(null as any))
        .rejects.toThrow('ConceptCandidate is required');
    });

    it('should reject candidate without normalizedText', async () => {
      const invalidCandidate = {
        ...createTestCandidate(),
        normalizedText: undefined
      } as any;
      
      await expect(service.distill(invalidCandidate))
        .rejects.toThrow('ConceptCandidate must have valid normalizedText');
    });

    it('should reject empty text', async () => {
      const candidate = createTestCandidate('   ');
      await expect(service.distill(candidate))
        .rejects.toThrow('ConceptCandidate normalizedText cannot be empty');
    });

    it('should reject text that is too short', async () => {
      const candidate = createTestCandidate('short');
      await expect(service.distill(candidate))
        .rejects.toThrow('ConceptCandidate normalizedText is too short');
    });

    it('should reject malicious content', async () => {
      const candidate = createTestCandidate('DROP TABLE users; SELECT * FROM passwords;');
      await expect(service.distill(candidate))
        .rejects.toThrow('ConceptCandidate contains potentially malicious content');
    });
  });

  // =========================================================================
  // ERROR HANDLING TESTS
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle authentication errors (401)', async () => {
      const candidate = createTestCandidate();
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      
      mockCreate.mockRejectedValueOnce(authError);

      await expect(service.distill(candidate))
        .rejects.toThrow('OpenAI API authentication failed');
    });

    it('should handle quota exceeded errors (429)', async () => {
      const candidate = createTestCandidate();
      const quotaError = new Error('Quota exceeded');
      (quotaError as any).status = 429;
      (quotaError as any).code = 'insufficient_quota';
      
      mockCreate.mockRejectedValueOnce(quotaError);

      await expect(service.distill(candidate))
        .rejects.toThrow('OpenAI API quota exceeded. Please check your billing settings');
    });

    it('should handle server errors (500)', async () => {
      const candidate = createTestCandidate();
      const serverError = new Error('Internal Server Error');
      (serverError as any).status = 500;
      
      mockCreate.mockRejectedValueOnce(serverError);

      await expect(service.distill(candidate))
        .rejects.toThrow('OpenAI API server error');
    });
  });

  // =========================================================================
  // SANITIZATION TESTS
  // =========================================================================

  describe('Content Sanitization', () => {
    it('should sanitize dangerous characters in titles', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        '<script>alert("hack")</script>Neural Networks',
        'Neural networks are computational models that meet the minimum length requirement.'
      ));

      const result = await service.distill(candidate);
      
      expect(result.title).not.toContain('<script>');
      expect(result.title).not.toContain('</script>');
    });

    it('should handle HTML entities in summaries', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        'Safe Title',
        '<p>Summary with <b>HTML</b> tags and <script>malicious</script> content that needs sanitization.</p>'
      ));

      const result = await service.distill(candidate);
      
      expect(result.summary).not.toContain('<p>');
      expect(result.summary).not.toContain('<script>');
      expect(result.summary).not.toContain('</b>');
    });
  });

  // =========================================================================
  // CONFIGURATION AND METADATA TESTS
  // =========================================================================

  describe('Configuration and Metadata', () => {
    it('should identify as improved-openai provider', () => {
      expect(service.getProvider()).toBe('improved-openai');
    });

    it('should track request count correctly', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValue(createSingleConceptResponse(
        'Test',
        'Test summary that meets the minimum length requirement for validation.'
      ));

      expect(service.getRequestCount()).toBe(0);
      
      await service.distill(candidate);
      expect(service.getRequestCount()).toBe(1);
      
      await service.distill(candidate);
      expect(service.getRequestCount()).toBe(2);
    });

    it('should reset daily counter', () => {
      // Manually set count
      (service as any).requestCount = 5;
      expect(service.getRequestCount()).toBe(5);
      
      service.resetDailyCounter();
      expect(service.getRequestCount()).toBe(0);
    });

    it('should include distilledAt timestamp', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce(createSingleConceptResponse(
        'Test Concept',
        'Test summary that meets the minimum length requirement for proper validation.'
      ));

      const before = new Date();
      const result = await service.distill(candidate);
      const after = new Date();

      expect(result.distilledAt).toBeInstanceOf(Date);
      expect(result.distilledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.distilledAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});