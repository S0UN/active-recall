/**
 * PromptComparisonTest - Live testing of original vs improved prompts with real LLM calls
 * 
 * This test will make actual API calls to compare prompt performance on OCR artifacts
 */

import { OpenAIDistillationService } from './OpenAIDistillationService';
import { ImprovedOpenAIDistillationService } from './ImprovedOpenAIDistillationService';
import { ConceptCandidate } from '../../contracts/schemas';
import { DistillationConfig } from '../IDistillationService';
import { createHash } from 'crypto';

// Simple in-memory cache for testing
class TestCache {
  private cache = new Map<string, any>();

  async get(key: string): Promise<any> {
    return this.cache.get(key);
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    this.cache.set(key, value);
  }
}

export class PromptComparisonTest {
  private originalService: OpenAIDistillationService;
  private improvedService: ImprovedOpenAIDistillationService;
  private testCache: TestCache;

  constructor(apiKey: string) {
    const config: DistillationConfig = {
      apiKey,
      model: 'gpt-3.5-turbo',
      maxTokens: 300,
      temperature: 0.1,
      cacheEnabled: false // Disable cache for testing
    };

    this.testCache = new TestCache();
    this.originalService = new OpenAIDistillationService(config, this.testCache);
    this.improvedService = new ImprovedOpenAIDistillationService(config, this.testCache);
  }

  /**
   * Test cases with realistic OCR artifacts
   */
  private getTestCases(): Array<{name: string, input: string, expectedType: string}> {
    return [
      {
        name: "PDF Academic Paper - Character Substitutions",
        input: `Machine leaming algorithms can be classified into supervised, unsupervised, and reinforcement leaming categories. Neural networks use backpropagation to update weights through gradient descent optim ization. The loss function measures the difference between predicted and actual outputs. Com mon activation functions include ReLU, sigmoid, and tanh.`,
        expectedType: "specific algorithm mechanism"
      },
      {
        name: "Slideshow Table - Formatting Artifacts", 
        input: `Data Structure | Time Complexity 
Array Access | O(1)
Array Insertion | O(n)
Binary Search Tree | Search: O(log n)
Hash Table | Average: O(1) Worst: O(n)

- Arrays provide constant-time random access
- Insertion requires shifting elements
- BSTs maintain sorted order through tree structure`,
        expectedType: "specific data structure operation"
      },
      {
        name: "Biology Textbook - Missing Characters",
        input: `Photosynthesis occurs in two main stages: the light-dependent reactions and the light-independet reactions (Calvin cycle). In the thyiakoid membranes, chlorophyll absorbs light energy and excites electrons. These high-energy electrons pass through an electron transport chan, generating ATP and NADPH. The Calvin cycle uses these products to fx CO2 into glucose.`,
        expectedType: "specific biological process"
      },
      {
        name: "Code Documentation - Syntax Artifacts",
        input: `The QuickSort algonthm uses a divide-and-conquer approach. 
1. Choose a pivot element from the array
2. Partition the array so elements < pivot are on left, > pivot on right
3. Recursively sort the left and right subarrays

Time complexity: 
- Best/Average case: O(n log n)
- Worst case: O(n^2) when pivot is always smallest/largest`,
        expectedType: "specific algorithm characteristic"
      },
      {
        name: "Biology Slide - Diagram Text",
        input: `Cel Division: Mitosis

Prophase → Metaphase → Anaphase → Telophase

Prophase:
- Chromatin condenses into chromosomes  
- Nuclear envelope begins to break down
- Centnosomes move to opposite poles
- Spindle fibers start forming

Metaphase: 
- Chromosomes align at cel equator
- Each chromosome attached to spindle fibers
- Cell checkpont ensures proper attachment`,
        expectedType: "specific cell division phase"
      }
    ];
  }

