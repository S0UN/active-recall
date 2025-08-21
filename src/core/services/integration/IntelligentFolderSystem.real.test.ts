/**
 * REAL Integration Test for Intelligent Folder System
 * 
 * This test simulates the actual pipeline with properly distilled content,
 * testing the complete flow with real titles and summaries.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as dotenvConfig } from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';

// Services
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { SmartRouter } from '../impl/SmartRouter';
import { FolderCentroidManager } from '../impl/FolderCentroidManager';
import { OpenAIIntelligentFolderService } from '../impl/OpenAIIntelligentFolderService';

// Contracts
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { BatchSchema, DistilledContent, VectorEmbeddings } from '../../contracts/schemas';

// Load environment variables
dotenvConfig();

// Test configuration
const TEST_COLLECTION = 'test_intelligent_real_system';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

// Skip tests if API key not available
const skipIfNoApiKey = !OPENAI_API_KEY ? it.skip : it;

/**
 * Realistic academic content that would come from screen captures
 * Simulating what a student might be studying
 */
const REALISTIC_STUDY_CONTENT = {
  // Linear Algebra study session
  linearAlgebra: [
    {
      raw: 'Linear Transformations A linear transformation T: V → W between vector spaces preserves vector addition and scalar multiplication. For all vectors u, v in V and scalar c: T(u + v) = T(u) + T(v) and T(cu) = cT(u). Examples include rotation matrices, reflection operators, and projection maps.',
      expectedTitle: 'Linear Transformations',
      expectedDomain: 'mathematics'
    },
    {
      raw: 'Eigenvalues and Eigenvectors For a square matrix A, a non-zero vector v is an eigenvector if Av = λv for some scalar λ (eigenvalue). To find eigenvalues: solve det(A - λI) = 0. Eigenvectors form eigenspaces. Applications: Principal Component Analysis, quantum mechanics, vibration analysis.',
      expectedTitle: 'Eigenvalues and Eigenvectors',
      expectedDomain: 'mathematics'
    },
    {
      raw: 'Matrix Decomposition - SVD Singular Value Decomposition: A = UΣV* where U and V are unitary matrices, Σ is diagonal with singular values. Every matrix has an SVD. Used for: dimensionality reduction, image compression, recommendation systems. Related to eigendecomposition but works for non-square matrices.',
      expectedTitle: 'Singular Value Decomposition',
      expectedDomain: 'mathematics'
    }
  ],

  // Machine Learning study session
  machineLearning: [
    {
      raw: 'Gradient Descent Optimization Gradient descent minimizes loss function by iteratively moving in direction of steepest descent. Update rule: θ = θ - α∇L(θ) where α is learning rate. Variants: Batch GD (all data), Stochastic GD (single sample), Mini-batch GD (subset). Challenges: local minima, saddle points, choosing learning rate.',
      expectedTitle: 'Gradient Descent Optimization',
      expectedDomain: 'computer_science'
    },
    {
      raw: 'Backpropagation Algorithm Backprop computes gradients of loss with respect to weights using chain rule. Forward pass: compute activations layer by layer. Backward pass: compute gradients from output to input. Key insight: reuse computed values. Enables training deep neural networks efficiently.',
      expectedTitle: 'Backpropagation Algorithm',
      expectedDomain: 'computer_science'
    },
    {
      raw: 'Convolutional Neural Networks CNNs use convolution operation for feature extraction from grid-like data. Architecture: Conv layers (feature maps) → Pooling (downsampling) → Fully connected. Key concepts: receptive field, weight sharing, translation invariance. Applications: image classification, object detection, segmentation.',
      expectedTitle: 'Convolutional Neural Networks',
      expectedDomain: 'computer_science'
    }
  ],

  // Quantum Physics study session
  quantumPhysics: [
    {
      raw: 'Wave-Particle Duality Light and matter exhibit both wave and particle properties. Double-slit experiment: single photons create interference pattern over time. De Broglie wavelength: λ = h/p relates wave and particle nature. Complementarity principle: wave and particle descriptions are complementary, not contradictory.',
      expectedTitle: 'Wave-Particle Duality',
      expectedDomain: 'physics'
    },
    {
      raw: 'Schrödinger Equation Time-dependent: iℏ∂Ψ/∂t = ĤΨ describes quantum system evolution. Time-independent: ĤΨ = EΨ for stationary states. Wave function Ψ contains all information about system. |Ψ|² gives probability density. Solutions: particle in box, harmonic oscillator, hydrogen atom.',
      expectedTitle: 'Schrödinger Equation',
      expectedDomain: 'physics'
    },
    {
      raw: 'Quantum Entanglement Entangled particles remain correlated regardless of separation distance. Bell\'s theorem: no local hidden variable theory can reproduce quantum predictions. EPR paradox highlighted "spooky action at a distance". Applications: quantum computing, quantum cryptography, quantum teleportation.',
      expectedTitle: 'Quantum Entanglement',
      expectedDomain: 'physics'
    }
  ],

  // Molecular Biology study session
  molecularBiology: [
    {
      raw: 'DNA Replication Process Semiconservative replication: each strand serves as template. Steps: 1) Helicase unwinds double helix 2) Primase adds RNA primers 3) DNA polymerase III extends primers 5\'→3\' 4) DNA polymerase I replaces primers 5) Ligase joins Okazaki fragments. Leading strand continuous, lagging strand discontinuous.',
      expectedTitle: 'DNA Replication Process',
      expectedDomain: 'biology'
    },
    {
      raw: 'Protein Synthesis Translation mRNA → protein synthesis at ribosomes. Initiation: ribosome assembles at start codon (AUG). Elongation: tRNAs bring amino acids, peptide bonds form. Termination: stop codon releases polypeptide. Post-translational modifications: folding, phosphorylation, glycosylation determine final function.',
      expectedTitle: 'Protein Synthesis and Translation',
      expectedDomain: 'biology'
    },
    {
      raw: 'CRISPR-Cas9 Gene Editing CRISPR: Clustered Regularly Interspaced Short Palindromic Repeats. Cas9 nuclease cuts DNA at specific location guided by guide RNA (gRNA). Cell repairs break by: non-homologous end joining (gene knockout) or homology-directed repair (gene insertion). Applications: disease treatment, crop improvement, research tools.',
      expectedTitle: 'CRISPR-Cas9 Gene Editing',
      expectedDomain: 'biology'
    }
  ],

  // Cross-disciplinary content
  interdisciplinary: [
    {
      raw: 'Mathematical Biology - Population Dynamics Lotka-Volterra equations model predator-prey interactions: dx/dt = ax - bxy (prey), dy/dt = -cy + dxy (predator). Exhibits oscillatory behavior, limit cycles. Extensions: competition models, disease spread (SIR model), evolutionary game theory. Combines differential equations with ecological principles.',
      expectedTitle: 'Population Dynamics Modeling',
      expectedDomain: 'interdisciplinary'
    },
    {
      raw: 'Quantum Computing Fundamentals Qubits exist in superposition: |ψ⟩ = α|0⟩ + β|1⟩ where |α|² + |β|² = 1. Quantum gates: Pauli gates (X,Y,Z), Hadamard (superposition), CNOT (entanglement). Quantum algorithms: Shor\'s (factoring), Grover\'s (search). Challenges: decoherence, error correction, scalability.',
      expectedTitle: 'Quantum Computing Fundamentals',
      expectedDomain: 'computer_science' // or physics
    },
    {
      raw: 'Computational Neuroscience - Neural Coding How neurons encode information: rate coding (firing frequency), temporal coding (spike timing), population coding (ensemble activity). Hodgkin-Huxley model describes action potential generation. Synaptic plasticity: LTP/LTD underlie learning. Combines neurobiology, mathematics, and computer science.',
      expectedTitle: 'Neural Coding in Computational Neuroscience',
      expectedDomain: 'interdisciplinary'
    }
  ]
};

