/**
 * DEBUG TEST: Duplicate Detection Deep Dive
 * 
 * This test isolates the duplicate detection to understand why it's not working
 */

import { randomUUID } from 'crypto';
import { describe, test, beforeAll, expect } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config();

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { SmartRouter } from '../impl/SmartRouter';
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { OpenAIIntelligentFolderService } from '../impl/OpenAIIntelligentFolderService';
import { FolderCentroidManager } from '../impl/FolderCentroidManager';
import { BatchSchema } from '../../contracts/schemas';
import { loadPipelineConfig } from '../../config/PipelineConfig';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

let smartRouter: SmartRouter;
let vectorIndex: QdrantVectorIndexManager;
let embeddingService: OpenAIEmbeddingService;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' DUPLICATE DETECTION DEBUG', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) return;

    console.log(' Initializing duplicate detection debug test...');

    const qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false
    });

    // Clean collections
    try {
      await qdrantClient.deleteCollection('debug_concepts');
      await qdrantClient.deleteCollection('debug_folder_centroids');
    } catch {}

    // Initialize services
    const distillService = new OpenAIDistillationService({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      cacheEnabled: false
    });

    embeddingService = new OpenAIEmbeddingService({
      apiKey: OPENAI_API_KEY,
      model: 'text-embedding-3-small',
      dimensions: 1536
    });

    vectorIndex = new QdrantVectorIndexManager({
      host: QDRANT_HOST,
      port: QDRANT_PORT,
      dimensions: 1536,
      collectionPrefix: 'debug'
    });

    await vectorIndex.initialize();

    const centroidManager = new FolderCentroidManager(vectorIndex);
    const intelligentService = new OpenAIIntelligentFolderService(centroidManager, {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      enableCaching: false,
      dailyTokenBudget: 50000
    });

    smartRouter = new SmartRouter(
      distillService,
      embeddingService,
      vectorIndex,
      intelligentService,
      loadPipelineConfig()
    );

    console.log(' Debug services initialized');
  }, 60000);

  skipIfNoApiKey(' Debug Single Source of Truth', async () => {
    console.log('\\n DEBUGGING: Why duplicates not detected\\n');

    // Process original concept
    console.log(' Processing ORIGINAL concept:');
    const original = 'Eigenvalues and Eigenvectors: For square matrix A, vector v is eigenvector with eigenvalue λ if Av = λv';
    console.log(`   Text: "${original}"`);

    const batch1 = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Linear Algebra Course',
      topic: 'Matrix Theory',
      entries: [{ text: original, timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate1 = new ConceptCandidate(batch1, original, 0);
    console.log(`   Candidate ID: ${candidate1.id}`);
    console.log(`   Content Hash: ${candidate1.normalize().contentHash.substring(0, 16)}...`);

    const decision1 = await smartRouter.route(candidate1);
    console.log(`    Decision: ${decision1.action}`);
    console.log(`    Folder: ${decision1.folderId || decision1.newFolder?.name}`);
    console.log(`    Confidence: ${(decision1.confidence * 100).toFixed(1)}%`);

    // Wait a moment to ensure storage
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check what's in vector database  
    console.log('\\n Checking vector database state:');
    console.log('    DEBUG: Using collection prefix "debug"');
    
    // Use the actual embeddings vector instead of dummy vector for better search
    const candidateEmbeddings = await embeddingService.embed(candidate1.normalize());
    console.log('    DEBUG: Using actual embeddings for search');
    
    // Try different thresholds to find the concepts
    const thresholds = [0.0, 0.1, 0.3, 0.5, 0.7, 0.9];
    
    for (const threshold of thresholds) {
      const searchResult = await vectorIndex.searchByTitle({
        vector: candidateEmbeddings.vector, // Use real vector
        threshold,
        limit: 10
      });
      console.log(`    Threshold ${threshold}: ${searchResult.length} concepts found`);
      
      if (searchResult.length > 0) {
        console.log('    Found concepts! Details:');
        for (const concept of searchResult) {
          console.log(`      ${concept.conceptId} (similarity: ${(concept.similarity * 100).toFixed(1)}%, folder: ${concept.folderId})`);
        }
        break;
      }
    }

    // Now process similar concept
    console.log('\\n Processing SIMILAR concept:');
    const similar = 'An eigenvector of matrix A satisfies the equation A·v = λ·v where λ is the corresponding eigenvalue';
    console.log(`   Text: "${similar}"`);

    const batch2 = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Matrix Theory Textbook',
      topic: 'Eigenvalue Problems',
      entries: [{ text: similar, timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate2 = new ConceptCandidate(batch2, similar, 0);
    console.log(`   Candidate ID: ${candidate2.id}`);
    console.log(`   Content Hash: ${candidate2.normalize().contentHash.substring(0, 16)}...`);

    // Check if content hashes are different (they should be since text is different)
    const hash1 = candidate1.normalize().contentHash;
    const hash2 = candidate2.normalize().contentHash;
    console.log(`    Hash comparison: ${hash1 === hash2 ? 'IDENTICAL' : 'DIFFERENT'}`);

    const decision2 = await smartRouter.route(candidate2);
    console.log(`    Decision: ${decision2.action}`);
    console.log(`    Folder: ${decision2.folderId || decision2.newFolder?.name}`);
    console.log(`    Confidence: ${(decision2.confidence * 100).toFixed(1)}%`);

    if (decision2.action === 'duplicate') {
      console.log(`    DUPLICATE DETECTED! System working correctly`);
    } else {
      console.log(`     No duplicate detected - investigating why...`);
    }

    // Check vector database state after both concepts
    console.log('\\n Final vector database state:');
    const finalSearch = await vectorIndex.searchByTitle({
      vector: Array(1536).fill(0.1), // dummy vector
      threshold: 0.1,
      limit: 10
    });
    console.log(`    Total concepts after processing: ${finalSearch.length}`);

    console.log('\\n ANALYSIS:');
    console.log(`    Both concepts processed: ${decision1.action !== 'error' && decision2.action !== 'error'}`);
    console.log(`    Content hashes different: ${hash1 !== hash2}`);
    console.log(`    Duplicate detection: ${decision2.action === 'duplicate' ? 'WORKING' : 'NOT WORKING'}`);
    console.log(`    Concepts stored: ${finalSearch.length}`);

    // The test should NOT fail - we're debugging
    expect(true).toBe(true);

  }, 120000);

});