  /**
   * Run comparison test on a single test case
   */
  private async runSingleComparison(testCase: {name: string, input: string, expectedType: string}) {
    console.log(`\n=== TESTING: ${testCase.name} ===`);
    console.log(`Input (first 100 chars): ${testCase.input.substring(0, 100)}...`);
    console.log(`Expected: Should extract ${testCase.expectedType}\n`);

    // Create concept candidate
    const candidate: ConceptCandidate = {
      candidateId: `test_${Date.now()}`,
      contentHash: createHash('sha256').update(testCase.input).digest('hex').substring(0, 16),
      normalizedText: testCase.input,
      source: {
        type: 'test',
        identifier: testCase.name,
        capturedAt: new Date()
      }
    };

    let originalResult: any = null;
    let improvedResult: any = null;
    let originalError: string | null = null;
    let improvedError: string | null = null;

    // Test Original Prompt
    try {
      console.log("🔹 Testing ORIGINAL prompt...");
      originalResult = await this.originalService.distill(candidate);
      console.log(`✅ Original Success:`);
      console.log(`   Title: ${originalResult.title}`);
      console.log(`   Summary: ${originalResult.summary.substring(0, 120)}...`);
    } catch (error) {
      originalError = String(error);
      console.log(`❌ Original Failed: ${originalError}`);
    }

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test Improved Prompt
    try {
      console.log("\n🔹 Testing IMPROVED prompt...");
      improvedResult = await this.improvedService.distill(candidate);
      console.log(`✅ Improved Success:`);
      console.log(`   Title: ${improvedResult.title}`);
      console.log(`   Summary: ${improvedResult.summary.substring(0, 120)}...`);
    } catch (error) {
      improvedError = String(error);
      console.log(`❌ Improved Failed: ${improvedError}`);
    }

    // Analysis
    console.log("\n📊 ANALYSIS:");
    
    if (originalResult && improvedResult) {
      // Compare specificity
      const originalSpecificity = this.analyzeSpecificity(originalResult.title, originalResult.summary);
      const improvedSpecificity = this.analyzeSpecificity(improvedResult.title, improvedResult.summary);
      
      console.log(`   Specificity Score - Original: ${originalSpecificity}, Improved: ${improvedSpecificity}`);
      console.log(`   OCR Handling - Original: ${this.analyzeOCRHandling(testCase.input, originalResult)}, Improved: ${this.analyzeOCRHandling(testCase.input, improvedResult)}`);
      console.log(`   Abstraction Level - Original: ${this.analyzeAbstractionLevel(originalResult.title)}, Improved: ${this.analyzeAbstractionLevel(improvedResult.title)}`);
      
      if (improvedSpecificity > originalSpecificity) {
        console.log("   🎯 IMPROVED prompt shows better specificity!");
      } else if (originalSpecificity > improvedSpecificity) {
        console.log("   ⚠️  ORIGINAL prompt was more specific");
      } else {
        console.log("   ➖ Similar specificity levels");
      }
    } else if (!originalResult && improvedResult) {
      console.log("   🎯 IMPROVED prompt succeeded where original failed!");
    } else if (originalResult && !improvedResult) {
      console.log("   ⚠️  ORIGINAL prompt succeeded where improved failed!");
    } else {
      console.log("   ❌ Both prompts failed");
    }

    return {
      testName: testCase.name,
      originalResult,
      improvedResult,
      originalError,
      improvedError
    };
  }

  /**
   * Analyze concept specificity (higher is more specific)
   */
  private analyzeSpecificity(title: string, summary: string): number {
    let score = 0.5; // Base score

    // Check for specific technical terms
    const specificTerms = [
      'algorithm', 'mechanism', 'process', 'reaction', 'operation', 'function',
      'complexity', 'structure', 'pathway', 'cycle', 'phase', 'stage'
    ];
    
    const text = (title + ' ' + summary).toLowerCase();
    specificTerms.forEach(term => {
      if (text.includes(term)) score += 0.1;
    });

    // Penalty for broad terms
    const broadTerms = [
      'programming', 'biology', 'chemistry', 'mathematics', 'computer science',
      'algorithms', 'data structures', 'concepts', 'topics', 'subjects'
    ];
    
    broadTerms.forEach(term => {
      if (text.includes(term)) score -= 0.1;
    });

    // Bonus for specific details
    if (title.length > 40) score += 0.1; // Detailed titles
    if (summary.includes('specific') || summary.includes('particular')) score += 0.1;
    if (/O\([^)]+\)/.test(text)) score += 0.1; // Complexity notation
    if (/\d+/.test(title)) score += 0.05; // Numbers in title

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Analyze OCR artifact handling
   */
  private analyzeOCRHandling(input: string, result: any): string {
    const knownArtifacts = [
      'leaming', 'optim ization', 'Com mon', 'thyiakoid', 'chan', 'fx',
      'algonthm', 'Cel', 'Centnosomes', 'cel', 'checkpont', 'independet'
    ];

    const foundArtifacts = knownArtifacts.filter(artifact => input.includes(artifact));
    
    if (foundArtifacts.length === 0) return "Clean";
    
    // Check if result suggests understanding of cleaned content
    const resultText = (result.title + ' ' + result.summary).toLowerCase();
    const cleanedTerms = ['learning', 'optimization', 'common', 'thylakoid', 'chain', 'fix', 'algorithm', 'cell', 'centrosomes', 'checkpoint', 'independent'];
    
    const understoodTerms = cleanedTerms.filter(term => resultText.includes(term.toLowerCase()));
    
    if (understoodTerms.length >= foundArtifacts.length * 0.7) {
      return "Good";
    } else if (understoodTerms.length >= foundArtifacts.length * 0.4) {
      return "Partial";
    } else {
      return "Poor";
    }
  }

