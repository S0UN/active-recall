/**
 * DEBUG: Test the complete embedding pipeline to see what's happening
 * 
 * This test will trace through the entire distillation -> embedding process
 */

import { describe, test, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config();

import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { BatchSchema } from '../../contracts/schemas';
import { randomUUID } from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let embeddingService: OpenAIEmbeddingService;
let distillService: OpenAIDistillationService;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' EMBEDDING PIPELINE DEBUG', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) return;

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

    console.log(' Complete pipeline test initialized');
  });

  skipIfNoApiKey(' Test Complete Distillation → Embedding Pipeline', async () => {
    console.log('\\n TESTING: Complete Distillation → Embedding Pipeline\\n');

    const testTexts = [
      'Eigenvalues and Eigenvectors: For square matrix A, vector v is eigenvector with eigenvalue λ if Av = λv',
      'An eigenvector of matrix A satisfies the equation A·v = λ·v where λ is the corresponding eigenvalue',
      'The quick brown fox jumps over the lazy dog',
    ];

    const results = [];

    for (const [index, text] of testTexts.entries()) {
      console.log(`\\n📋 Processing Text ${index + 1}:`);
      console.log(`   Raw: "${text}"`);
      
      // Create concept candidate
      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Pipeline Test',
        topic: 'Full Pipeline',
        entries: [{ text, timestamp: new Date() }],
        createdAt: new Date()
      });

      const candidate = new ConceptCandidate(batch, text, index);
      const normalized = candidate.normalize();
      
      console.log(`   Normalized: "${normalized.normalizedText}"`);
      
      // Step 1: Distillation
      console.log('   🔄 Distilling...');
      const distilled = await distillService.distill(normalized);
      
      console.log(`    Title: "${distilled.title}"`);
      console.log(`   Summary: "${distilled.summary.substring(0, 100)}..."`);
      
      // Step 2: Embedding 
      console.log('   🔄 Embedding...');
      const embedding = await embeddingService.embed(distilled);
      
      console.log(`   🔢 Vector dimensions: ${embedding.vector.length}`);
      console.log(`    First 5 values: [${embedding.vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`    Last 5 values: [${embedding.vector.slice(-5).map(v => v.toFixed(4)).join(', ')}]`);
      
      const magnitude = Math.sqrt(embedding.vector.reduce((sum, val) => sum + val * val, 0));
      console.log(`   📏 Magnitude: ${magnitude.toFixed(6)}`);
      
      // What is actually being embedded?
      const embeddedText = `${distilled.title}\n\n${distilled.summary}`;
      console.log(`    Embedded text length: ${embeddedText.length}`);
      console.log(`    Embedded text preview: "${embeddedText.substring(0, 100)}..."`);
      
      results.push({
        originalText: text,
        distilled,
        embedding,
        embeddedText,
        magnitude
      });
    }

    console.log('\\n Cross-Comparison Analysis:');
    
    // Compare similarities
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const similarity = calculateCosineSimilarity(results[i].embedding.vector, results[j].embedding.vector);
        
        console.log(`\\n Similarity ${i + 1} ↔ ${j + 1}: ${(similarity * 100).toFixed(2)}%`);
        console.log(`   A: "${results[i].distilled.title}"`);
        console.log(`   B: "${results[j].distilled.title}"`);
      }
    }

    console.log('\\n Analysis:');
    console.log('If all similarities are high, the problem is in distillation creating similar titles/summaries');
    console.log('If similarities are reasonable here but low in vector search, the problem is in search/storage');

  }, 120000);

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