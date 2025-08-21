/**
 * DEBUG: Test embedding consistency to diagnose similarity issues
 * 
 * This test will help identify if the problem is:
 * 1. OpenAI embeddings being inconsistent 
 * 2. Cosine similarity calculation issues
 * 3. Vector normalization problems
 * 4. Qdrant distance calculation issues
 */

import { describe, test, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config();

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { BatchSchema } from '../../contracts/schemas';
import { randomUUID } from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let embeddingService: OpenAIEmbeddingService;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' EMBEDDING CONSISTENCY DEBUG', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) return;

    embeddingService = new OpenAIEmbeddingService({
      apiKey: OPENAI_API_KEY,
      model: 'text-embedding-3-small',
      dimensions: 1536
    });

    console.log(' Embedding consistency test initialized');
  });

  skipIfNoApiKey(' Test Embedding Consistency', async () => {
    console.log('\\n TESTING: OpenAI Embedding Consistency\\n');

    const testTexts = [
      'Eigenvalues and Eigenvectors: For square matrix A, vector v is eigenvector with eigenvalue λ if Av = λv',
      'Eigenvalues and Eigenvectors: For square matrix A, vector v is eigenvector with eigenvalue λ if Av = λv', // Identical
      'An eigenvector of matrix A satisfies the equation A·v = λ·v where λ is the corresponding eigenvalue', // Similar concept
      'The quick brown fox jumps over the lazy dog', // Completely different
    ];

    const embeddings = [];
    
    // Generate embeddings for each text
    for (const [index, text] of testTexts.entries()) {
      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Embedding Test',
        topic: 'Consistency Check',
        entries: [{ text, timestamp: new Date() }],
        createdAt: new Date()
      });

      const candidate = new ConceptCandidate(batch, text, index);
      const normalized = candidate.normalize();
      const embedding = await embeddingService.embed(normalized);
      
      embeddings.push({
        text: text.substring(0, 50) + '...',
        vector: embedding.vector,
        magnitude: Math.sqrt(embedding.vector.reduce((sum, val) => sum + val * val, 0))
      });
      
      console.log(` Text ${index + 1}:`);
      console.log(`   Text: "${text.substring(0, 60)}..."`);
      console.log(`   Vector magnitude: ${embeddings[index].magnitude.toFixed(6)}`);
      console.log(`   First 5 dimensions: [${embedding.vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    }

    console.log('\\n Similarity Analysis:');
    
    // Calculate cosine similarities manually
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = calculateCosineSimilarity(embeddings[i].vector, embeddings[j].vector);
        
        console.log(`\\n Similarity between Text ${i + 1} and Text ${j + 1}:`);
        console.log(`   Cosine Similarity: ${(similarity * 100).toFixed(2)}%`);
        console.log(`   Text A: ${embeddings[i].text}`);
        console.log(`   Text B: ${embeddings[j].text}`);
        
        if (i === 0 && j === 1) {
          console.log(`     IDENTICAL TEXT similarity: ${(similarity * 100).toFixed(2)}% (should be ~100%)`);
          if (similarity < 0.99) {
            console.log(`   🚨 PROBLEM: Identical text has low similarity!`);
          }
        }
      }
    }

    console.log('\\n Vector Analysis:');
    
    // Check if vectors are normalized
    embeddings.forEach((emb, i) => {
      const isNormalized = Math.abs(emb.magnitude - 1.0) < 0.01;
      console.log(`   Vector ${i + 1} magnitude: ${emb.magnitude.toFixed(6)} ${isNormalized ? ' normalized' : '  not normalized'}`);
    });

    // Test if OpenAI embeddings are consistent across calls
    console.log('\\n🔁 Testing Embedding Consistency Across Multiple Calls:');
    const testText = testTexts[0];
    const batch = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Consistency Test',
      topic: 'Multiple Calls',
      entries: [{ text: testText, timestamp: new Date() }],
      createdAt: new Date()
    });

    const candidate = new ConceptCandidate(batch, testText, 0);
    const normalized = candidate.normalize();
    
    const embedding1 = await embeddingService.embed(normalized);
    const embedding2 = await embeddingService.embed(normalized);
    
    const consistencySimilarity = calculateCosineSimilarity(embedding1.vector, embedding2.vector);
    console.log(`   Same text, different API calls: ${(consistencySimilarity * 100).toFixed(4)}%`);
    
    if (consistencySimilarity < 0.999) {
      console.log(`   🚨 MAJOR ISSUE: OpenAI embeddings are inconsistent across API calls!`);
      console.log(`    This explains the low similarity scores`);
    } else {
      console.log(`    OpenAI embeddings are consistent`);
    }

  }, 60000);

});

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

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

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}