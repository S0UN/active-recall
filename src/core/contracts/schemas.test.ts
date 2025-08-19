import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  EntrySchema,
  SessionMarkerSchema,
  BatchSchema,
  ConceptCandidateSchema,
  ConceptArtifactSchema,
  FolderManifestSchema
} from './schemas';

describe('BatchSchema', () => {
  describe('valid batch data', () => {
    it('should accept a valid batch with all required fields', () => {
      const validBatch = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        window: 'Chrome - Wikipedia Article',
        topic: 'Machine Learning',
        entries: [
          {
            text: 'Machine learning is a subset of artificial intelligence',
            timestamp: new Date('2024-01-01T10:00:00Z')
          }
        ],
        createdAt: new Date('2024-01-01T10:00:00Z')
      };

      const result = BatchSchema.safeParse(validBatch);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.batchId).toBe(validBatch.batchId);
        expect(result.data.window).toBe(validBatch.window);
        expect(result.data.topic).toBe(validBatch.topic);
        expect(result.data.entries).toHaveLength(1);
      }
    });

    it('should accept a batch with optional sessionMarkers', () => {
      const batchWithMarkers = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        window: 'Chrome - Wikipedia',
        topic: 'Physics',
        entries: [
          {
            text: 'Quantum mechanics',
            timestamp: new Date()
          }
        ],
        sessionMarkers: {
          sessionId: 'session-123',
          startTime: new Date('2024-01-01T09:00:00Z'),
          endTime: new Date('2024-01-01T10:00:00Z')
        },
        createdAt: new Date()
      };

      const result = BatchSchema.safeParse(batchWithMarkers);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid batch data', () => {
    it('should reject batch with invalid UUID', () => {
      const invalidBatch = {
        batchId: 'not-a-uuid',
        window: 'Chrome',
        topic: 'Math',
        entries: [],
        createdAt: new Date()
      };

      const result = BatchSchema.safeParse(invalidBatch);
      expect(result.success).toBe(false);
    });

    it('should reject batch with empty window string', () => {
      const invalidBatch = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        window: '',
        topic: 'Math',
        entries: [],
        createdAt: new Date()
      };

      const result = BatchSchema.safeParse(invalidBatch);
      expect(result.success).toBe(false);
    });

    it('should reject batch with empty topic string', () => {
      const invalidBatch = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        window: 'Chrome',
        topic: '',
        entries: [],
        createdAt: new Date()
      };

      const result = BatchSchema.safeParse(invalidBatch);
      expect(result.success).toBe(false);
    });

    it('should reject batch without required fields', () => {
      const incompleteBatch = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        window: 'Chrome'
        // missing topic, entries, createdAt
      };

      const result = BatchSchema.safeParse(incompleteBatch);
      expect(result.success).toBe(false);
    });
  });
});

