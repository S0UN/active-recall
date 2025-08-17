import { describe, it, expect } from 'vitest';
import { ConceptCandidate } from './ConceptCandidate';
import { Batch } from '../contracts/schemas';

describe('ConceptCandidate', () => {
  const mockBatch: Batch = {
    batchId: '550e8400-e29b-41d4-a716-446655440000',
    window: 'Chrome - Wikipedia',
    topic: 'Machine Learning',
    entries: [
      {
        text: 'Machine learning is a subset of artificial intelligence',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      }
    ],
    createdAt: new Date('2024-01-01T10:00:00Z')
  };

  describe('constructor', () => {
    it('should create a concept candidate with valid parameters', () => {
      const text = 'Machine learning is a subset of artificial intelligence';
      const index = 0;

      const candidate = new ConceptCandidate(mockBatch, text, index);

      expect(candidate.rawText).toBe(text);
      expect(candidate.index).toBe(index);
      expect(candidate.batchId).toBe(mockBatch.batchId);
    });

    it('should reject empty text', () => {
      expect(() => {
        new ConceptCandidate(mockBatch, '', 0);
      }).toThrow('Text cannot be empty');
    });

    it('should reject negative index', () => {
      expect(() => {
        new ConceptCandidate(mockBatch, 'Some text', -1);
      }).toThrow('Index must be non-negative');
    });
  });

  describe('id generation', () => {
    it('should generate deterministic IDs for the same input', () => {
      const text = 'Machine learning is a powerful approach to artificial intelligence that enables computers to learn';
      const index = 0;

      const candidate1 = new ConceptCandidate(mockBatch, text, index);
      const candidate2 = new ConceptCandidate(mockBatch, text, index);

      expect(candidate1.id).toBe(candidate2.id);
      expect(candidate1.id).toMatch(/^candidate-[a-f0-9]{8}$/);
    });

    it('should generate different IDs for different content', () => {
      const text1 = 'Machine learning is a powerful approach to artificial intelligence that enables computers to learn';
      const text2 = 'Deep learning uses neural networks with multiple layers to process complex data patterns';
      
      const candidate1 = new ConceptCandidate(mockBatch, text1, 0);
      const candidate2 = new ConceptCandidate(mockBatch, text2, 0);

      expect(candidate1.id).not.toBe(candidate2.id);
    });

    it('should generate different IDs for different indices', () => {
      const text = 'Machine learning algorithms can automatically improve through experience and data analysis';
      const candidate1 = new ConceptCandidate(mockBatch, text, 0);
      const candidate2 = new ConceptCandidate(mockBatch, text, 1);

      expect(candidate1.id).not.toBe(candidate2.id);
    });

    it('should generate different IDs for different batches', () => {
      const batch2: Batch = {
        ...mockBatch,
        batchId: '550e8400-e29b-41d4-a716-446655440001'
      };

      const text = 'Neural networks process information through interconnected nodes that simulate biological neurons';
      const candidate1 = new ConceptCandidate(mockBatch, text, 0);
      const candidate2 = new ConceptCandidate(batch2, text, 0);

      expect(candidate1.id).not.toBe(candidate2.id);
    });
  });

  describe('normalization', () => {
    it('should normalize text by trimming whitespace', () => {
      const text = '  Machine learning is a powerful approach to building intelligent systems  ';
      const candidate = new ConceptCandidate(mockBatch, text, 0);

      const normalized = candidate.normalize();

      expect(normalized.normalizedText).toBe('machine learning is a powerful approach to building intelligent systems');
    });

    it('should normalize text by converting to lowercase', () => {
      const text = 'MACHINE LEARNING is a powerful approach to ARTIFICIAL Intelligence';
      const candidate = new ConceptCandidate(mockBatch, text, 0);

      const normalized = candidate.normalize();

      expect(normalized.normalizedText).toBe('machine learning is a powerful approach to artificial intelligence');
    });

    it('should remove multiple consecutive spaces', () => {
      const text = 'Machine    learning     is     a     powerful    approach    to    artificial    intelligence';
      const candidate = new ConceptCandidate(mockBatch, text, 0);

      const normalized = candidate.normalize();

      expect(normalized.normalizedText).toBe('machine learning is a powerful approach to artificial intelligence');
    });

    it('should remove common UI artifacts', () => {
      const text = 'Machine learning is a powerful approach to artificial intelligence | Home | About | Contact';
      const candidate = new ConceptCandidate(mockBatch, text, 0);

      const normalized = candidate.normalize();

      expect(normalized.normalizedText).toBe('machine learning is a powerful approach to artificial intelligence');
    });

    it('should compute content hash for normalized text', () => {
      const text = 'Machine learning algorithms can automatically improve their performance through experience';
      const candidate = new ConceptCandidate(mockBatch, text, 0);
      
      const normalized = candidate.normalize();

      expect(normalized.contentHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 format
      expect(normalized.contentHash).toBe(normalized.contentHash); // Should be deterministic
    });

    it('should preserve original text', () => {
      const originalText = 'Machine Learning is a powerful approach to Artificial Intelligence';
      const candidate = new ConceptCandidate(mockBatch, originalText, 0);

      const normalized = candidate.normalize();

      expect(normalized.rawText).toBe(originalText);
      expect(normalized.normalizedText).toBe('machine learning is a powerful approach to artificial intelligence');
    });
  });

  describe('source information', () => {
    it('should create source info from batch', () => {
      const text = 'Machine learning algorithms enable computers to learn from data without explicit programming';
      const candidate = new ConceptCandidate(mockBatch, text, 0);
      
      const sourceInfo = candidate.getSourceInfo();

      expect(sourceInfo.window).toBe(mockBatch.window);
      expect(sourceInfo.topic).toBe(mockBatch.topic);
      expect(sourceInfo.batchId).toBe(mockBatch.batchId);
      expect(sourceInfo.entryCount).toBe(mockBatch.entries.length);
    });

    it('should extract URI from entries if available', () => {
      const text = 'Machine learning algorithms enable computers to learn patterns from large datasets';
      const batchWithUri: Batch = {
        ...mockBatch,
        entries: [
          {
            text,
            timestamp: new Date(),
            metadata: { uri: 'https://wikipedia.org/wiki/Machine_learning' }
          }
        ]
      };

      const candidate = new ConceptCandidate(batchWithUri, text, 0);
      
      const sourceInfo = candidate.getSourceInfo();

      expect(sourceInfo.uri).toBe('https://wikipedia.org/wiki/Machine_learning');
    });
  });

  describe('validation', () => {
    it('should validate that text meets minimum length requirements', () => {
      const shortText = 'ML'; // Too short
      
      expect(() => {
        new ConceptCandidate(mockBatch, shortText, 0);
      }).toThrow('Text must be at least 3 characters');
    });

    it('should validate that text does not exceed maximum length', () => {
      const longText = 'A'.repeat(5001); // Too long (max 5000)
      
      expect(() => {
        new ConceptCandidate(mockBatch, longText, 0);
      }).toThrow('Text must not exceed 5000 characters');
    });

    it('should reject text that is mostly whitespace', () => {
      const whitespaceText = '   \n\t   ';
      
      expect(() => {
        new ConceptCandidate(mockBatch, whitespaceText, 0);
      }).toThrow('Text cannot be empty');
    });

    it('should accept text that meets quality threshold', () => {
      const acceptableText = 'Neural networks are computational models inspired by biological systems.';
      
      expect(() => {
        new ConceptCandidate(mockBatch, acceptableText, 0);
      }).not.toThrow();
    });
  });
});