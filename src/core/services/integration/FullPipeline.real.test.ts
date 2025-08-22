/**
 * Complete Pipeline Integration Test - FROM RAW OCR TO INTELLIGENT FOLDERS
 * 
 * This test simulates the complete user experience:
 * 1. Raw OCR text comes in from browser extension
 * 2. Text gets batched and processed 
 * 3. ConceptCandidates are created and normalized
 * 4. Distillation extracts key concepts
 * 5. Embedding generates vectors
 * 6. Intelligent routing decides folder placement
 * 7. Folder system organizes content academically
 * 
 * This is a REAL test with actual LLMs and vector database.
 */

import { randomUUID } from 'crypto';
import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import all pipeline components
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { SmartRouter } from '../impl/SmartRouter';
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { OpenAIIntelligentFolderService } from '../impl/OpenAIIntelligentFolderService';
import { FolderCentroidManager } from '../impl/FolderCentroidManager';
import { BatchSchema } from '../../contracts/schemas';
import { loadPipelineConfig } from '../../config/PipelineConfig';

// Environment setup
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

console.log('Test environment initialized');

// Raw OCR data from different academic contexts
const REALISTIC_OCR_SAMPLES = {
  mathTextbook: `
    Chapter 7: Linear Transformations
    
    7.1 Definition and Properties
    
    A linear transformation T: V → W between vector spaces preserves vector addition and scalar multiplication:
    
    T(u + v) = T(u) + T(v) for all u, v ∈ V
    T(cu) = cT(u) for all c ∈ ℝ and u ∈ V
    
    Example 7.1: Consider the transformation T: ℝ² → ℝ² defined by T(x, y) = (2x + y, x - y).
    We can verify this is linear by checking both properties.
    
    7.2 Matrix Representation
    
    Every linear transformation between finite-dimensional vector spaces can be represented by a matrix.
    If T: ℝⁿ → ℝᵐ is linear, then there exists an m × n matrix A such that T(x) = Ax for all x ∈ ℝⁿ.
  `,
  
  csLectureNotes: `
    CS 229: Machine Learning - Lecture 8
    Neural Networks and Backpropagation
    
    Today we'll cover:
    • Feedforward neural networks
    • Activation functions (sigmoid, ReLU, tanh)
    • Backpropagation algorithm
    • Gradient descent optimization
    
    Backpropagation Algorithm:
    1. Forward pass: compute activations layer by layer
    2. Backward pass: compute gradients using chain rule
    3. Update weights using gradient descent
    
    Mathematical foundation:
    ∂J/∂w = (∂J/∂a) · (∂a/∂z) · (∂z/∂w)
    
    Where J is loss, a is activation, z is weighted input, w is weight.
  `,
  
  physicsJournal: `
    Quantum Mechanics Fundamentals
    Published in Physical Review Letters
    
    Abstract:
    We present a comprehensive analysis of quantum superposition principles and their applications 
    to quantum computing systems. The time-dependent Schrödinger equation governs quantum evolution.
    
    Introduction:
    The fundamental postulate of quantum mechanics states that any quantum system can exist in 
    superposition of basis states. For a qubit system:
    
    |ψ⟩ = α|0⟩ + β|1⟩
    
    where |α|² + |β|² = 1 (normalization condition).
    
    Measurement causes wavefunction collapse, selecting one basis state with probability |α|² or |β|².
  `,
  
  biologyLab: `
    Lab Report: CRISPR-Cas9 Gene Editing Experiment
    Biology 485 - Molecular Genetics
    
    Objective: 
    Use CRISPR-Cas9 system to edit target gene in bacterial cells
    
    Background:
    CRISPR (Clustered Regularly Interspaced Short Palindromic Repeats) is a gene editing tool that:
    1. Uses guide RNA (gRNA) to target specific DNA sequences
    2. Cas9 nuclease cuts DNA at target site
    3. Cell's repair mechanisms insert desired changes
    
    Procedure:
    1. Design gRNA complementary to target sequence
    2. Transform bacteria with CRISPR plasmid
    3. Select successfully edited colonies
    4. Sequence DNA to confirm edits
    
    Results:
    87% editing efficiency observed
    No off-target effects detected
  `,
  
  economicsResearch: `
    Behavioral Economics: Cognitive Biases in Market Decision Making
    
    This study examines how psychological factors influence financial decisions.
    
    Key Findings:
    
    1. Anchoring Bias: Initial price strongly influences perceived value
    2. Loss Aversion: People feel losses 2.25x more strongly than gains
    3. Herding Behavior: Individuals follow crowd actions in uncertain markets
    
    Statistical Analysis:
    • Sample size: n = 1,247 participants
    • Confidence interval: 95%
    • p-value < 0.001 for all major findings
    
    Implications for Market Theory:
    Traditional rational actor models fail to predict actual trader behavior.
    Behavioral factors must be incorporated into economic models.
  `
};

