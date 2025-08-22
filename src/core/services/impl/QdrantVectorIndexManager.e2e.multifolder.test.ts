/**
 * End-to-end test demonstrating multi-folder functionality
 * Clean, isolated test to prove the implementation works
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorIndexManager } from './QdrantVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';
import { MultiFolderPlacement } from '../IVectorIndexManager';

const TEST_CONFIG = {
  host: 'localhost',
  port: 6333,
  collectionPrefix: 'e2e_multifolder',
  dimensions: 128
};

describe('Multi-Folder E2E Verification', () => {
  let client: QdrantClient;
  let manager: QdrantVectorIndexManager;
  const testCollection = `${TEST_CONFIG.collectionPrefix}_concepts`;

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

    // Clean setup - delete collection if exists and recreate
    try {
      await client.deleteCollection(testCollection);
    } catch {
      // Collection might not exist
    }

    await client.createCollection(testCollection, {
      vectors: {
        size: TEST_CONFIG.dimensions,
        distance: 'Cosine'
      }
    });
  });

  afterAll(async () => {
    try {
      await client.deleteCollection(testCollection);
    } catch (error) {
      console.log(`Failed to cleanup collection: ${error}`);
    }
  });

  const createEmbeddings = (seed: number): VectorEmbeddings => ({
    vector: Array.from({ length: TEST_CONFIG.dimensions }, (_, i) => 
      Math.sin((seed + i) * 0.1)
    ),
    contentHash: `hash-${seed}`,
    model: 'test-model',
    dimensions: TEST_CONFIG.dimensions,
    embeddedAt: new Date()
  });

  it('should demonstrate complete multi-folder workflow', async () => {
    console.log('🧪 Testing Multi-Folder Concept Storage and Retrieval');
    
    // Step 1: Store a concept with multiple folder placements
    const heapSortPlacements: MultiFolderPlacement = {
      primary: 'algorithms-sorting',
      references: ['data-structures-heaps', 'interview-prep'],
      confidences: {
        'algorithms-sorting': 0.92,
        'data-structures-heaps': 0.78,
        'interview-prep': 0.71
      }
    };

    await manager.upsert({
      conceptId: 'heap-sort-algorithm',
      embeddings: createEmbeddings(1),
      placements: heapSortPlacements
    });

    console.log('Stored concept with primary and reference folders');

    // Step 2: Verify primary folder placement
    const primaryResults = await manager.searchByFolder('algorithms-sorting', false);
    expect(primaryResults).toHaveLength(1);
    expect(primaryResults[0].conceptId).toBe('heap-sort-algorithm');
    expect(primaryResults[0].isPrimary).toBe(true);
    console.log('Primary folder search works correctly');

    // Step 3: Verify reference folder placements
    const heapFolderResults = await manager.searchByFolder('data-structures-heaps', true);
    expect(heapFolderResults).toHaveLength(1);
    expect(heapFolderResults[0].conceptId).toBe('heap-sort-algorithm');
    expect(heapFolderResults[0].isPrimary).toBe(false); // It's a reference
    console.log('Reference folder search works correctly');

    const interviewResults = await manager.searchByFolder('interview-prep', true);
    expect(interviewResults).toHaveLength(1);
    expect(interviewResults[0].conceptId).toBe('heap-sort-algorithm');
    expect(interviewResults[0].isPrimary).toBe(false);

    // Step 4: Verify reference folders don't show when includeReferences=false
    const heapOnlyPrimary = await manager.searchByFolder('data-structures-heaps', false);
    expect(heapOnlyPrimary).toHaveLength(0); // No primary concepts in this folder
    console.log('Primary-only search filtering works correctly');

    // Step 5: Verify all folder IDs are discoverable
    const allFolders = await manager.getAllFolderIds();
    expect(allFolders).toContain('algorithms-sorting');
    expect(allFolders).toContain('data-structures-heaps');
    expect(allFolders).toContain('interview-prep');
    console.log('Folder ID discovery works correctly');

    // Step 6: Test legacy compatibility (single folder)
    await manager.upsert({
      conceptId: 'binary-search',
      embeddings: createEmbeddings(2),
      folderId: 'algorithms-searching' // Legacy single folder
    });

    const legacyResults = await manager.searchByFolder('algorithms-searching', true);
    expect(legacyResults).toHaveLength(1);
    expect(legacyResults[0].conceptId).toBe('binary-search');
    expect(legacyResults[0].isPrimary).toBe(true); // Legacy concepts are treated as primary
    console.log('Legacy single-folder compatibility works');

    // Step 7: Test concept update (change placements)
    const updatedPlacements: MultiFolderPlacement = {
      primary: 'algorithms-advanced', // Changed primary
      references: ['data-structures-heaps', 'complexity-analysis'], // Added new, removed old
      confidences: {
        'algorithms-advanced': 0.95,
        'data-structures-heaps': 0.80,
        'complexity-analysis': 0.75
      }
    };

    await manager.upsert({
      conceptId: 'heap-sort-algorithm', // Same ID - this updates
      embeddings: createEmbeddings(1),
      placements: updatedPlacements
    });

    // Verify old primary no longer has it
    const oldPrimaryResults = await manager.searchByFolder('algorithms-sorting', false);
    expect(oldPrimaryResults).toHaveLength(0);

    // Verify new primary has it
    const newPrimaryResults = await manager.searchByFolder('algorithms-advanced', false);
    expect(newPrimaryResults).toHaveLength(1);
    expect(newPrimaryResults[0].conceptId).toBe('heap-sort-algorithm');

    // Verify old reference (interview-prep) no longer has it
    const oldRefResults = await manager.searchByFolder('interview-prep', true);
    expect(oldRefResults).toHaveLength(0);

    // Verify new reference (complexity-analysis) has it
    const newRefResults = await manager.searchByFolder('complexity-analysis', true);
    expect(newRefResults).toHaveLength(1);
    expect(newRefResults[0].isPrimary).toBe(false);

    console.log('Concept updates work correctly');

    console.log('🎉 Multi-folder functionality verification COMPLETE!');
    console.log('   ✓ Primary and reference folder storage');
    console.log('   ✓ Folder-based search and retrieval');  
    console.log('   ✓ Primary vs reference distinction');
    console.log('   ✓ Legacy single-folder compatibility');
    console.log('   ✓ Concept updates and migrations');
    console.log('   ✓ Folder discovery');
  });
});