// Store processed concepts for analysis at module level
const processedConcepts: Array<{
  original: string;
  distilled: DistilledContent;
  embeddings: VectorEmbeddings;
  decision: any;
}> = [];

// Helper function to normalize candidate for distillation
function createNormalizedCandidate(candidate: ConceptCandidate) {
  const normalized = candidate.normalize();
  return {
    ...candidate,
    normalizedText: normalized.normalizedText,
    contentHash: normalized.contentHash
  };
}

describe('REAL Intelligent Folder System Pipeline Test', () => {
  let qdrantClient: QdrantClient;
  let distillService: OpenAIDistillationService;
  let embeddingService: OpenAIEmbeddingService;
  let vectorIndex: QdrantVectorIndexManager;
  let centroidManager: FolderCentroidManager;
  let intelligentService: OpenAIIntelligentFolderService;
  let smartRouter: SmartRouter;

  beforeAll(async () => {
    if (!OPENAI_API_KEY) {
      console.warn('Skipping REAL integration tests: OPENAI_API_KEY not set');
      return;
    }

    console.log(' Initializing REAL Intelligent Folder System Test...');

    // Initialize Qdrant
    qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    }, {
      checkCompatibility: false // Disable version check
    });

    // Clean up existing collections first
    const collectionsToClean = ['intelligent_real_system_concepts', 'intelligent_real_system_folder_centroids'];
    for (const collection of collectionsToClean) {
      try {
        await qdrantClient.deleteCollection(collection);
      } catch {
        // Collection might not exist
      }
    }

    // Initialize all services
    distillService = new OpenAIDistillationService({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      cacheEnabled: false
    });

    embeddingService = new OpenAIEmbeddingService({
      apiKey: OPENAI_API_KEY,
      model: 'text-embedding-3-small'
    });

    vectorIndex = new QdrantVectorIndexManager({
      provider: 'qdrant',
      host: QDRANT_HOST,
      port: QDRANT_PORT,
      dimensions: 1536,
      collectionPrefix: 'intelligent_real_system' // Match collection name
    });

    centroidManager = new FolderCentroidManager(vectorIndex);

    intelligentService = new OpenAIIntelligentFolderService(centroidManager, {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      enableCaching: false,
      dailyTokenBudget: 50000 // Enough for testing
    });

    smartRouter = new SmartRouter(
      distillService,
      embeddingService,
      vectorIndex,
      intelligentService
    );

    // Initialize vector index (creates collections)
    await vectorIndex.initialize();
    
    await vectorIndex.isReady();
    console.log(' All services initialized successfully');
  }, 120000);

  afterAll(async () => {
    if (qdrantClient) {
      try {
        await qdrantClient.deleteCollection(TEST_COLLECTION);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe(' Phase 1: Bootstrap with Initial Study Content', () => {
    skipIfNoApiKey('should intelligently organize initial mixed academic content', async () => {
      console.log('\n PHASE 1: Testing Bootstrap Mode with Mixed Academic Content\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Study Session',
        topic: 'Mixed Academic Content',
        entries: [],
        createdAt: new Date()
      });

      // Take first concept from each domain for bootstrap
      const initialContent = [
        REALISTIC_STUDY_CONTENT.linearAlgebra[0],
        REALISTIC_STUDY_CONTENT.machineLearning[0],
        REALISTIC_STUDY_CONTENT.quantumPhysics[0],
        REALISTIC_STUDY_CONTENT.molecularBiology[0],
        REALISTIC_STUDY_CONTENT.interdisciplinary[0]
      ];

      console.log('Processing initial concepts for bootstrap:');
      const candidates = initialContent.map((content, i) => 
        new ConceptCandidate(batch, content.raw, i)
      );

      // Process through actual distillation
      for (const candidate of candidates) {
        console.log(`\n  Distilling concept ${candidates.indexOf(candidate) + 1}/${candidates.length}...`);
        
        // NORMALIZE CANDIDATE FIRST (required for distillation)
        const normalized = candidate.normalize();
        console.log(`     Normalized: "${normalized.normalizedText.substring(0, 80)}..."`);
        
        // ACTUAL DISTILLATION (using normalized candidate)
        const distilled = await distillService.distill(createNormalizedCandidate(candidate));
        console.log(`     Title: "${distilled.title}"`);
        console.log(`     Summary: "${distilled.summary.substring(0, 100)}..."`);
        
        // ACTUAL EMBEDDING
        const embeddings = await embeddingService.embed(distilled);
        console.log(`    🔢 Embedded (${embeddings.dimensions} dimensions)`);
        
        // ACTUAL ROUTING WITH INTELLIGENT SERVICE
        const decision = await smartRouter.route(candidate);
        console.log(`     Decision: ${decision.action} (confidence: ${decision.confidence.toFixed(2)})`);
        console.log(`     Reasoning: ${decision.explanation.primarySignal}`);
        
        processedConcepts.push({
          original: concept.rawText,
          distilled,
          embeddings,
          decision
        });
      }

      // Analyze bootstrap results
      console.log('\n Bootstrap Analysis:');
      const uniqueFolders = new Set(processedConcepts
        .filter(p => p.decision.action === 'route')
        .map(p => p.decision.folderId));
      
      console.log(`  - Concepts processed: ${processedConcepts.length}`);
      console.log(`  - Unique folders created: ${uniqueFolders.size}`);
      console.log(`  - Average confidence: ${(processedConcepts.reduce((sum, p) => sum + p.decision.confidence, 0) / processedConcepts.length).toFixed(2)}`);
      
      // Verify intelligent organization
      expect(uniqueFolders.size).toBeGreaterThanOrEqual(2); // Should create multiple folders
      expect(processedConcepts.every(p => p.distilled.title)).toBe(true); // All should have titles
      expect(processedConcepts.every(p => p.decision.confidence > 0.5)).toBe(true); // Reasonable confidence
    }, 300000); // 5 minute timeout
  });

  describe(' Phase 2: Domain-Specific Routing', () => {
    skipIfNoApiKey('should correctly route Linear Algebra concepts together', async () => {
      console.log('\n PHASE 2: Testing Domain-Specific Routing for Linear Algebra\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Linear Algebra Study',
        topic: 'Linear Algebra',
        entries: [],
        createdAt: new Date()
      });

      const linearAlgebraConcepts = REALISTIC_STUDY_CONTENT.linearAlgebra.slice(1); // Skip first (used in bootstrap)
      console.log(`Processing ${linearAlgebraConcepts.length} Linear Algebra concepts:`);

      const laResults = [];
      for (const content of linearAlgebraConcepts) {
        const candidate = new ConceptCandidate(batch, content.raw, 0);
        
        console.log(`\n  Processing: "${content.raw.substring(0, 50)}..."`);
        
        // Full pipeline
        const distilled = await distillService.distill(createNormalizedCandidate(candidate));
        console.log(`    Title: "${distilled.title}"`);
        
        const embeddings = await embeddingService.embed(distilled);
        const decision = await smartRouter.route(candidate);
        
        console.log(`    Routed to: ${decision.folderId || 'unsorted'} (${decision.confidence.toFixed(2)} confidence)`);
        console.log(`    Reasoning: ${decision.explanation.primarySignal}`);
        
        laResults.push({ content, distilled, decision });
      }

      // Verify they're routed to same/related folders
      const folders = laResults.map(r => r.decision.folderId);
      const uniqueFolders = new Set(folders);
      
      console.log(`\n  Linear Algebra routing consistency: ${uniqueFolders.size} unique folders for ${laResults.length} concepts`);
      
      // Should mostly go to same folder or closely related folders
      expect(uniqueFolders.size).toBeLessThanOrEqual(2);
      
      // Check for math domain recognition
      const mathMentions = laResults.filter(r => 
        r.decision.explanation.primarySignal.toLowerCase().includes('math') ||
        r.decision.explanation.primarySignal.toLowerCase().includes('algebra')
      );
      expect(mathMentions.length).toBeGreaterThan(0);
    }, 180000);

    skipIfNoApiKey('should correctly route Machine Learning concepts together', async () => {
      console.log('\n🤖 Testing Domain-Specific Routing for Machine Learning\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'ML Study',
        topic: 'Machine Learning',
        entries: [],
        createdAt: new Date()
      });

      const mlConcepts = REALISTIC_STUDY_CONTENT.machineLearning.slice(1);
      const mlResults = [];

      for (const content of mlConcepts) {
        const candidate = new ConceptCandidate(batch, content.raw, 0);
        
        const distilled = await distillService.distill(createNormalizedCandidate(candidate));
        const embeddings = await embeddingService.embed(distilled);
        const decision = await smartRouter.route(candidate);
        
        console.log(`  "${distilled.title}" → ${decision.folderId || 'unsorted'} (${decision.confidence.toFixed(2)})`);
        
        mlResults.push({ content, distilled, decision });
      }

      // Check consistency
      const folders = new Set(mlResults.map(r => r.decision.folderId));
      expect(folders.size).toBeLessThanOrEqual(2);
    }, 180000);
  });

  describe(' Phase 3: Duplicate Detection', () => {
    skipIfNoApiKey('should detect duplicate concepts with different wording', async () => {
      console.log('\n PHASE 3: Testing Duplicate Detection\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Duplicate Test',
        topic: 'Testing',
        entries: [],
        createdAt: new Date()
      });

      // Original concept
      const original = 'Eigenvalues are scalars λ such that for matrix A and vector v: Av = λv. The vector v is called an eigenvector.';
      const candidate1 = new ConceptCandidate(batch, original, 0);
      
      console.log('Adding original concept...');
      const distilled1 = await distillService.distill(createNormalizedCandidate(candidate1));
      const decision1 = await smartRouter.route(candidate1);
      console.log(`  Original: "${distilled1.title}" → ${decision1.action}`);
      
      // Paraphrased duplicate
      const paraphrase = 'For a matrix A, eigenvectors are vectors v where Av equals λ times v for some scalar λ called the eigenvalue.';
      const candidate2 = new ConceptCandidate(batch, paraphrase, 1);
      
      console.log('\nAdding paraphrased version...');
      const distilled2 = await distillService.distill(createNormalizedCandidate(candidate2));
      const decision2 = await smartRouter.route(candidate2);
      console.log(`  Paraphrase: "${distilled2.title}" → ${decision2.action}`);
      
      // Should detect as duplicate
      expect(decision2.action).toBe('duplicate');
      expect(decision2.confidence).toBeGreaterThan(0.8);
      console.log(`   Duplicate detected with ${decision2.confidence.toFixed(2)} confidence`);
    }, 120000);
  });

  describe(' Phase 4: Cross-Domain Relationships', () => {
    skipIfNoApiKey('should discover relationships between Linear Algebra and Machine Learning', async () => {
      console.log('\n PHASE 4: Testing Cross-Domain Discovery\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Interdisciplinary Study',
        topic: 'Cross-Domain',
        entries: [],
        createdAt: new Date()
      });

      // Related concepts from different domains
      const relatedConcepts = [
        {
          content: 'Principal Component Analysis (PCA) uses eigendecomposition of covariance matrix to find directions of maximum variance.',
          expectedConnection: 'linear algebra + machine learning'
        },
        {
          content: 'Support Vector Machines use kernel trick to project data into higher dimensional space where linear separation is possible.',
          expectedConnection: 'linear algebra + machine learning'
        },
        {
          content: 'Fourier transforms decompose signals into frequency components, fundamental in quantum mechanics wave function analysis.',
          expectedConnection: 'mathematics + physics'
        }
      ];

      console.log('Processing interdisciplinary concepts:');
      for (const item of relatedConcepts) {
        const candidate = new ConceptCandidate(batch, item.content, 0);
        
        const distilled = await distillService.distill(createNormalizedCandidate(candidate));
        const embeddings = await embeddingService.embed(distilled);
        const decision = await smartRouter.route(candidate);
        
        console.log(`\n  "${distilled.title}"`);
        console.log(`    Expected: ${item.expectedConnection}`);
        console.log(`    Decision: ${decision.action} to ${decision.folderId || 'new'}`);
        console.log(`    Reasoning: ${decision.explanation.primarySignal}`);
        
        // Check for cross-domain recognition
        const factors = decision.explanation.decisionFactors || [];
        const mentionsMultipleDomains = factors.some(f => 
          f.includes('cross') || f.includes('inter') || f.includes('related')
        );
        
        if (mentionsMultipleDomains) {
          console.log(`     Cross-domain relationship recognized`);
        }
      }
    }, 180000);
  });

  describe(' Phase 5: System Statistics and Performance', () => {
    skipIfNoApiKey('should provide meaningful statistics after processing', async () => {
      console.log('\n PHASE 5: System Statistics\n');

      // Get routing statistics
      const stats = await smartRouter.getRoutingStats();
      console.log('Routing Statistics:');
      console.log(`  - Total routed: ${stats.totalRouted}`);
      console.log(`  - Duplicates found: ${stats.duplicatesFound}`);
      console.log(`  - Folders created: ${stats.foldersCreated}`);
      console.log(`  - Unsorted count: ${stats.unsortedCount}`);
      console.log(`  - Average confidence: ${stats.averageConfidence.toFixed(2)}`);
      
      // Get token usage
      const tokenStats = await intelligentService.getUsageStats();
      console.log('\nToken Usage:');
      console.log(`  - Daily tokens used: ${tokenStats.dailyTokensUsed}`);
      console.log(`  - Average per decision: ${tokenStats.averageTokensPerDecision}`);
      console.log(`  - Remaining budget: ${tokenStats.remainingDailyBudget}`);
      
      // Get centroid statistics
      const centroidStats = await centroidManager.getStatistics();
      console.log('\nCentroid Statistics:');
      console.log(`  - Total folders: ${centroidStats.totalFolders}`);
      console.log(`  - Folders with centroids: ${centroidStats.foldersWithCentroids}`);
      console.log(`  - Average quality: ${centroidStats.averageQuality.toFixed(2)}`);
      
      // Verify system is functioning well
      expect(stats.totalRouted).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0.6);
      expect(tokenStats.remainingDailyBudget).toBeGreaterThan(0);
    }, 60000);
  });

  describe(' Final Validation: Complete Study Session Simulation', () => {
    skipIfNoApiKey('should handle realistic study session with mixed content', async () => {
      console.log('\n FINAL TEST: Complete Study Session Simulation\n');
      console.log('Simulating a student studying multiple topics in one session...\n');

      const batch = BatchSchema.parse({
        batchId: randomUUID(),
        window: 'Evening Study Session',
        topic: 'Mixed Study',
        entries: [],
        createdAt: new Date()
      });

      // Simulate realistic study pattern - jumping between topics
      const studySequence = [
        REALISTIC_STUDY_CONTENT.linearAlgebra[2],     // SVD
        REALISTIC_STUDY_CONTENT.machineLearning[2],   // CNNs
        REALISTIC_STUDY_CONTENT.linearAlgebra[1],     // Back to eigenvalues
        REALISTIC_STUDY_CONTENT.quantumPhysics[1],    // Schrödinger
        REALISTIC_STUDY_CONTENT.interdisciplinary[1], // Quantum computing
        REALISTIC_STUDY_CONTENT.molecularBiology[2],  // CRISPR
      ];

      console.log('Study sequence (simulating topic switching):');
      const sessionResults = [];

      for (let i = 0; i < studySequence.length; i++) {
        const content = studySequence[i];
        const candidate = new ConceptCandidate(batch, content.raw, i);
        
        console.log(`\n[${i + 1}/${studySequence.length}] Studying: "${content.raw.substring(0, 40)}..."`);
        
        // Full pipeline with timing
        const startTime = Date.now();
        
        const distilled = await distillService.distill(createNormalizedCandidate(candidate));
        const embeddings = await embeddingService.embed(distilled);
        const decision = await smartRouter.route(candidate);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`   Processed in ${processingTime}ms`);
        console.log(`   Title: "${distilled.title}"`);
        console.log(`   Folder: ${decision.folderId || 'unsorted'}`);
        console.log(`   Confidence: ${decision.confidence.toFixed(2)}`);
        
        sessionResults.push({
          content,
          distilled,
          decision,
          processingTime
        });
      }

      // Analyze session results
      console.log('\n Study Session Analysis:');
      
      const avgProcessingTime = sessionResults.reduce((sum, r) => sum + r.processingTime, 0) / sessionResults.length;
      console.log(`  - Average processing time: ${avgProcessingTime.toFixed(0)}ms`);
      
      const avgConfidence = sessionResults.reduce((sum, r) => sum + r.decision.confidence, 0) / sessionResults.length;
      console.log(`  - Average routing confidence: ${avgConfidence.toFixed(2)}`);
      
      const folders = new Set(sessionResults.map(r => r.decision.folderId));
      console.log(`  - Unique folders used: ${folders.size}`);
      
      const domains = new Map();
      sessionResults.forEach(r => {
        const domain = r.content.expectedDomain;
        domains.set(domain, (domains.get(domain) || 0) + 1);
      });
      console.log(`  - Domains covered: ${Array.from(domains.keys()).join(', ')}`);
      
      // Performance expectations (GPT-3.5-turbo is faster)
      expect(avgProcessingTime).toBeLessThan(10000); // Under 10 seconds per concept with GPT-3.5-turbo
      expect(avgConfidence).toBeGreaterThan(0.65); // Good confidence overall
      expect(folders.size).toBeGreaterThanOrEqual(3); // Multiple folders for different domains
      
      console.log('\n Complete study session processed successfully!');
    }, 600000); // 10 minute timeout for complete session
  });
});

// Summary report at the end
afterAll(() => {
  if (processedConcepts.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log(' FINAL TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total concepts processed: ${processedConcepts.length}`);
    console.log(`Unique folders created: ${new Set(processedConcepts.map(p => p.decision.folderId)).size}`);
    console.log(`Average confidence: ${(processedConcepts.reduce((sum, p) => sum + p.decision.confidence, 0) / processedConcepts.length).toFixed(2)}`);
    console.log('='.repeat(60));
  }
});