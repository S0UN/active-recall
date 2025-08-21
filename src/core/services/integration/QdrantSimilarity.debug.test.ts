/**
 * DEBUG: Compare manual cosine similarity vs Qdrant similarity scores
 */

import { describe, test, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config();

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { BatchSchema } from '../../contracts/schemas';
import { randomUUID } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

let distillService: OpenAIDistillationService;
let embeddingService: OpenAIEmbeddingService;
let vectorIndex: QdrantVectorIndexManager;
let qdrantClient: QdrantClient;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' QDRANT SIMILARITY DEBUG', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) return;

    qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false
    });

    // Clean up
    try {
      await qdrantClient.deleteCollection('similarity_debug_concepts');
      await qdrantClient.deleteCollection('similarity_debug_folder_centroids');
    } catch {}

    distillService = new OpenAIDistillationService({
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
      collectionPrefix: 'similarity_debug'
    });

    await vectorIndex.initialize();
    console.log(' Similarity debug test initialized');
  });

  skipIfNoApiKey(' Compare Manual vs Qdrant Similarity', async () => {
    console.log('\\n TESTING: Manual Cosine Similarity vs Qdrant Search\\n');

    // Create and store first concept
    const text1 = 'Eigenvalues and Eigenvectors: For square matrix A, vector v is eigenvector with eigenvalue λ if Av = λv';
    
    const batch1 = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Test 1',
      topic: 'Linear Algebra',
      entries: [{ text: text1, timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate1 = new ConceptCandidate(batch1, text1, 0);
    const normalized1 = candidate1.normalize();
    const distilled1 = await distillService.distill(normalized1);
    const embedding1 = await embeddingService.embed(distilled1);

    console.log(' Concept 1 stored:');
    console.log(`   Title: "${distilled1.title}"`);
    console.log(`   Vector magnitude: ${Math.sqrt(embedding1.vector.reduce((sum, v) => sum + v * v, 0)).toFixed(6)}`);

    // Store in Qdrant
    await vectorIndex.upsert({
      conceptId: candidate1.id,
      embeddings: embedding1,
      folderId: 'test-folder-1'
    });

    // Create second concept
    const text2 = 'An eigenvector of matrix A satisfies the equation A·v = λ·v where λ is the corresponding eigenvalue';
    
    const batch2 = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Test 2',
      topic: 'Linear Algebra',
      entries: [{ text: text2, timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate2 = new ConceptCandidate(batch2, text2, 0);
    const normalized2 = candidate2.normalize();
    const distilled2 = await distillService.distill(normalized2);
    const embedding2 = await embeddingService.embed(distilled2);

    console.log('\\n Concept 2:');
    console.log(`   Title: "${distilled2.title}"`);
    console.log(`   Vector magnitude: ${Math.sqrt(embedding2.vector.reduce((sum, v) => sum + v * v, 0)).toFixed(6)}`);

    // Calculate manual cosine similarity
    const manualSimilarity = calculateCosineSimilarity(embedding1.vector, embedding2.vector);
    console.log(`\\n🧮 Manual Cosine Similarity: ${(manualSimilarity * 100).toFixed(4)}%`);

    // Search in Qdrant using embedding2's vector
    const qdrantResults = await vectorIndex.searchByTitle({
      vector: embedding2.vector,
      threshold: 0.0, // No threshold
      limit: 10
    });

    console.log(`\\n Qdrant Search Results: ${qdrantResults.length} found`);
    for (const result of qdrantResults) {
      console.log(`    ${result.conceptId}: ${(result.similarity * 100).toFixed(4)}% similarity`);
      console.log(`    Folder: ${result.folderId}`);
    }

    console.log(`\\n COMPARISON:`);
    console.log(`   Manual Calculation: ${(manualSimilarity * 100).toFixed(4)}%`);
    
    if (qdrantResults.length > 0) {
      const qdrantSimilarity = qdrantResults[0].similarity;
      console.log(`   Qdrant Search:      ${(qdrantSimilarity * 100).toFixed(4)}%`);
      
      const difference = Math.abs(manualSimilarity - qdrantSimilarity);
      console.log(`   Difference:         ${(difference * 100).toFixed(4)}%`);
      
      if (difference < 0.01) {
        console.log(`    Similarities match - Qdrant is working correctly`);
      } else {
        console.log(`   🚨 Similarities don't match - there's a calculation issue`);
      }
    } else {
      console.log(`    Qdrant found no results - search is broken`);
    }

    // Wait for indexing
    console.log('\\n⏳ Waiting 3 seconds for Qdrant indexing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try search again
    const qdrantResults2 = await vectorIndex.searchByTitle({
      vector: embedding2.vector,
      threshold: 0.0,
      limit: 10
    });

    console.log(`\\n Qdrant Search Results (after wait): ${qdrantResults2.length} found`);
    if (qdrantResults2.length > 0) {
      console.log(`    Best match: ${(qdrantResults2[0].similarity * 100).toFixed(4)}% similarity`);
    }

  }, 120000);

});

function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return dotProduct / (magnitudeA * magnitudeB);
}