describe('ConceptCandidateSchema', () => {
  describe('valid concept candidate', () => {
    it('should accept a valid concept candidate with all required fields', () => {
      const validCandidate = {
        candidateId: 'candidate-deterministic-id-123',
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        index: 0,
        rawText: 'Machine learning is a method of data analysis',
        normalizedText: 'machine learning method data analysis',
        contentHash: 'sha256-abc123def456',
        source: {
          window: 'Chrome - Wikipedia',
          topic: 'Machine Learning',
          batchId: '550e8400-e29b-41d4-a716-446655440000',
          entryCount: 5
        },
        createdAt: new Date()
      };

      const result = ConceptCandidateSchema.safeParse(validCandidate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.candidateId).toBe(validCandidate.candidateId);
        expect(result.data.normalizedText).toBe(validCandidate.normalizedText);
      }
    });

    it('should accept candidate with optional fields', () => {
      const candidateWithOptionals = {
        candidateId: 'candidate-123',
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        index: 0,
        rawText: 'Some text',
        normalizedText: 'some text',
        contentHash: 'hash123',
        source: {
          window: 'Browser',
          topic: 'Topic',
          batchId: '550e8400-e29b-41d4-a716-446655440000',
          entryCount: 1,
          uri: 'https://example.com'
        },
        titleHint: 'Suggested Title',
        keyTerms: ['machine', 'learning'],
        // Note: metadata field tested separately due to Zod v4 compatibility
        createdAt: new Date()
      };

      const result = ConceptCandidateSchema.safeParse(candidateWithOptionals);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.titleHint).toBe('Suggested Title');
        expect(result.data.keyTerms).toEqual(['machine', 'learning']);
      }
    });
  });

  describe('invalid concept candidate', () => {
    it('should reject candidate with empty text fields', () => {
      const invalidCandidate = {
        candidateId: 'id',
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        index: 0,
        rawText: '',
        normalizedText: 'text',
        contentHash: 'hash',
        source: {
          window: 'Window',
          topic: 'Topic',
          batchId: '550e8400-e29b-41d4-a716-446655440000',
          entryCount: 1
        },
        createdAt: new Date()
      };

      const result = ConceptCandidateSchema.safeParse(invalidCandidate);
      expect(result.success).toBe(false);
    });

    it('should reject candidate with negative index', () => {
      const invalidCandidate = {
        candidateId: 'id',
        batchId: '550e8400-e29b-41d4-a716-446655440000',
        index: -1,
        rawText: 'text',
        normalizedText: 'text',
        contentHash: 'hash',
        source: {
          window: 'Window',
          topic: 'Topic',
          batchId: '550e8400-e29b-41d4-a716-446655440000',
          entryCount: 1
        },
        createdAt: new Date()
      };

      const result = ConceptCandidateSchema.safeParse(invalidCandidate);
      expect(result.success).toBe(false);
    });
  });
});

describe('ConceptArtifactSchema', () => {
  describe('valid concept artifact', () => {
    it('should accept a valid artifact with all required fields', () => {
      const validArtifact = {
        artifactId: 'artifact-deterministic-id',
        candidateId: 'candidate-123',
        title: 'Introduction to Machine Learning',
        summary: 'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.',
        content: {
          original: 'Original text content here',
          normalized: 'normalized text content here',
          enhancedSummary: 'Enhanced summary if available'
        },
        routing: {
          primaryPath: '/Technology/AI/MachineLearning',
          placements: [{
            path: '/Technology/AI/MachineLearning',
            confidence: 0.85,
            type: 'primary'
          }],
          method: 'vector-similarity',
          alternatives: []
        },
        provenance: {
          source: {
            window: 'Chrome',
            topic: 'ML',
            batchId: '550e8400-e29b-41d4-a716-446655440000',
            entryCount: 5
          },
          sessionId: 'session-123',
          capturedAt: new Date()
        },
        modelInfo: {
          classifier: 'bart-large-mnli',
          embedding: 'sentence-transformers',
          version: '1.0.0'
        },
        audit: {
          createdAt: new Date(),
          createdBy: 'system',
          lastModified: new Date(),
          modifiedBy: 'system',
          version: 1
        },
        version: '1.0.0'
      };

      const result = ConceptArtifactSchema.safeParse(validArtifact);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.artifactId).toBe(validArtifact.artifactId);
        expect(result.data.title).toBe(validArtifact.title);
        expect(result.data.summary.length).toBeGreaterThanOrEqual(50);
        expect(result.data.summary.length).toBeLessThanOrEqual(500);
      }
    });
  });

  describe('invalid concept artifact', () => {
    it('should reject artifact with title too long', () => {
      const invalidArtifact = {
        artifactId: 'id',
        candidateId: 'candidate-123',
        title: 'A'.repeat(101), // 101 characters, exceeds max of 100
        summary: 'A'.repeat(100), // Valid summary
        content: {
          original: 'text',
          normalized: 'text'
        },
        routing: {
          primaryPath: '/path',
          placements: [{
            path: '/path',
            confidence: 0.5,
            type: 'primary'
          }],
          method: 'rule',
          alternatives: []
        },
        provenance: {
          source: {
            window: 'Window',
            topic: 'Topic',
            batchId: '550e8400-e29b-41d4-a716-446655440000',
            entryCount: 1
          },
          sessionId: 'session',
          capturedAt: new Date()
        },
        modelInfo: {
          classifier: 'model',
          embedding: 'model',
          version: '1.0'
        },
        audit: {
          createdAt: new Date(),
          createdBy: 'system',
          lastModified: new Date(),
          modifiedBy: 'system',
          version: 1
        },
        version: '1.0.0'
      };

      const result = ConceptArtifactSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });

    it('should reject artifact with summary too short', () => {
      const invalidArtifact = {
        artifactId: 'id',
        candidateId: 'candidate-123',
        title: 'Valid Title',
        summary: 'Too short', // Less than 50 characters
        content: {
          original: 'text',
          normalized: 'text'
        },
        routing: {
          path: '/path',
          confidence: 0.5,
          method: 'rule'
        },
        provenance: {
          source: {
            window: 'Window',
            topic: 'Topic',
            batchId: '550e8400-e29b-41d4-a716-446655440000',
            entryCount: 1
          },
          sessionId: 'session',
          capturedAt: new Date()
        },
        modelInfo: {
          classifier: 'model',
          embedding: 'model',
          version: '1.0'
        },
        audit: {
          createdAt: new Date(),
          createdBy: 'system',
          lastModified: new Date(),
          modifiedBy: 'system',
          version: 1
        },
        version: '1.0.0'
      };

      const result = ConceptArtifactSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });

    it('should reject artifact with invalid confidence score', () => {
      const invalidArtifact = {
        artifactId: 'id',
        candidateId: 'candidate-123',
        title: 'Valid Title',
        summary: 'A'.repeat(100),
        content: {
          original: 'text',
          normalized: 'text'
        },
        routing: {
          primaryPath: '/path',
          placements: [{
            path: '/path',
            confidence: 1.5, // Invalid: should be between 0 and 1
            type: 'primary'
          }],
          method: 'rule',
          alternatives: []
        },
        provenance: {
          source: {
            window: 'Window',
            topic: 'Topic',
            batchId: '550e8400-e29b-41d4-a716-446655440000',
            entryCount: 1
          },
          sessionId: 'session',
          capturedAt: new Date()
        },
        modelInfo: {
          classifier: 'model',
          embedding: 'model',
          version: '1.0'
        },
        audit: {
          createdAt: new Date(),
          createdBy: 'system',
          lastModified: new Date(),
          modifiedBy: 'system',
          version: 1
        },
        version: '1.0.0'
      };

      const result = ConceptArtifactSchema.safeParse(invalidArtifact);
      expect(result.success).toBe(false);
    });
  });
});