// Test services
let qdrantClient: QdrantClient;
let distillService: OpenAIDistillationService;
let embeddingService: OpenAIEmbeddingService;
let vectorIndex: QdrantVectorIndexManager;
let intelligentService: OpenAIIntelligentFolderService;
let centroidManager: FolderCentroidManager;
let smartRouter: SmartRouter;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe(' COMPLETE PIPELINE TEST: Raw OCR → Intelligent Folders', () => {

  beforeAll(async () => {
    if (!OPENAI_API_KEY) {
      console.warn('Skipping REAL pipeline tests: OPENAI_API_KEY not set');
      return;
    }

    console.log(' Initializing COMPLETE PIPELINE test with REAL services...');

    // Initialize Qdrant
    qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false
    });

    // Clean up existing collections
    const collectionsToClean = ['full_pipeline_concepts', 'full_pipeline_folder_centroids'];
    for (const collection of collectionsToClean) {
      try {
        await qdrantClient.deleteCollection(collection);
      } catch {
        // Collection might not exist
      }
    }

    // Initialize all services with fast models for efficiency
    distillService = new OpenAIDistillationService({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo', // Fast for distillation
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
      collectionPrefix: 'full_pipeline'
    });

    // Initialize collections
    await vectorIndex.initialize();

    centroidManager = new FolderCentroidManager(vectorIndex);

    intelligentService = new OpenAIIntelligentFolderService(centroidManager, {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo', // Fast for background processing
      enableCaching: false,
      dailyTokenBudget: 100000
    });

    smartRouter = new SmartRouter(
      distillService,
      embeddingService,
      vectorIndex,
      intelligentService,
      loadPipelineConfig()
    );

    console.log(' All pipeline services initialized');
  }, 60000);

  afterAll(async () => {
    if (qdrantClient) {
      try {
        await qdrantClient.deleteCollection('full_pipeline_concepts');
        await qdrantClient.deleteCollection('full_pipeline_folder_centroids');
      } catch {
        // Ignore errors
      }
    }
  }, 30000);

  skipIfNoApiKey('📖 Complete Study Session: Math Textbook → Organized Concepts', async () => {
    console.log('\\n📖 TESTING: Complete pipeline from raw OCR math textbook\\n');

    // STEP 1: Simulate raw OCR text coming from browser extension
    const rawOcrText = REALISTIC_OCR_SAMPLES.mathTextbook;
    console.log(`Raw OCR input (${rawOcrText.length} characters):`);
    console.log(`   "${rawOcrText.substring(0, 100)}..."`);

    // STEP 2: Create batch from OCR (simulating browser extension)
    const batch = BatchSchema.parse({
      batchId: randomUUID(),
      window: 'Linear Algebra Textbook - Chapter 7',
      topic: 'Linear Transformations',
      entries: [{
        text: rawOcrText,
        timestamp: new Date(),
        metadata: {
          uri: 'https://textbook.math.edu/linear-algebra/chapter7'
        }
      }],
      createdAt: new Date()
    });

    console.log(`\\n📦 Batch created:`);
    console.log(`   - Batch ID: ${batch.batchId}`);
    console.log(`   - Window: ${batch.window}`);
    console.log(`   - Topic: ${batch.topic}`);

    // STEP 3: Extract concept candidates from batch
    const config = loadPipelineConfig();
    const candidate = new ConceptCandidate(batch, rawOcrText, 0, config);
    
    console.log(`\\n ConceptCandidate created:`);
    console.log(`   - Candidate ID: ${candidate.id}`);
    console.log(`   - Raw text length: ${candidate.rawText.length}`);
    console.log(`   - Source: ${candidate.getSourceInfo().window}`);

    // STEP 4: Normalize candidate (text preprocessing)
    const normalized = candidate.normalize();
    console.log(`\\n Text normalization:`);
    console.log(`   - Normalized length: ${normalized.normalizedText.length}`);
    console.log(`   - Content hash: ${normalized.contentHash.substring(0, 16)}...`);

    // STEP 5: Complete processing through SmartRouter
    const startTime = Date.now();
    console.log(`\\n⚡ Starting complete pipeline processing...`);
    
    const decision = await smartRouter.route(candidate);
    const processingTime = Date.now() - startTime;
    
    console.log(`\\n PIPELINE COMPLETE! Processed in ${processingTime}ms`);
    console.log(`\\n Final Results:`);
    console.log(`    Action: ${decision.action}`);
    console.log(`    Folder: ${decision.folderId || decision.newFolder?.name || 'N/A'}`);
    console.log(`    Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`    Reasoning: ${decision.explanation?.primarySignal || 'N/A'}`);
    console.log(`   🎖️ Academic Domain: ${decision.explanation?.academicDomain || 'N/A'}`);
    console.log(`    System State: ${decision.explanation?.systemState || 'N/A'}`);

    // Verify results
    expect(decision.action).toBeOneOf(['route', 'create_folder']);
    expect(decision.confidence).toBeGreaterThan(0.7);
    expect(processingTime).toBeLessThan(30000); // Background processing can take time
    expect(decision.explanation?.academicDomain).toBeDefined();

  }, 120000);

  skipIfNoApiKey(' Multi-Domain Study Session: Realistic Academic Workflow', async () => {
    console.log('\\n TESTING: Multi-domain study session (CS → Physics → Biology → Economics)\\n');

    const studySessions = [
      { name: 'CS Lecture', text: REALISTIC_OCR_SAMPLES.csLectureNotes, expectedDomain: 'computer_science' },
      { name: 'Physics Journal', text: REALISTIC_OCR_SAMPLES.physicsJournal, expectedDomain: 'physics' },
      { name: 'Biology Lab', text: REALISTIC_OCR_SAMPLES.biologyLab, expectedDomain: 'biology' },
      { name: 'Economics Research', text: REALISTIC_OCR_SAMPLES.economicsResearch, expectedDomain: 'economics' }
    ];

    const results = [];
    let totalProcessingTime = 0;

    for (const [index, session] of studySessions.entries()) {
      console.log(`\\n[${index + 1}/4] Processing ${session.name}...`);
      
      // Create batch for this study material
      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: session.name,
        topic: 'Multi-Domain Study',
        entries: [{
          text: session.text,
          timestamp: new Date()
        }],
        createdAt: new Date()
      });

      // Process through complete pipeline
      const candidate = new ConceptCandidate(batch, session.text, 0);
      const startTime = Date.now();
      
      const decision = await smartRouter.route(candidate);
      const sessionTime = Date.now() - startTime;
      totalProcessingTime += sessionTime;

      console.log(`    ${session.name} processed in ${sessionTime}ms`);
      console.log(`    Folder: ${decision.folderId || decision.newFolder?.name}`);
      console.log(`    Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
      console.log(`    Domain: ${decision.explanation?.academicDomain}`);

      results.push({
        session: session.name,
        decision,
        processingTime: sessionTime,
        expectedDomain: session.expectedDomain
      });
    }

    console.log(`\\n Multi-Domain Study Session Analysis:`);
    console.log(`   ⏱️  Total processing time: ${totalProcessingTime}ms`);
    console.log(`    Average time per session: ${Math.round(totalProcessingTime / studySessions.length)}ms`);
    
    const avgConfidence = results.reduce((sum, r) => sum + r.decision.confidence, 0) / results.length;
    console.log(`    Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    
    const uniqueFolders = new Set(results.map(r => r.decision.folderId || r.decision.newFolder?.name));
    console.log(`    Unique folders created: ${uniqueFolders.size}`);
    
    const domains = new Set(results.map(r => r.decision.explanation?.academicDomain).filter(Boolean));
    console.log(`   🎓 Academic domains covered: ${Array.from(domains).join(', ')}`);

    // Verify academic intelligence
    expect(avgConfidence).toBeGreaterThan(0.7);
    expect(uniqueFolders.size).toBeGreaterThanOrEqual(3); // Should create multiple folders
    expect(domains.size).toBeGreaterThanOrEqual(3); // Should recognize multiple domains
    
    console.log(`\\n Multi-domain pipeline successfully demonstrated academic intelligence!`);

  }, 240000);

  skipIfNoApiKey(' Complete Knowledge Organization: Folder System Evolution', async () => {
    console.log('\\n TESTING: Complete knowledge organization system\\n');

    // Process several concepts to build up folder system
    const knowledgeItems = [
      'Eigenvalue decomposition: A = QΛQ⁻¹ where Q contains eigenvectors and Λ is diagonal matrix of eigenvalues',
      'Convolutional layers detect local features through learnable filters with shared weights across spatial dimensions',
      'Quantum entanglement creates correlated particle pairs where measuring one instantly affects the other',
      'Gene regulatory networks control protein expression through transcription factor binding sites',
      'Market efficiency hypothesis states that asset prices reflect all available information instantaneously'
    ];

    const organizationResults = [];

    for (const [index, knowledge] of knowledgeItems.entries()) {
      console.log(`\\n[${index + 1}/5] Organizing: "${knowledge.substring(0, 50)}..."`);
      
      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Knowledge Organization Test',
        topic: 'Academic Concepts',
        entries: [{ text: knowledge, timestamp: new Date() }],
        createdAt: new Date()
      });

      const candidate = new ConceptCandidate(batch, knowledge, index);
      const decision = await smartRouter.route(candidate);
      
      console.log(`    Organized into: ${decision.folderId || decision.newFolder?.name}`);
      console.log(`    Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
      
      organizationResults.push(decision);
    }

    // Analyze folder organization
    const folderNames = organizationResults.map(r => r.folderId || r.newFolder?.name);
    const uniqueFolders = new Set(folderNames.filter(Boolean));
    
    console.log(`\\n Knowledge Organization Analysis:`);
    console.log(`    Total folders created: ${uniqueFolders.size}`);
    console.log(`    Folder names: ${Array.from(uniqueFolders).join(', ')}`);
    
    const avgConfidence = organizationResults.reduce((sum, r) => sum + r.confidence, 0) / organizationResults.length;
    console.log(`    Average organization confidence: ${(avgConfidence * 100).toFixed(1)}%`);

    // Get system statistics
    const stats = await smartRouter.getRoutingStats();
    console.log(`\\n Final System Statistics:`);
    console.log(`    Total concepts routed: ${stats.totalRouted}`);
    console.log(`    Overall average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);

    expect(uniqueFolders.size).toBeGreaterThanOrEqual(3);
    expect(avgConfidence).toBeGreaterThan(0.7);
    expect(stats.totalRouted).toBeGreaterThan(0);

    console.log(`\\n COMPLETE PIPELINE TEST SUCCESSFUL!`);
    console.log(`✨ Raw OCR → Intelligent Academic Organization working perfectly!`);

  }, 180000);

});