  /**
   * Analyze abstraction level appropriateness
   */
  private analyzeAbstractionLevel(title: string): string {
    const text = title.toLowerCase();
    
    // Too broad indicators
    const broadIndicators = [
      'programming', 'algorithms', 'data structures', 'machine learning',
      'photosynthesis', 'cell division', 'mitosis', 'chemistry', 'biology'
    ];
    
    // Good specificity indicators
    const specificIndicators = [
      'gradient descent', 'backpropagation', 'pivot', 'partition', 'o(1)', 'o(log n)',
      'chlorophyll', 'thylakoid', 'calvin cycle', 'prophase', 'metaphase'
    ];
    
    if (broadIndicators.some(indicator => text.includes(indicator))) {
      return "Too Broad";
    } else if (specificIndicators.some(indicator => text.includes(indicator))) {
      return "Appropriate";
    } else {
      return "Moderate";
    }
  }

  /**
   * Run multi-concept comparison test
   */
  private async runMultiConceptComparison(testCase: {name: string, input: string, expectedType: string}) {
    console.log(`\n=== MULTI-CONCEPT TESTING: ${testCase.name} ===`);
    
    const candidate: ConceptCandidate = {
      candidateId: `multi_test_${Date.now()}`,
      contentHash: createHash('sha256').update(testCase.input).digest('hex').substring(0, 16),
      normalizedText: testCase.input,
      source: {
        type: 'test',
        identifier: testCase.name,
        capturedAt: new Date()
      }
    };

    let originalResult: any = null;
    let improvedResult: any = null;

    // Test Original Multi-Concept
    try {
      console.log("🔹 Testing ORIGINAL multi-concept prompt...");
      originalResult = await this.originalService.distillMultiple(candidate);
      console.log(`✅ Original Success: ${originalResult.concepts.length} concepts`);
      originalResult.concepts.forEach((concept: any, i: number) => {
        console.log(`   ${i+1}. ${concept.title}`);
      });
    } catch (error) {
      console.log(`❌ Original Failed: ${String(error)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test Improved Multi-Concept
    try {
      console.log("\n🔹 Testing IMPROVED multi-concept prompt...");
      improvedResult = await this.improvedService.distillMultiple(candidate);
      console.log(`✅ Improved Success: ${improvedResult.concepts.length} concepts`);
      improvedResult.concepts.forEach((concept: any, i: number) => {
        console.log(`   ${i+1}. ${concept.title}`);
      });
    } catch (error) {
      console.log(`❌ Improved Failed: ${String(error)}`);
    }

    // Analysis
    if (originalResult && improvedResult) {
      const originalAvgSpecificity = originalResult.concepts.reduce((sum: number, c: any) => 
        sum + this.analyzeSpecificity(c.title, c.summary), 0) / originalResult.concepts.length;
      
      const improvedAvgSpecificity = improvedResult.concepts.reduce((sum: number, c: any) => 
        sum + this.analyzeSpecificity(c.title, c.summary), 0) / improvedResult.concepts.length;
      
      console.log(`\n📊 Multi-Concept Analysis:`);
      console.log(`   Average Specificity - Original: ${originalAvgSpecificity.toFixed(2)}, Improved: ${improvedAvgSpecificity.toFixed(2)}`);
      console.log(`   Concept Count - Original: ${originalResult.concepts.length}, Improved: ${improvedResult.concepts.length}`);
    }
  }

  /**
   * Run complete comparison test suite
   */
  public async runCompleteComparison(): Promise<void> {
    console.log("🚀 STARTING PROMPT COMPARISON TEST WITH REAL LLM CALLS");
    console.log("===================================================");

    const testCases = this.getTestCases();
    const results = [];

    // Single concept tests
    for (const testCase of testCases) {
      const result = await this.runSingleComparison(testCase);
      results.push(result);
      
      // Delay between tests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Multi-concept tests (subset)
    console.log("\n\n🔄 TESTING MULTI-CONCEPT EXTRACTION");
    console.log("====================================");
    
    const multiTestCases = testCases.slice(0, 2); // Test first 2 cases for multi-concept
    for (const testCase of multiTestCases) {
      await this.runMultiConceptComparison(testCase);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log("\n\n📊 OVERALL COMPARISON SUMMARY");
    console.log("=============================");
    
    const successfulTests = results.filter(r => r.originalResult && r.improvedResult);
    console.log(`Successful comparisons: ${successfulTests.length}/${results.length}`);
    
    if (successfulTests.length > 0) {
      const improvements = successfulTests.filter(r => {
        const originalSpec = this.analyzeSpecificity(r.originalResult.title, r.originalResult.summary);
        const improvedSpec = this.analyzeSpecificity(r.improvedResult.title, r.improvedResult.summary);
        return improvedSpec > originalSpec;
      });
      
      console.log(`Tests where improved prompt performed better: ${improvements.length}/${successfulTests.length}`);
      console.log(`Improvement rate: ${(improvements.length / successfulTests.length * 100).toFixed(1)}%`);
    }

    console.log("\n✅ Prompt comparison testing complete!");
  }
}

/**
 * Test runner function - call this with your OpenAI API key
 */
export async function runPromptComparison(apiKey: string) {
  const tester = new PromptComparisonTest(apiKey);
  await tester.runCompleteComparison();
}