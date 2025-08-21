/**
 * DEBUG: Test Qdrant upsert directly to understand the Bad Request error
 */

import { describe, test, beforeAll } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config();

const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

describe(' QDRANT UPSERT DEBUG', () => {

  test(' Debug Qdrant upsert issue', async () => {
    console.log('\\n DEBUGGING: Qdrant upsert Bad Request\\n');

    const client = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false
    });

    // Clean and create test collection
    try {
      await client.deleteCollection('qdrant_debug');
    } catch {}

    await client.createCollection('qdrant_debug', {
      vectors: {
        size: 1536,
        distance: 'Cosine'
      }
    });

    console.log(' Test collection created');

    // Try different ID formats
    const testCases = [
      { id: 'candidate-abc123', desc: 'String with dash' },
      { id: 'candidate_abc123', desc: 'String with underscore' },
      { id: 'candidateabc123', desc: 'Plain string' },
      { id: '123', desc: 'Numeric string' },
      { id: 12345, desc: 'Actual number' }
    ];

    const testVector = Array(1536).fill(0.1);
    const testPayload = { test: true, folder_id: 'test-folder' };

    for (const testCase of testCases) {
      try {
        console.log(`Testing ID format: ${testCase.desc} (${testCase.id})`);
        
        await client.upsert('qdrant_debug', {
          wait: true,
          points: [{
            id: testCase.id,
            vector: testVector,
            payload: testPayload
          }]
        });
        
        console.log(`   SUCCESS: ${testCase.desc}`);
      } catch (error) {
        console.log(`   FAILED: ${testCase.desc} - ${error.message}`);
      }
    }

    // Clean up
    await client.deleteCollection('qdrant_debug');
    console.log('\\n Test collection cleaned up');

  }, 30000);

});