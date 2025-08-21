/**
 * DEBUG: Test concept storage directly to isolate the problem
 */

import { randomUUID } from 'crypto';
import { describe, test, beforeAll } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config();

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { BatchSchema } from '../../contracts/schemas';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

let embeddingService: OpenAIEmbeddingService;
let vectorIndex: QdrantVectorIndexManager;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' STORAGE DEBUG', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) return;

    console.log(' Setting up direct storage test...');

    const qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false
    });

    // Clean collections
    try {
      await qdrantClient.deleteCollection('storage_debug_concepts');
      await qdrantClient.deleteCollection('storage_debug_folder_centroids');
    } catch {}

    embeddingService = new OpenAIEmbeddingService({
      apiKey: OPENAI_API_KEY,
      model: 'text-embedding-3-small',
      dimensions: 1536
    });

    vectorIndex = new QdrantVectorIndexManager({
      host: QDRANT_HOST,
      port: QDRANT_PORT,
      dimensions: 1536,
      collectionPrefix: 'storage_debug'
    });

    await vectorIndex.initialize();
    console.log(' Direct storage test setup complete');
  }, 60000);

  skipIfNoApiKey(' Test Direct Concept Storage', async () => {
    console.log('\\n TESTING: Direct concept storage to vector database\\n');

    // Create a concept
    const batch = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Storage Test',
      topic: 'Direct Storage',
      entries: [{ text: 'Test eigenvalue concept for storage debugging', timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate = new ConceptCandidate(batch, 'Test eigenvalue concept for storage debugging', 0);
    console.log(` Created candidate: ${candidate.id}`);

    // Generate embeddings
    const normalized = candidate.normalize();
    const embeddings = await embeddingService.embed(normalized);
    console.log(`🔢 Generated embeddings: ${embeddings.vector.length} dimensions`);

    // Test direct storage
    console.log('\\n💾 Testing direct storage...');
    try {
      await vectorIndex.upsert({
        conceptId: candidate.id,
        embeddings,
        folderId: 'test-folder'
      });
      console.log(' Direct storage succeeded');
    } catch (error) {
      console.log(' Direct storage failed:', error.message);
      throw error;
    }

    // Verify storage
    console.log('\\n Verifying storage...');
    const searchResults = await vectorIndex.searchByTitle({
      vector: embeddings.vector,
      threshold: 0.1,
      limit: 10
    });

    console.log(` Search results: ${searchResults.length} concepts found`);
    
    for (const result of searchResults) {
      console.log(`    ${result.conceptId} (similarity: ${(result.similarity * 100).toFixed(1)}%)`);
      console.log(`    Folder: ${result.folderId}`);
    }

    if (searchResults.length === 0) {
      console.log('  NO CONCEPTS FOUND - Storage or search issue!');
    } else {
      console.log(' Storage and search working correctly!');
    }

  }, 60000);

});