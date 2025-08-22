/**
 * Integration test for QdrantVectorIndexManager multi-folder functionality
 * Tests against real Qdrant instance to ensure production readiness
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorIndexManager } from './QdrantVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';
import { MultiFolderPlacement } from '../IVectorIndexManager';

// Test configuration
const TEST_CONFIG = {
  host: 'localhost',
  port: 6333,
  collectionPrefix: 'multifolder_test',
  dimensions: 64 // Smaller for faster testing
};

describe('QdrantVectorIndexManager Multi-Folder Integration', () => {
  let client: QdrantClient;
  let manager: QdrantVectorIndexManager;
  let testCollections: string[];

  beforeAll(async () => {
    client = new QdrantClient({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port
    });

    manager = new QdrantVectorIndexManager({
      provider: 'qdrant',
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      collectionPrefix: TEST_CONFIG.collectionPrefix,
      dimensions: TEST_CONFIG.dimensions
    });

    testCollections = [
      `${TEST_CONFIG.collectionPrefix}_concepts`,
      `${TEST_CONFIG.collectionPrefix}_folder_centroids`
    ];

    // Create test collections
    for (const collection of testCollections) {
      try {
        await client.createCollection(collection, {
          vectors: {
            size: TEST_CONFIG.dimensions,
            distance: 'Cosine'
          }
        });
      } catch (error) {
        // Collection might already exist
        console.log(`Collection ${collection} already exists or failed to create:`, error);
      }
    }
  });

  afterAll(async () => {
    // Clean up test collections
    for (const collection of testCollections) {
      try {
        await client.deleteCollection(collection);
      } catch (error) {
        console.log(`Failed to delete collection ${collection}:`, error);
      }
    }
  });

  beforeEach(async () => {
    // Clear collections before each test
    for (const collection of testCollections) {
      try {
        const info = await client.getCollection(collection);
        if (info.points_count > 0) {
          await client.delete(collection, {
            wait: true,
            points: { all: true }
          });
        }
      } catch (error) {
        // Collection might not exist
      }
    }
  });

  const createTestEmbeddings = (seed: number = 1): VectorEmbeddings => ({
    vector: Array.from({ length: TEST_CONFIG.dimensions }, (_, i) => 
      Math.sin((seed + i) * 0.1) // Deterministic but varied
    ),
    contentHash: `test-hash-${seed}`,
    model: 'test-model',
    dimensions: TEST_CONFIG.dimensions,
    cached: false,
    embeddedAt: new Date()
  });

  const createTestPlacements = (primary: string, references: string[]): MultiFolderPlacement => ({
    primary,
    references,
    confidences: {
      [primary]: 0.95,
      ...Object.fromEntries(references.map((ref, i) => [ref, 0.8 - i * 0.1]))
    }
  });

  describe('Real multi-folder storage and retrieval', () => {
    it('should store and retrieve concept with multiple folder placements', async () => {
      const embeddings = createTestEmbeddings(1);
      const placements = createTestPlacements(
        'algorithms-sorting',
        ['data-structures-heaps', 'interview-prep', 'complexity-analysis']
      );

      // Store concept with multi-folder placements
      await manager.upsert({
        conceptId: 'heap-sort-real',
        embeddings,
        placements
      });

      // Verify primary folder search
      const primaryResults = await manager.searchByFolder('algorithms-sorting', false);
      expect(primaryResults).toHaveLength(1);
      expect(primaryResults[0].conceptId).toBe('heap-sort-real');
      expect(primaryResults[0].isPrimary).toBe(true);

      // Verify reference folder searches
      for (const refFolder of placements.references) {
        const refResults = await manager.searchByFolder(refFolder, true);
        expect(refResults).toHaveLength(1);
        expect(refResults[0].conceptId).toBe('heap-sort-real');
        expect(refResults[0].isPrimary).toBe(false);
      }

      // Verify that reference folders don't show up when includeReferences=false
      const refOnlyResults = await manager.searchByFolder('data-structures-heaps', false);
      expect(refOnlyResults).toHaveLength(0);
    });

    it('should handle mixed legacy and new concepts', async () => {
      // Add legacy concept (single folder)
      const legacyEmbeddings = createTestEmbeddings(2);
      await manager.upsert({
        conceptId: 'legacy-concept',
        embeddings: legacyEmbeddings,
        folderId: 'algorithms-sorting'
      });

      // Add new multi-folder concept
      const newEmbeddings = createTestEmbeddings(3);
      const newPlacements = createTestPlacements(
        'algorithms-sorting',
        ['data-structures-trees']
      );
      await manager.upsert({
        conceptId: 'new-concept',
        embeddings: newEmbeddings,
        placements: newPlacements
      });

      // Search should find both
      const results = await manager.searchByFolder('algorithms-sorting', true);
      expect(results).toHaveLength(2);
      
      const conceptIds = results.map(r => r.conceptId).sort();
      expect(conceptIds).toEqual(['legacy-concept', 'new-concept']);

      // Both should be marked as primary for this folder
      results.forEach(result => {
        expect(result.isPrimary).toBe(true);
      });
    });

    it('should return unique folder IDs from mixed storage formats', async () => {
      // Create concepts with various folder configurations
      const concepts = [
        {
          id: 'concept-1',
          embeddings: createTestEmbeddings(10),
          placements: createTestPlacements('math-calculus', ['math-analysis', 'physics'])
        },
        {
          id: 'concept-2', 
          embeddings: createTestEmbeddings(11),
          folderId: 'computer-science' // Legacy format
        },
        {
          id: 'concept-3',
          embeddings: createTestEmbeddings(12),
          placements: createTestPlacements('data-structures-graphs', ['algorithms', 'interview-prep'])
        }
      ];

      // Store all concepts
      for (const concept of concepts) {
        await manager.upsert({
          conceptId: concept.id,
          embeddings: concept.embeddings,
          folderId: concept.folderId,
          placements: concept.placements
        });
      }

      // Get all folder IDs
      const allFolderIds = await manager.getAllFolderIds();
      
      // Should include all unique folders
      const expectedFolders = [
        'math-calculus', 'math-analysis', 'physics',
        'computer-science',
        'data-structures-graphs', 'algorithms', 'interview-prep'
      ];
      
      expect(allFolderIds.sort()).toEqual(expectedFolders.sort());
    });

    it('should handle concepts with many reference folders', async () => {
      const embeddings = createTestEmbeddings(20);
      const manyReferences = Array.from({ length: 15 }, (_, i) => `reference-folder-${i}`);
      const placements = createTestPlacements('primary-folder', manyReferences);

      await manager.upsert({
        conceptId: 'many-refs-concept',
        embeddings,
        placements
      });

      // Should find in primary
      const primaryResults = await manager.searchByFolder('primary-folder', false);
      expect(primaryResults).toHaveLength(1);
      expect(primaryResults[0].isPrimary).toBe(true);

      // Should find in all reference folders
      for (let i = 0; i < 15; i++) {
        const refResults = await manager.searchByFolder(`reference-folder-${i}`, true);
        expect(refResults).toHaveLength(1);
        expect(refResults[0].isPrimary).toBe(false);
      }

      // Verify all folders are in getAllFolderIds
      const allFolders = await manager.getAllFolderIds();
      expect(allFolders).toContain('primary-folder');
      manyReferences.forEach(ref => {
        expect(allFolders).toContain(ref);
      });
    });

    it('should handle updates to existing concepts', async () => {
      const conceptId = 'updateable-concept';
      const embeddings = createTestEmbeddings(30);

      // Initial placement
      const initialPlacements = createTestPlacements('folder-a', ['folder-b']);
      await manager.upsert({
        conceptId,
        embeddings,
        placements: initialPlacements
      });

      // Verify initial state
      let folderAResults = await manager.searchByFolder('folder-a', false);
      expect(folderAResults).toHaveLength(1);
      
      let folderBResults = await manager.searchByFolder('folder-b', true);
      expect(folderBResults).toHaveLength(1);
      expect(folderBResults[0].isPrimary).toBe(false);

      // Update placement
      const updatedPlacements = createTestPlacements('folder-c', ['folder-a', 'folder-d']);
      await manager.upsert({
        conceptId,
        embeddings,
        placements: updatedPlacements
      });

      // Verify updated state
      const folderCResults = await manager.searchByFolder('folder-c', false);
      expect(folderCResults).toHaveLength(1);
      expect(folderCResults[0].isPrimary).toBe(true);

      // folder-a should now have it as reference
      folderAResults = await manager.searchByFolder('folder-a', true);
      expect(folderAResults).toHaveLength(1);
      expect(folderAResults[0].isPrimary).toBe(false);

      // folder-b should no longer have it
      folderBResults = await manager.searchByFolder('folder-b', true);
      expect(folderBResults).toHaveLength(0);

      // folder-d should have it as reference
      const folderDResults = await manager.searchByFolder('folder-d', true);
      expect(folderDResults).toHaveLength(1);
      expect(folderDResults[0].isPrimary).toBe(false);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle empty search results gracefully', async () => {
      const results = await manager.searchByFolder('non-existent-folder', true);
      expect(results).toHaveLength(0);

      const allFolders = await manager.getAllFolderIds();
      expect(allFolders).toHaveLength(0);
    });

    it('should handle concepts with no reference folders', async () => {
      const embeddings = createTestEmbeddings(40);
      const placements = createTestPlacements('solo-folder', []);

      await manager.upsert({
        conceptId: 'solo-concept',
        embeddings,
        placements
      });

      const results = await manager.searchByFolder('solo-folder', true);
      expect(results).toHaveLength(1);
      expect(results[0].isPrimary).toBe(true);

      const allFolders = await manager.getAllFolderIds();
      expect(allFolders).toEqual(['solo-folder']);
    });

    it('should handle large batch operations efficiently', async () => {
      const startTime = Date.now();
      const batchSize = 50;
      
      // Create and store many concepts
      const operations = Array.from({ length: batchSize }, async (_, i) => {
        const embeddings = createTestEmbeddings(100 + i);
        const placements = createTestPlacements(
          `primary-${i % 10}`,  // 10 different primary folders
          [`ref1-${i % 5}`, `ref2-${i % 3}`] // Various reference folders
        );
        
        return manager.upsert({
          conceptId: `batch-concept-${i}`,
          embeddings,
          placements
        });
      });

      await Promise.all(operations);
      const storageTime = Date.now() - startTime;

      // Verify retrieval is fast
      const retrievalStart = Date.now();
      const allFolders = await manager.getAllFolderIds();
      const retrievalTime = Date.now() - retrievalStart;

      console.log(`Stored ${batchSize} concepts in ${storageTime}ms`);
      console.log(`Retrieved all folder IDs in ${retrievalTime}ms`);
      console.log(`Found ${allFolders.length} unique folders`);

      // Performance assertions
      expect(storageTime).toBeLessThan(10000); // Should complete in under 10 seconds
      expect(retrievalTime).toBeLessThan(1000); // Should retrieve in under 1 second
      expect(allFolders.length).toBeGreaterThan(10); // Should have multiple folders
    });
  });
});