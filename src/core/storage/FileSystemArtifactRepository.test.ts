/**
 * FileSystemArtifactRepository Tests
 * 
 * Tests the file system implementation of IConceptArtifactRepository.
 * These tests ensure atomic file operations, idempotent saves, and proper
 * folder structure management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemArtifactRepository } from './FileSystemArtifactRepository';
import { ConceptArtifactSchema, type ConceptArtifact } from '../contracts/schemas';
import { FolderPath } from '../domain/FolderPath';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

describe('FileSystemArtifactRepository', () => {
  let repository: FileSystemArtifactRepository;
  let testBasePath: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testBasePath = join(tmpdir(), `test-artifacts-${randomUUID()}`);
    await fs.mkdir(testBasePath, { recursive: true });
    repository = new FileSystemArtifactRepository(testBasePath);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testBasePath, { recursive: true, force: true });
  });

  const createTestArtifact = (overrides?: Partial<ConceptArtifact>): ConceptArtifact => {
    const batchId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID v4
    
    const artifact: ConceptArtifact = {
      artifactId: `artifact-${randomUUID().substring(0, 8)}`,
      candidateId: `candidate-${randomUUID().substring(0, 8)}`,
      title: 'Test Concept',
      summary: 'This is a test concept artifact with enough content to meet validation requirements for testing',
      content: {
        original: 'The full text content of the concept goes here with sufficient detail',
        normalized: 'the full text content of the concept goes here with sufficient detail',
        enhancedSummary: 'An enhanced summary of the concept'
      },
      routing: {
        path: '/Technology/Testing',
        confidence: 0.85,
        method: 'rule-based',
        alternatives: []
      },
      provenance: {
        source: {
          window: 'Test Window',
          topic: 'Testing',
          batchId: batchId,
          entryCount: 1
        },
        sessionId: 'session-test-001',
        capturedAt: new Date('2024-01-01T10:00:00Z'),
        processedAt: new Date('2024-01-01T10:01:00Z')
      },
      modelInfo: {
        classifier: 'test-classifier',
        embedding: 'test-embedding',
        version: '1.0.0'
      },
      audit: {
        createdAt: new Date('2024-01-01T10:00:00Z'),
        createdBy: 'test-user',
        lastModified: new Date('2024-01-01T10:01:00Z'),
        modifiedBy: 'test-user',
        version: 1
      },
      version: '1.0.0',
      ...overrides
    };

    // Validate the artifact against schema
    return ConceptArtifactSchema.parse(artifact);
  };

  describe('save', () => {
    it('should save an artifact to the file system', async () => {
      const artifact = createTestArtifact();
      
      await repository.save(artifact);
      
      // Verify file was created at expected path
      const expectedPath = join(
        testBasePath,
        'Technology',
        'Testing',
        `${artifact.artifactId}.json`
      );
      
      const fileExists = await fs.stat(expectedPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Verify content is correct
      const content = await fs.readFile(expectedPath, 'utf-8');
      const savedArtifact = JSON.parse(content);
      expect(savedArtifact.artifactId).toBe(artifact.artifactId);
    });

    it('should be idempotent - saving same artifact multiple times should succeed', async () => {
      const artifact = createTestArtifact();
      
      // Save multiple times
      await repository.save(artifact);
      await repository.save(artifact);
      await repository.save(artifact);
      
      // Should not throw and file should exist with correct content
      const exists = await repository.exists(artifact.artifactId);
      expect(exists).toBe(true);
    });

    it('should create parent directories if they do not exist', async () => {
      const artifact = createTestArtifact({
        routing: {
          path: '/Deep/Nested/Path/Structure',
          confidence: 0.8,
          method: 'test',
          alternatives: []
        }
      });
      
      await repository.save(artifact);
      
      const expectedPath = join(
        testBasePath,
        'Deep',
        'Nested',
        'Path',
        'Structure',
        `${artifact.artifactId}.json`
      );
      
      const fileExists = await fs.stat(expectedPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should use atomic writes to prevent partial writes', async () => {
      const artifact = createTestArtifact();
      
      // Save should use temp file + rename pattern
      await repository.save(artifact);
      
      // File should be complete and valid
      const retrieved = await repository.findById(artifact.artifactId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.artifactId).toBe(artifact.artifactId);
    });
  });

  describe('findById', () => {
    it('should find an artifact by its ID', async () => {
      const artifact = createTestArtifact();
      await repository.save(artifact);
      
      const found = await repository.findById(artifact.artifactId);
      
      expect(found).not.toBeNull();
      expect(found?.artifactId).toBe(artifact.artifactId);
      expect(found?.title).toBe(artifact.title);
    });

    it('should return null if artifact does not exist', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByPath', () => {
    it('should find all artifacts in a specific folder path', async () => {
      const path = FolderPath.fromString('/Technology/Testing');
      
      const artifact1 = createTestArtifact({ 
        artifactId: 'artifact-001',
        routing: { path: path.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      });
      const artifact2 = createTestArtifact({ 
        artifactId: 'artifact-002',
        routing: { path: path.toString(), confidence: 0.9, method: 'test', alternatives: [] }
      });
      
      await repository.save(artifact1);
      await repository.save(artifact2);
      
      const artifacts = await repository.findByPath(path);
      
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map(a => a.artifactId).sort()).toEqual(['artifact-001', 'artifact-002']);
    });

    it('should return empty array if folder does not exist', async () => {
      const path = FolderPath.fromString('/NonExistent/Path');
      const artifacts = await repository.findByPath(path);
      expect(artifacts).toEqual([]);
    });

    it('should not include artifacts from subdirectories', async () => {
      const parentPath = FolderPath.fromString('/Technology');
      const childPath = FolderPath.fromString('/Technology/Testing');
      
      const parentArtifact = createTestArtifact({ 
        artifactId: 'parent-artifact',
        routing: { path: parentPath.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      });
      const childArtifact = createTestArtifact({ 
        artifactId: 'child-artifact',
        routing: { path: childPath.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      });
      
      await repository.save(parentArtifact);
      await repository.save(childArtifact);
      
      const parentArtifacts = await repository.findByPath(parentPath);
      expect(parentArtifacts).toHaveLength(1);
      expect(parentArtifacts[0].artifactId).toBe('parent-artifact');
    });
  });

  describe('exists', () => {
    it('should return true if artifact exists', async () => {
      const artifact = createTestArtifact();
      await repository.save(artifact);
      
      const exists = await repository.exists(artifact.artifactId);
      expect(exists).toBe(true);
    });

    it('should return false if artifact does not exist', async () => {
      const exists = await repository.exists('non-existent-id');
      expect(exists).toBe(false);
    });
  });

  describe('findByCandidateId', () => {
    it('should find artifact by candidate ID', async () => {
      const candidateId = 'candidate-test-123';
      const artifact = createTestArtifact({ candidateId });
      await repository.save(artifact);
      
      const found = await repository.findByCandidateId(candidateId);
      
      expect(found).not.toBeNull();
      expect(found?.candidateId).toBe(candidateId);
    });

    it('should return null if no artifact has the candidate ID', async () => {
      const found = await repository.findByCandidateId('non-existent-candidate');
      expect(found).toBeNull();
    });
  });

  describe('findByContentHash', () => {
    it('should find artifacts by content hash', async () => {
      // Use the same normalized content to get the same hash
      const sameNormalizedContent = 'this is the exact same normalized content for both artifacts';
      
      const artifact1 = createTestArtifact({ 
        artifactId: 'artifact-001',
        content: {
          original: 'This is the EXACT same normalized content for both artifacts!',
          normalized: sameNormalizedContent,
          enhancedSummary: 'First artifact'
        }
      });
      const artifact2 = createTestArtifact({ 
        artifactId: 'artifact-002',
        content: {
          original: 'THIS IS THE EXACT SAME NORMALIZED CONTENT FOR BOTH ARTIFACTS',
          normalized: sameNormalizedContent,
          enhancedSummary: 'Second artifact'
        }
      });
      
      await repository.save(artifact1);
      await repository.save(artifact2);
      
      // Compute the expected hash from the normalized content
      const crypto = require('crypto');
      const expectedHash = crypto.createHash('sha256').update(sameNormalizedContent).digest('hex');
      
      const artifacts = await repository.findByContentHash(expectedHash);
      
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map(a => a.artifactId).sort()).toEqual(['artifact-001', 'artifact-002']);
    });

    it('should return empty array if no artifacts have the content hash', async () => {
      const artifacts = await repository.findByContentHash('non-existent-hash');
      expect(artifacts).toEqual([]);
    });
  });

  describe('updatePath', () => {
    it('should move artifact to new path', async () => {
      const artifact = createTestArtifact({
        routing: { path: '/Old/Path', confidence: 0.8, method: 'test', alternatives: [] }
      });
      await repository.save(artifact);
      
      const newPath = FolderPath.fromString('/New/Path');
      await repository.updatePath(artifact.artifactId, newPath);
      
      // Old file should not exist
      const oldFilePath = join(testBasePath, 'Old', 'Path', `${artifact.artifactId}.json`);
      const oldExists = await fs.stat(oldFilePath).then(() => true).catch(() => false);
      expect(oldExists).toBe(false);
      
      // New file should exist
      const newFilePath = join(testBasePath, 'New', 'Path', `${artifact.artifactId}.json`);
      const newExists = await fs.stat(newFilePath).then(() => true).catch(() => false);
      expect(newExists).toBe(true);
      
      // Content should be updated with new path
      const updated = await repository.findById(artifact.artifactId);
      expect(updated?.routing.path).toBe('/New/Path');
    });

    it('should handle non-existent artifact gracefully', async () => {
      const newPath = FolderPath.fromString('/New/Path');
      
      // Should not throw, just no-op
      await expect(
        repository.updatePath('non-existent-id', newPath)
      ).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete an artifact', async () => {
      const artifact = createTestArtifact();
      await repository.save(artifact);
      
      await repository.delete(artifact.artifactId);
      
      const exists = await repository.exists(artifact.artifactId);
      expect(exists).toBe(false);
    });

    it('should be idempotent - deleting non-existent artifact should succeed', async () => {
      await expect(
        repository.delete('non-existent-id')
      ).resolves.not.toThrow();
    });
  });

  describe('count', () => {
    it('should count total artifacts', async () => {
      const artifact1 = createTestArtifact({ artifactId: 'artifact-001' });
      const artifact2 = createTestArtifact({ artifactId: 'artifact-002' });
      const artifact3 = createTestArtifact({ artifactId: 'artifact-003' });
      
      expect(await repository.count()).toBe(0);
      
      await repository.save(artifact1);
      expect(await repository.count()).toBe(1);
      
      await repository.save(artifact2);
      await repository.save(artifact3);
      expect(await repository.count()).toBe(3);
    });
  });

  describe('countByPath', () => {
    it('should count artifacts in a specific path', async () => {
      const path1 = FolderPath.fromString('/Technology/Testing');
      const path2 = FolderPath.fromString('/Science/Physics');
      
      await repository.save(createTestArtifact({ 
        artifactId: 'tech-1',
        routing: { path: path1.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      }));
      await repository.save(createTestArtifact({ 
        artifactId: 'tech-2',
        routing: { path: path1.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      }));
      await repository.save(createTestArtifact({ 
        artifactId: 'science-1',
        routing: { path: path2.toString(), confidence: 0.8, method: 'test', alternatives: [] }
      }));
      
      expect(await repository.countByPath(path1)).toBe(2);
      expect(await repository.countByPath(path2)).toBe(1);
      expect(await repository.countByPath(FolderPath.fromString('/Empty'))).toBe(0);
    });
  });
});