describe('FolderManifestSchema', () => {
  describe('valid folder manifest', () => {
    it('should accept a valid folder manifest', () => {
      const validManifest = {
        folderId: 'folder-stable-id-123',
        path: '/Technology/AI/MachineLearning',
        name: 'MachineLearning',
        depth: 3,
        provisional: false,
        stats: {
          artifactCount: 42,
          lastUpdated: new Date(),
          size: 1024000
        },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date()
      };

      const result = FolderManifestSchema.safeParse(validManifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.path).toBe(validManifest.path);
        expect(result.data.depth).toBe(3);
      }
    });

    it('should accept folder with optional fields', () => {
      const manifestWithOptionals = {
        folderId: 'folder-123',
        path: '/Technology',
        name: 'Technology',
        description: 'Technology related concepts',
        depth: 1,
        provisional: true,
        stats: {
          artifactCount: 10,
          lastUpdated: new Date(),
          size: 50000,
          avgConfidence: 0.75,
          variance: 0.1
        },
        // Note: centroid field (Float32Array) tested separately in integration tests
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = FolderManifestSchema.safeParse(manifestWithOptionals);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid folder manifest', () => {
    it('should reject folder with depth exceeding maximum', () => {
      const invalidManifest = {
        folderId: 'folder-123',
        path: '/1/2/3/4/5/TooDeep',
        name: 'TooDeep',
        depth: 5, // Exceeds max of 4
        provisional: false,
        stats: {
          artifactCount: 1,
          lastUpdated: new Date(),
          size: 1000
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = FolderManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
    });

    it('should reject folder with negative depth', () => {
      const invalidManifest = {
        folderId: 'folder-123',
        path: '/Technology',
        name: 'Technology',
        depth: -1,
        provisional: false,
        stats: {
          artifactCount: 1,
          lastUpdated: new Date(),
          size: 1000
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = FolderManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
    });
  });
});