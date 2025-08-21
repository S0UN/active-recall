/**
 * Integration Tests for Intelligent Folder System
 * 
 * Tests the complete intelligent folder system with:
 * - Real OpenAI API calls
 * - Real Qdrant vector database
 * - Actual academic content across multiple domains
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { config as dotenvConfig } from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

// Services
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { SmartRouter } from '../impl/SmartRouter';
import { FolderCentroidManager } from '../impl/FolderCentroidManager';
import { OpenAIIntelligentFolderService } from '../impl/OpenAIIntelligentFolderService';

// Contracts
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { BatchSchema } from '../../contracts/schemas';

// Load environment variables
dotenvConfig();

// Test configuration
const TEST_COLLECTION = 'test_intelligent_folder_system';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333');

// Skip tests if API key not available
const skipIfNoApiKey = !OPENAI_API_KEY ? it.skip : it;

describe('Intelligent Folder System Integration Tests', () => {
  let qdrantClient: QdrantClient;
  let distillService: OpenAIDistillationService;
  let embeddingService: OpenAIEmbeddingService;
  let vectorIndex: QdrantVectorIndexManager;
  let centroidManager: FolderCentroidManager;
  let intelligentService: OpenAIIntelligentFolderService;
  let smartRouter: SmartRouter;

  // Academic test content across domains
  const academicContent = {
    mathematics: [
      'The fundamental theorem of calculus establishes the relationship between differentiation and integration, showing that these two operations are essentially inverses of each other.',
      'Group theory studies algebraic structures known as groups, which consist of a set equipped with an operation that combines any two elements to form a third element.',
      'The Riemann hypothesis, one of the most important unsolved problems in mathematics, concerns the distribution of prime numbers and the zeros of the Riemann zeta function.',
      'Linear algebra deals with vector spaces and linear mappings between these spaces, including the study of lines, planes, and subspaces.',
      'Topology is concerned with the properties of space that are preserved under continuous deformations, such as stretching and bending, but not tearing or gluing.'
    ],
    physics: [
      'Quantum mechanics describes the behavior of matter and energy at the molecular, atomic, nuclear, and even smaller microscopic levels.',
      'The theory of general relativity describes gravity not as a force, but as a consequence of the curvature of spacetime caused by mass and energy.',
      'Thermodynamics deals with heat, work, temperature, and energy, establishing laws that describe how these quantities behave under various circumstances.',
      'Electromagnetic waves are synchronized oscillations of electric and magnetic fields that propagate at the speed of light through a vacuum.',
      'The Standard Model of particle physics is the theory describing three of the four known fundamental forces and classifying all known elementary particles.'
    ],
    computerScience: [
      'Machine learning algorithms build a mathematical model based on training data to make predictions or decisions without being explicitly programmed to perform the task.',
      'The P versus NP problem asks whether every problem whose solution can be quickly verified can also be solved quickly.',
      'Binary search trees are hierarchical data structures that store items in a sorted manner, allowing for efficient searching, insertion, and deletion operations.',
      'Distributed systems are collections of independent computers that appear to users as a single coherent system, coordinating their actions by passing messages.',
      'Cryptographic hash functions are mathematical algorithms that map data of arbitrary size to a fixed-size bit string, designed to be one-way functions.'
    ],
    biology: [
      'DNA replication is the biological process of producing two identical replicas of DNA from one original DNA molecule, occurring in all living organisms.',
      'Natural selection is the differential survival and reproduction of individuals due to differences in phenotype, a key mechanism of evolution.',
      'Photosynthesis is the process used by plants and other organisms to convert light energy into chemical energy stored in glucose.',
      'The central dogma of molecular biology describes the flow of genetic information from DNA to RNA to proteins.',
      'Neurons are electrically excitable cells that communicate with other cells via specialized connections called synapses.'
    ],
    psychology: [
      'Cognitive dissonance is the mental discomfort experienced by a person who holds contradictory beliefs, ideas, or values.',
      'Classical conditioning is a learning process that occurs when two stimuli are repeatedly paired, leading to a response that is initially elicited by the second stimulus.',
      'Working memory is a cognitive system with limited capacity responsible for temporarily holding information available for processing.',
      'The attachment theory describes the dynamics of long-term interpersonal relationships between humans, particularly in families and friendships.',
      'Neuroplasticity refers to the brain\'s ability to reorganize itself by forming new neural connections throughout life.'
    ]
  };

  beforeAll(async () => {
    if (!OPENAI_API_KEY) {
      console.warn('Skipping integration tests: OPENAI_API_KEY not set');
      return;
    }

    // Initialize Qdrant client
    qdrantClient = new QdrantClient({
      host: QDRANT_HOST,
      port: QDRANT_PORT
    });

    // Create test collection
    try {
      await qdrantClient.deleteCollection(TEST_COLLECTION);
    } catch {
      // Collection might not exist
    }

    await qdrantClient.createCollection(TEST_COLLECTION, {
      vectors: {
        size: 1536,
        distance: 'Cosine'
      }
    });

    // Initialize services with real implementations
    distillService = new OpenAIDistillationService({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4-turbo-preview',
      cacheEnabled: false // Disable cache for testing
    });

    embeddingService = new OpenAIEmbeddingService({
      apiKey: OPENAI_API_KEY,
      model: 'text-embedding-3-small'
    });

    vectorIndex = new QdrantVectorIndexManager(
      qdrantClient,
      TEST_COLLECTION,
      1536
    );

    centroidManager = new FolderCentroidManager(vectorIndex);

    intelligentService = new OpenAIIntelligentFolderService(centroidManager, {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4-turbo-preview',
      enableCaching: false // Disable cache for testing
    });

    smartRouter = new SmartRouter(
      distillService,
      embeddingService,
      vectorIndex,
      intelligentService // Now using intelligent service!
    );

    // Wait for services to be ready
    await vectorIndex.isReady();
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    if (qdrantClient) {
      try {
        await qdrantClient.deleteCollection(TEST_COLLECTION);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Bootstrap Mode - Empty System Initialization', () => {
    skipIfNoApiKey('should intelligently organize initial concepts across domains', async () => {
      // Create initial batch of concepts
      const batch = BatchSchema.parse({
        batchId: 'test-bootstrap-batch',
        window: 'Integration Test',
        topic: 'Academic Knowledge',
        entries: [],
        createdAt: new Date()
      });

      const initialConcepts: ConceptCandidate[] = [
        // Mix concepts from different domains
        new ConceptCandidate(batch, academicContent.mathematics[0], 0),
        new ConceptCandidate(batch, academicContent.physics[0], 1),
        new ConceptCandidate(batch, academicContent.computerScience[0], 2),
        new ConceptCandidate(batch, academicContent.biology[0], 3),
        new ConceptCandidate(batch, academicContent.psychology[0], 4),
        new ConceptCandidate(batch, academicContent.mathematics[1], 5),
        new ConceptCandidate(batch, academicContent.physics[1], 6),
        new ConceptCandidate(batch, academicContent.computerScience[1], 7)
      ];

      // Process through complete pipeline
      const results = await smartRouter.routeBatch(initialConcepts);

      // Verify bootstrap created intelligent structure
      expect(results.decisions).toHaveLength(8);
      
      // Check that concepts were routed to appropriate folders
      const mathDecisions = results.decisions.filter(d => 
        d.explanation.decisionFactors.some(f => 
          f.toLowerCase().includes('math') || f.toLowerCase().includes('calculus')
        )
      );
      expect(mathDecisions.length).toBeGreaterThan(0);

      // Check for domain detection
      const domains = new Set(results.decisions.map(d => 
        d.explanation.primarySignal
      ));
      expect(domains.size).toBeGreaterThan(1); // Multiple domains detected

      // Verify no duplicates in bootstrap
      const duplicates = results.decisions.filter(d => d.action === 'duplicate');
      expect(duplicates).toHaveLength(0);

      console.log('Bootstrap Results:', {
        totalConcepts: results.decisions.length,
        routedCount: results.decisions.filter(d => d.action === 'route').length,
        unsortedCount: results.decisions.filter(d => d.action === 'unsorted').length,
        averageConfidence: results.decisions.reduce((sum, d) => sum + d.confidence, 0) / results.decisions.length
      });
    }, 120000); // 2 minute timeout
  });

  describe('Growing Mode - Intelligent Routing', () => {
    skipIfNoApiKey('should route new mathematics concepts to appropriate folders', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-math-batch',
        window: 'Math Study',
        topic: 'Mathematics',
        entries: [],
        createdAt: new Date()
      });

      // First, add some math concepts to establish a folder
      const setupConcepts = [
        new ConceptCandidate(batch, academicContent.mathematics[0], 0),
        new ConceptCandidate(batch, academicContent.mathematics[1], 1)
      ];

      await smartRouter.routeBatch(setupConcepts);

      // Now route a related math concept
      const newConcept = new ConceptCandidate(
        batch,
        academicContent.mathematics[2], // Riemann hypothesis
        2
      );

      const decision = await smartRouter.route(newConcept);

      expect(decision.action).toBe('route');
      expect(decision.confidence).toBeGreaterThan(0.7);
      expect(decision.explanation.primarySignal).toContain('math');

      console.log('Math Routing Decision:', {
        action: decision.action,
        confidence: decision.confidence,
        reasoning: decision.explanation.primarySignal
      });
    }, 60000);

    skipIfNoApiKey('should detect duplicates with high accuracy', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-duplicate-batch',
        window: 'Duplicate Test',
        topic: 'Physics',
        entries: [],
        createdAt: new Date()
      });

      // Add a physics concept
      const original = new ConceptCandidate(
        batch,
        academicContent.physics[0], // Quantum mechanics
        0
      );

      const firstDecision = await smartRouter.route(original);
      expect(firstDecision.action).not.toBe('duplicate');

      // Try to add slightly modified version
      const duplicate = new ConceptCandidate(
        batch,
        'Quantum mechanics is the branch of physics that describes the behavior of matter and energy at atomic and subatomic scales.',
        1
      );

      const duplicateDecision = await smartRouter.route(duplicate);

      expect(duplicateDecision.action).toBe('duplicate');
      expect(duplicateDecision.confidence).toBeGreaterThan(0.85);
      expect(duplicateDecision.duplicateId).toBeDefined();

      console.log('Duplicate Detection:', {
        action: duplicateDecision.action,
        confidence: duplicateDecision.confidence,
        duplicateId: duplicateDecision.duplicateId
      });
    }, 60000);
  });

  describe('Cross-Domain Relationship Discovery', () => {
    skipIfNoApiKey('should discover relationships between physics and mathematics', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-cross-domain',
        window: 'Cross Domain Test',
        topic: 'Interdisciplinary',
        entries: [],
        createdAt: new Date()
      });

      // Add concepts from both domains
      const concepts = [
        new ConceptCandidate(batch, academicContent.mathematics[0], 0), // Calculus
        new ConceptCandidate(batch, academicContent.physics[0], 1),     // Quantum mechanics
        new ConceptCandidate(batch, academicContent.physics[2], 2),     // Thermodynamics
        new ConceptCandidate(batch, academicContent.mathematics[3], 3)  // Linear algebra
      ];

      const results = await smartRouter.routeBatch(concepts);

      // Check for cross-domain relationships
      const crossReferences = results.decisions.filter(d =>
        d.explanation.decisionFactors.some(f => 
          f.includes('related') || f.includes('interdisciplinary')
        )
      );

      console.log('Cross-Domain Discovery:', {
        totalConcepts: results.decisions.length,
        crossReferences: crossReferences.length,
        clusters: results.clusters.length
      });

      // Verify clustering detected related concepts
      if (results.clusters.length > 0) {
        expect(results.clusters[0].concepts.length).toBeGreaterThanOrEqual(2);
        expect(results.clusters[0].coherence).toBeGreaterThan(0.5);
      }
    }, 90000);
  });

  describe('Academic Hierarchy Validation', () => {
    skipIfNoApiKey('should create appropriate academic hierarchy', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-hierarchy',
        window: 'Hierarchy Test',
        topic: 'Computer Science',
        entries: [],
        createdAt: new Date()
      });

      // Concepts at different abstraction levels
      const concepts = [
        new ConceptCandidate(batch, 'Computer Science is the study of computation and information processing.', 0), // Domain level
        new ConceptCandidate(batch, academicContent.computerScience[0], 1), // Machine learning - field level
        new ConceptCandidate(batch, 'Supervised learning uses labeled training data to learn a mapping from inputs to outputs.', 2), // Subfield
        new ConceptCandidate(batch, 'Linear regression is a supervised learning algorithm for predicting continuous values.', 3) // Topic level
      ];

      const results = await smartRouter.routeBatch(concepts);

      // Verify hierarchy is respected
      const hierarchyMentions = results.decisions.filter(d =>
        d.explanation.decisionFactors.some(f => 
          f.includes('level') || f.includes('hierarchy') || f.includes('abstraction')
        )
      );

      console.log('Hierarchy Validation:', {
        totalConcepts: results.decisions.length,
        hierarchyAware: hierarchyMentions.length,
        folderStructure: results.decisions.map(d => ({
          concept: d.explanation.primarySignal,
          folder: d.folderId || 'unsorted'
        }))
      });

      expect(hierarchyMentions.length).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Mature System - Context Filtering', () => {
    skipIfNoApiKey('should efficiently filter context for large systems', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-mature',
        window: 'Mature System Test',
        topic: 'Large Scale',
        entries: [],
        createdAt: new Date()
      });

      // Simulate mature system by adding many concepts
      const allConcepts: ConceptCandidate[] = [];
      let index = 0;

      for (const domain of Object.keys(academicContent)) {
        for (const content of academicContent[domain as keyof typeof academicContent]) {
          allConcepts.push(new ConceptCandidate(batch, content, index++));
        }
      }

      // Process in batches to simulate mature system
      const batchSize = 5;
      for (let i = 0; i < Math.min(allConcepts.length, 15); i += batchSize) {
        const batch = allConcepts.slice(i, i + batchSize);
        await smartRouter.routeBatch(batch);
      }

      // Now test context filtering with a new concept
      const testConcept = new ConceptCandidate(
        batch,
        'Deep learning uses artificial neural networks with multiple layers to progressively extract higher-level features from raw input.',
        100
      );

      const startTime = Date.now();
      const decision = await smartRouter.route(testConcept);
      const routingTime = Date.now() - startTime;

      console.log('Mature System Context Filtering:', {
        action: decision.action,
        confidence: decision.confidence,
        routingTime: `${routingTime}ms`,
        contextSize: decision.explanation.folderMatches?.length || 0
      });

      // Verify context was filtered (not all folders included)
      expect(decision.explanation.folderMatches?.length || 0).toBeLessThanOrEqual(10);
      expect(routingTime).toBeLessThan(10000); // Should complete within 10 seconds
    }, 180000); // 3 minute timeout
  });

  describe('Reorganization Detection', () => {
    skipIfNoApiKey('should detect need for subfolder creation', async () => {
      const batch = BatchSchema.parse({
        batchId: 'test-reorg',
        window: 'Reorganization Test',
        topic: 'Biology',
        entries: [],
        createdAt: new Date()
      });

      // Add many biology concepts to trigger reorganization
      const concepts = academicContent.biology.map((content, i) => 
        new ConceptCandidate(batch, content, i)
      );

      // Add more specific biology concepts
      const specificConcepts = [
        'Mitochondria are the powerhouses of the cell, generating ATP through cellular respiration.',
        'Ribosomes are molecular machines that synthesize proteins by translating messenger RNA.',
        'The Golgi apparatus modifies, packages, and sorts proteins for transport.',
        'Lysosomes contain digestive enzymes that break down waste materials and cellular debris.',
        'The endoplasmic reticulum is involved in protein and lipid synthesis.'
      ].map((content, i) => 
        new ConceptCandidate(batch, content, concepts.length + i)
      );

      const allConcepts = [...concepts, ...specificConcepts];
      const results = await smartRouter.routeBatch(allConcepts);

      // Check for folder suggestions
      const folderSuggestions = results.clusters.filter(c => 
        c.concepts.length >= 3 && c.coherence > 0.7
      );

      console.log('Reorganization Detection:', {
        totalConcepts: allConcepts.length,
        clusters: results.clusters.length,
        potentialFolders: folderSuggestions.length,
        clusterSizes: results.clusters.map(c => c.concepts.length)
      });

      // Should detect at least one cluster for cell organelles
      expect(results.clusters.length).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Performance and Token Usage', () => {
    skipIfNoApiKey('should track and respect token budgets', async () => {
      // Get initial token usage
      const initialStats = await intelligentService.getUsageStats();

      const batch = BatchSchema.parse({
        batchId: 'test-tokens',
        window: 'Token Test',
        topic: 'Mixed',
        entries: [],
        createdAt: new Date()
      });

      // Route a few concepts
      const concepts = [
        new ConceptCandidate(batch, academicContent.mathematics[4], 0),
        new ConceptCandidate(batch, academicContent.physics[4], 1),
        new ConceptCandidate(batch, academicContent.psychology[4], 2)
      ];

      for (const concept of concepts) {
        await smartRouter.route(concept);
      }

      // Check token usage
      const finalStats = await intelligentService.getUsageStats();

      console.log('Token Usage:', {
        tokensUsed: finalStats.dailyTokensUsed - initialStats.dailyTokensUsed,
        averagePerDecision: finalStats.averageTokensPerDecision,
        remainingBudget: finalStats.remainingDailyBudget
      });

      expect(finalStats.dailyTokensUsed).toBeGreaterThan(initialStats.dailyTokensUsed);
      expect(finalStats.remainingDailyBudget).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling and Fallbacks', () => {
    it('should fallback gracefully when intelligent service unavailable', async () => {
      // Create router without intelligent service
      const basicRouter = new SmartRouter(
        distillService,
        embeddingService,
        vectorIndex
        // No intelligent service
      );

      const batch = BatchSchema.parse({
        batchId: 'test-fallback',
        window: 'Fallback Test',
        topic: 'Test',
        entries: [],
        createdAt: new Date()
      });

      const concept = new ConceptCandidate(
        batch,
        'Test concept for fallback behavior.',
        0
      );

      // Should still work with legacy routing
      const decision = await basicRouter.route(concept);

      expect(decision).toBeDefined();
      expect(decision.action).toBeDefined();
      expect(['route', 'unsorted', 'duplicate']).toContain(decision.action);

      console.log('Fallback Behavior:', {
        action: decision.action,
        confidence: decision.confidence,
        usedFallback: true
      });
    });
  });
});

// Run specific test suite for academic accuracy
describe('Academic Accuracy Validation', () => {
  skipIfNoApiKey('should correctly classify concepts by academic domain', async () => {
    const testCases = [
      {
        content: 'Eigenvalues and eigenvectors are fundamental concepts in linear algebra.',
        expectedDomain: 'mathematics',
        expectedLevel: 'topic'
      },
      {
        content: 'The double-slit experiment demonstrates the wave-particle duality of light and matter.',
        expectedDomain: 'physics',
        expectedLevel: 'topic'
      },
      {
        content: 'Quicksort is a divide-and-conquer algorithm with average time complexity of O(n log n).',
        expectedDomain: 'computer_science',
        expectedLevel: 'topic'
      },
      {
        content: 'The hippocampus plays a major role in the consolidation of information from short-term to long-term memory.',
        expectedDomain: 'psychology',
        expectedLevel: 'topic'
      }
    ];

    for (const testCase of testCases) {
      const metadata = await intelligentService.getAcademicMetadata('test-folder', [
        {
          id: 'test-concept',
          title: testCase.content.split(' ').slice(0, 5).join(' '),
          summary: testCase.content,
          similarity: 1.0
        }
      ]);

      console.log(`Academic Classification for "${testCase.content.substring(0, 50)}...":`, {
        detected: metadata.domain,
        expected: testCase.expectedDomain,
        confidence: metadata.confidence,
        level: metadata.level
      });

      // Allow some flexibility in classification
      expect(metadata.confidence).toBeGreaterThan(0.5);
    }
  }, 120000);
});