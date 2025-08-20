/**
 * OpenAIDistillationService - Production-grade LLM content enrichment
 * 
 * Features:
 * - Single and multi-concept extraction from educational content
 * - Advanced Chain-of-Thought prompting with few-shot examples
 * - OCR-aware text processing for real-world content
 * - Production-grade error handling and fallback mechanisms
 * - Intelligent caching to reduce API costs
 * - Comprehensive input validation and sanitization
 * 
 * The service uses OpenAI's GPT models with structured JSON responses
 * and implements multiple extraction strategies for optimal results.
 */

import OpenAI from 'openai';
import { ConceptCandidate, DistilledContent, DistilledContentSchema, MultiConceptDistillation, MultiConceptDistillationSchema, ExtractedConcept } from '../../contracts/schemas';
import { 
  IDistillationService, 
  DistillationConfig, 
  DistillationError, 
  DistillationTimeoutError,
  DistillationQuotaError 
} from '../IDistillationService';
import { IContentCache } from '../IContentCache';

export class OpenAIDistillationService implements IDistillationService {
  private readonly openAiClient: OpenAI;
  private readonly distillationConfig: DistillationConfig;
  private readonly contentCache: IContentCache;
  private requestCount = 0;
  private dailyLimit = 1000;

  constructor(config: DistillationConfig, cache: IContentCache) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.distillationConfig = config;
    this.contentCache = cache;
    this.openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Extract a single primary concept from educational content
   * 
   * Focuses on identifying the most specific, testable concept that can
   * be used to generate targeted practice questions.
   * 
   * @param candidate - The concept candidate to distill
   * @returns Promise resolving to enriched content
   * @throws DistillationError for various failure conditions
   */
  async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    this.validateInput(candidate);
    // Check cache first
    if (this.distillationConfig.cacheEnabled) {
      const cached = await this.contentCache.get(candidate.contentHash);
      if (cached) {
        return {
          ...cached,
          cached: true
        };
      }
    }

    // Check daily limits
    if (this.requestCount >= this.dailyLimit) {
      throw new DistillationQuotaError(
        `Daily API limit reached (${this.dailyLimit} requests)`
      );
    }

    try {
      const response = await this.openAiClient.chat.completions.create({
        model: this.distillationConfig.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: candidate.normalizedText
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: this.distillationConfig.maxTokens || 200,
        temperature: this.distillationConfig.temperature || 0.1,
      });

      this.requestCount++;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new DistillationError('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Check if content was identified as non-study material
      if (parsed.title === 'NOT_STUDY_CONTENT' || parsed.summary === 'NOT_STUDY_CONTENT') {
        throw new DistillationError('Content is not study-related');
      }
      
      const distilled: DistilledContent = {
        title: this.sanitizeTitle(parsed.title || 'Concept'),
        summary: this.sanitizeSummary(parsed.summary || candidate.normalizedText.substring(0, 500)),
        contentHash: candidate.contentHash,
        cached: false,
        distilledAt: new Date()
      };

      // Validate against schema
      const validated = DistilledContentSchema.parse(distilled);

      // Cache the result
      if (this.distillationConfig.cacheEnabled) {
        await this.contentCache.set(candidate.contentHash, validated, 30 * 24 * 60 * 60); // 30 days
      }

      return validated;

    } catch (error) {
      return this.handleDistillationError(error, candidate, false);
    }
  }


  /**
   * Extract multiple specific concepts from educational content
   * 
   * Uses advanced prompting techniques to identify individual, testable concepts
   * that are specific enough to generate targeted practice questions.
   * 
   * @param candidate - The concept candidate to extract concepts from
   * @returns Promise resolving to multiple extracted concepts
   * @throws DistillationError for various failure conditions
   */
  async distillMultiple(candidate: ConceptCandidate): Promise<MultiConceptDistillation> {
    this.validateInput(candidate);
    // Check cache first
    const cacheKey = `multi_${candidate.contentHash}`;
    if (this.distillationConfig.cacheEnabled) {
      const cached = await this.contentCache.get(cacheKey) as MultiConceptDistillation | undefined;
      if (cached) {
        return {
          ...cached,
          cached: true
        };
      }
    }

    // Check daily limits
    if (this.requestCount >= this.dailyLimit) {
      throw new DistillationQuotaError(
        `Daily API limit reached (${this.dailyLimit} requests)`
      );
    }

    try {
      const response = await this.openAiClient.chat.completions.create({
        model: this.distillationConfig.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getMultiConceptSystemPrompt()
          },
          {
            role: 'user',
            content: candidate.normalizedText
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: (this.distillationConfig.maxTokens || 200) * (this.distillationConfig.maxConceptsPerDistillation || 3),
        temperature: this.distillationConfig.temperature || 0.1,
      });

      this.requestCount++;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new DistillationError('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Check if no study content was found
      if (!parsed.concepts || parsed.concepts.length === 0) {
        throw new DistillationError('No study-related concepts found');
      }

      // Filter out any NOT_STUDY_CONTENT markers
      const validConcepts = parsed.concepts.filter((c: any) => 
        c.title !== 'NOT_STUDY_CONTENT' && c.summary !== 'NOT_STUDY_CONTENT'
      );

      if (validConcepts.length === 0) {
        throw new DistillationError('Content is not study-related');
      }

      // Limit to maxConceptsPerDistillation
      const maxConcepts = this.distillationConfig.maxConceptsPerDistillation || 5;
      const limitedConcepts = validConcepts.slice(0, maxConcepts);

      // Create individual content hashes for each concept
      const conceptsWithHashes: ExtractedConcept[] = limitedConcepts.map((concept: any) => ({
        title: this.sanitizeTitle(concept.title || 'Concept'),
        summary: this.sanitizeSummary(concept.summary || ''),
        relevanceScore: concept.relevanceScore,
        startOffset: concept.startOffset,
        endOffset: concept.endOffset
      }));

      const result: MultiConceptDistillation = {
        concepts: conceptsWithHashes,
        sourceContentHash: candidate.contentHash,
        totalConcepts: conceptsWithHashes.length,
        processingTime: Date.now(),
        cached: false,
        distilledAt: new Date()
      };

      // Validate against schema
      const validated = MultiConceptDistillationSchema.parse(result);

      // Cache the result
      if (this.distillationConfig.cacheEnabled) {
        await this.contentCache.set(cacheKey, validated, 30 * 24 * 60 * 60); // 30 days
      }

      return validated;

    } catch (error) {
      return this.handleDistillationError(error, candidate, true);
    }
  }

  /**
   * Centralized error handling for distillation operations
   */
  private handleDistillationError(
    error: any, 
    candidate: ConceptCandidate, 
    isMultiConcept: boolean
  ): any {
    // Check for OpenAI-specific error types by status code
    if (error && typeof error === 'object' && 'status' in error) {
      switch (error.status) {
        case 429:
          // Rate limit or quota exceeded
          if (error.code === 'insufficient_quota') {
            throw new DistillationQuotaError(
              'OpenAI API quota exceeded. Please check your billing settings at https://platform.openai.com/settings/organization/billing'
            );
          } else {
            throw new DistillationQuotaError('OpenAI rate limit exceeded. Please try again later.');
          }
        case 401:
          throw new DistillationError('OpenAI API authentication failed. Please check your API key.');
        case 403:
          throw new DistillationError('OpenAI API access forbidden. Please check your permissions.');
        case 404:
          throw new DistillationError('OpenAI API endpoint not found. Please check your model configuration.');
        case 500:
        case 502:
        case 503:
        case 504:
          throw new DistillationError('OpenAI API server error. Please try again later.');
        default:
          // Continue with other error types
          break;
      }
    }

    // Check for timeout errors
    if (error && typeof error === 'object' && 'name' in error && error.name === 'APITimeoutError') {
      throw new DistillationTimeoutError(30000);
    }

    // Check for rate limit errors (alternative detection)
    if (error && typeof error === 'object' && 'name' in error && error.name === 'RateLimitError') {
      throw new DistillationQuotaError('OpenAI rate limit exceeded');
    }

    // Check for JSON parsing errors - use fallback
    if (error instanceof SyntaxError) {
      if (isMultiConcept) {
        return this.extractMultipleFallback(candidate);
      } else {
        return this.extractFallback(candidate);
      }
    }

    // Check for Zod validation errors
    if (error && typeof error === 'object' && '_zod' in error) {
      const zodError = error as any;
      const errorMessage = zodError.issues?.map((issue: any) => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ') || 'Validation failed';
      
      throw new DistillationError(`Schema validation failed: ${errorMessage}`);
    }

    // Default error handling
    const errorPrefix = isMultiConcept ? 'OpenAI multi-concept distillation failed' : 'OpenAI distillation failed';
    throw new DistillationError(
      `${errorPrefix}: ${error}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  /**
   * Validate input before processing
   */
  private validateInput(candidate: ConceptCandidate): void {
    if (!candidate) {
      throw new DistillationError('ConceptCandidate is required');
    }

    if (!candidate.normalizedText || typeof candidate.normalizedText !== 'string') {
      throw new DistillationError('ConceptCandidate must have valid normalizedText');
    }

    if (candidate.normalizedText.trim().length === 0) {
      throw new DistillationError('ConceptCandidate normalizedText cannot be empty');
    }

    if (candidate.normalizedText.length < 10) {
      throw new DistillationError('ConceptCandidate normalizedText is too short (minimum 10 characters)');
    }

    if (candidate.normalizedText.length > 50000) {
      throw new DistillationError('ConceptCandidate normalizedText is too long (maximum 50,000 characters)');
    }

    if (!candidate.contentHash || typeof candidate.contentHash !== 'string') {
      throw new DistillationError('ConceptCandidate must have valid contentHash');
    }

    // Check for suspicious patterns that might indicate malicious input
    const suspiciousPatterns = [
      /\b(DROP|DELETE|INSERT|UPDATE|UNION|SELECT)\s+/i, // SQL injection patterns
      /<script[\s\S]*?>[\s\S]*?<\/script>/i, // Script tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(candidate.normalizedText)) {
        throw new DistillationError('ConceptCandidate contains potentially malicious content');
      }
    }
  }

  getProvider(): string {
    return 'openai';
  }

  /**
   * Get the advanced system prompt for multi-concept distillation
   * Uses Chain-of-Thought (CoT) and OCR-aware processing techniques
   * Focuses on extracting SPECIFIC, TESTABLE concepts for practice question generation
   */
  private getMultiConceptSystemPrompt(): string {
    return `You are an expert educational content analyst. Your task is to extract SPECIFIC, TESTABLE educational concepts from text that can be used to generate practice questions. The text may come from OCR and could contain noise or formatting artifacts.

## CRITICAL REQUIREMENT - EXTREME SPECIFICITY FOR FOLDER SYSTEM:
Extract ONLY individual, standalone concepts that can become separate flashcards. Each concept must be specific enough that a student could study it as one focused topic.

**TOO BROAD** (cannot be individual flashcards):
- "Algorithms" → Contains dozens of different algorithms
- "Object-Oriented Programming" → Contains multiple principles
- "Data Structures" → Contains arrays, stacks, queues, etc.
- "Machine Learning" → Contains many different techniques
- "Cell Division" → Contains mitosis AND meiosis
- "Photosynthesis" → Contains light reactions AND Calvin cycle

**SPECIFIC ENOUGH** (individual flashcard topics):
- "QuickSort Pivot Selection Algorithm" → ONE specific algorithm
- "Stack LIFO Operations" → ONE specific data structure
- "Mitosis Prophase Stage" → ONE specific phase
- "Chlorophyll Light Absorption in Thylakoids" → ONE specific process
- "Gradient Descent Learning Rate" → ONE specific parameter
- "Hash Table Collision Resolution" → ONE specific mechanism

## REASONING APPROACH (Chain-of-Thought):
1. **Text Analysis**: Filter out OCR artifacts, navigation, non-educational content
2. **Specific Concept Identification**: Look for detailed processes, specific algorithms, particular theorems, concrete examples
3. **Testability Check**: Ask "Can I create a specific practice question about this concept?"
4. **Quality Assessment**: Prioritize concepts with clear learning objectives and specific details

## OCR TEXT HANDLING:
- Expect OCR errors: missing spaces, character substitutions, wrong line breaks
- Ignore artifacts: page numbers, headers, excessive whitespace
- Focus on substantive educational paragraphs with specific details

## SPECIFICITY GUIDELINES - INDIVIDUAL FLASHCARD RULE:
Each concept must be narrow enough to fit on ONE flashcard:
- "Stack LIFO Push Operation" not "Stack Operations" (push/pop are separate concepts)
- "Binary Search Tree Insertion" not "Binary Search Trees" (insertion/deletion/search are separate)
- "Mitosis Prophase Stage" not "Mitosis" (prophase/metaphase/anaphase are separate)
- "QuickSort Pivot Selection" not "QuickSort Algorithm" (pivot/partition/recursion are separate)
- "HTTP GET Request Headers" not "HTTP Requests" (GET/POST/PUT are separate)
- "Chlorophyll a Light Absorption" not "Photosynthesis Pigments" (chlorophyll a/b are separate)

## OUTPUT REQUIREMENTS:
- Return 1-5 SPECIFIC concepts (quality over quantity)
- Each concept must be detailed enough for practice question generation
- Title: Specific and testable (max 100 chars)
- Summary: Include key details, processes, or implementation specifics (50-500 chars)
- relevanceScore: Based on specificity and educational value (0.1-1.0)

## RESPONSE FORMAT:
Return valid JSON only in the following format:
{
  "concepts": [
    {
      "title": "Specific Concept Name with Details",
      "summary": "Detailed explanation including specific processes, steps, or implementation details that enable practice question creation.",
      "relevanceScore": 0.9
    }
  ]
}

## FEW-SHOT EXAMPLES:

**Example 1:**
Input: "Data structures are ways of organizing data. Common data structures include arrays, linked lists, stacks, queues, trees, and hash tables. Each structure has its own advantages and is suited for different operations."

Thinking:
1. Avoid generic "data structures" - extract specific individual structures
2. Focus on particular data structures mentioned with their characteristics
3. Extract testable concepts about specific structure operations

Output: {
  "concepts": [
    {
      "title": "Stack Data Structure LIFO Operations", 
      "summary": "Stacks follow Last-In-First-Out (LIFO) principle where elements are added and removed from the same end, supporting push and pop operations in O(1) time.",
      "relevanceScore": 0.9
    },
    {
      "title": "Hash Table Key-Value Storage",
      "summary": "Hash tables store data as key-value pairs using hash functions to map keys to array indices, providing average O(1) time complexity for insertion, deletion, and lookup.",
      "relevanceScore": 0.8
    }
  ]
}

**Example 2:**
Input: "Chemistry reactions involve bonds. In photosynthesis, chlorophyll absorbs light energy in the thylakoid membranes. The light reactions produce ATP and NADPH. The Calvin cycle occurs in the stroma and uses CO2."

Thinking:
1. Avoid broad "chemistry reactions" and "photosynthesis"
2. Focus on specific processes with locations and mechanisms
3. Extract concepts that can generate targeted questions

Output: {
  "concepts": [
    {
      "title": "Chlorophyll Light Absorption in Thylakoid Membranes",
      "summary": "Chlorophyll molecules absorb light energy within thylakoid membranes during photosynthesis light-dependent reactions to initiate the electron transport chain.",
      "relevanceScore": 0.9
    },
    {
      "title": "Calvin Cycle CO2 Fixation in Stroma", 
      "summary": "The Calvin cycle occurs in the chloroplast stroma and uses ATP and NADPH from light reactions to fix CO2 into glucose through carbon fixation.",
      "relevanceScore": 0.8
    }
  ]
}

**Example 3:**
Input: "Database concepts are fundamental. B-trees are balanced search trees where each node can have multiple keys. They maintain sorted order and guarantee O(log n) search time. Nodes split when they exceed capacity."

Thinking:
1. Skip generic "database concepts"
2. Focus on specific B-tree implementation details
3. Include performance characteristics and specific behaviors

Output: {
  "concepts": [
    {
      "title": "B-Tree Node Splitting Mechanism",
      "summary": "B-tree nodes automatically split when they exceed their maximum key capacity, redistributing keys to maintain balance and preserve O(log n) search time complexity.",
      "relevanceScore": 0.9
    },
    {
      "title": "B-Tree Balanced Multi-Key Node Structure", 
      "summary": "B-trees maintain balance by allowing each internal node to contain multiple keys in sorted order, ensuring all leaf nodes are at the same depth.",
      "relevanceScore": 0.8
    }
  ]
}

Now analyze the provided text and extract SPECIFIC, TESTABLE educational concepts:`;
  }

  /**
   * Get the enhanced system prompt for single-concept distillation
   * Uses Chain-of-Thought (CoT) and OCR-aware processing techniques
   * Focuses on extracting ONE SPECIFIC, TESTABLE concept for practice question generation
   */
  private getSystemPrompt(): string {
    return `You are an expert educational content analyst. Your task is to extract ONE SPECIFIC, TESTABLE educational concept from text that can be used to generate practice questions. The text may come from OCR and could contain noise or formatting artifacts.

## CRITICAL REQUIREMENT - EXTREME SPECIFICITY FOR FOLDER SYSTEM:
Extract the MOST SPECIFIC individual concept that can become a single flashcard. Must be narrow enough for one focused study session.

**TOO BROAD** (contains multiple flashcard topics):
- "Programming" → Contains variables, functions, loops, etc.
- "Quicksort Algorithm" → Contains pivot selection, partitioning, recursion
- "Photosynthesis" → Contains light reactions, Calvin cycle, chlorophyll
- "Cell Division" → Contains mitosis, meiosis, cytokinesis
- "HTTP Protocol" → Contains GET, POST, headers, status codes

**SPECIFIC ENOUGH** (individual flashcard topics):
- "Quicksort Pivot Selection Strategy" → ONE specific aspect
- "Chlorophyll a Light Absorption Wavelength" → ONE specific process
- "Mitosis Metaphase Chromosome Alignment" → ONE specific stage detail
- "HTTP GET Request Method" → ONE specific request type
- "Stack LIFO Pop Operation" → ONE specific operation

## REASONING APPROACH (Chain-of-Thought):
1. **Text Analysis**: Filter out OCR artifacts, navigation, non-educational content
2. **Specific Concept Identification**: Find the most detailed, specific educational process, algorithm, theorem, or concrete example
3. **Testability Check**: Ask "Can I create specific practice questions about this concept?"
4. **Specificity Selection**: Choose the most specific concept if multiple are present

## OCR TEXT HANDLING:
- Expect OCR errors: missing spaces, character substitutions, wrong line breaks
- Ignore artifacts: page numbers, headers, excessive whitespace
- Focus on substantive educational content with specific details

## SPECIFICITY GUIDELINES - INDIVIDUAL FLASHCARD RULE:
Extract ONE focused concept that fits on a single flashcard:
- "Stack LIFO Push Operation" not "Stack Data Structure" (push/pop are separate)
- "QuickSort Pivot Selection" not "QuickSort Algorithm" (pivot/partition are separate)
- "Mitosis Prophase Chromosome Condensation" not "Mitosis" (each phase is separate)
- "Chlorophyll a Blue Light Absorption" not "Photosynthesis" (light/Calvin cycle separate)
- "Binary Search Tree Left Child Rule" not "Binary Search Trees" (left/right rules separate)

## OUTPUT REQUIREMENTS:
- Extract ONE SPECIFIC concept (the most detailed and testable)
- Title: Specific and testable (max 100 chars)
- Summary: Include key details, processes, or implementation specifics (50-500 chars)
- If NO educational content found, return: {"title": "NOT_STUDY_CONTENT", "summary": "NOT_STUDY_CONTENT"}

## RESPONSE FORMAT:
Return valid JSON only in the following format:
{
  "title": "Specific Concept Name with Details",
  "summary": "Detailed explanation including specific processes, steps, or implementation details that enable practice question creation."
}

## FEW-SHOT EXAMPLES:

**Example 1:**
Input: "Next Page | Chapter 5: Photosynthesis light reactions occur in thylakoids where chlorophyll absorbs light ener9y. Click here! The Calvin cycle uses ATP and NADPH to fix CO2. 6CO2 + 6H2O → C6H12O6 + 6O2"

Thinking:
1. Remove navigation ("Next Page", "Click here") 
2. Identify specific concepts with implementation details
3. Choose most specific: light reactions have specific location and mechanism
4. Correct OCR error ("ener9y" → "energy")

Output: {"title": "Chlorophyll Light Absorption in Thylakoid Membranes", "summary": "Chlorophyll molecules in thylakoid membranes absorb light energy during photosynthesis to initiate electron transport chain reactions that produce ATP and NADPH."}

**Example 2:**
Input: "Programming concepts include algorithms. Quick sort uses divide and conquer by selecting a pivot element and partitioning the array around it. The average time complexity is O(n log n) but worst case is O(n²) when pivot is always smallest or largest."

Thinking:
1. Skip broad "programming concepts" and "algorithms"
2. Avoid broad "QuickSort algorithm" - focus on ONE specific aspect
3. Choose most specific: pivot selection strategy and its impact on complexity

Output: {"title": "QuickSort Worst Case O(n²) with Poor Pivot Selection", "summary": "QuickSort degrades to O(n²) time complexity when the pivot is consistently the smallest or largest element, causing unbalanced partitions and maximum recursive depth."}

**Example 3:**
Input: "Cell biology covers many topics. During mitosis prophase, chromatin condenses into visible chromosomes and the nuclear envelope begins to break down. Centrioles move to opposite poles to form spindle apparatus."

Thinking:
1. Avoid generic "cell biology" and "mitosis"
2. Focus on specific phase with detailed molecular events  
3. Include specific structures and processes for testable questions

Output: {"title": "Mitosis Prophase Chromosome Condensation", "summary": "During mitosis prophase, chromatin fibers condense and coil to form visible chromosomes while the nuclear envelope disintegrates and centrioles migrate to opposite cell poles."}

Now analyze the provided text and extract the MOST SPECIFIC, TESTABLE educational concept:`;
  }

  /**
   * Sanitize and validate title
   */
  private sanitizeTitle(title: string): string {
    if (!title || typeof title !== 'string') return 'Concept';
    
    // Remove potentially dangerous characters but keep educational symbols
    let cleaned = title.trim()
      .replace(/[<>{}[\]\\]/g, '') // Remove dangerous brackets and slashes
      .replace(/[^\w\s\-.,!?()\/:+=&%$#@*]/g, '') // Keep educational symbols
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Remove leading/trailing punctuation except for parentheses
    cleaned = cleaned.replace(/^[^\w(]+|[^\w)]+$/g, '');
    
    if (cleaned.length === 0) return 'Concept';
    if (cleaned.length > 100) {
      return cleaned.substring(0, 97) + '...';
    }
    return cleaned;
  }

  /**
   * Sanitize and validate summary
   */
  private sanitizeSummary(summary: string): string {
    if (!summary || typeof summary !== 'string') {
      return 'This concept provides important educational content for studying and learning.';
    }
    
    // Remove dangerous HTML/script content but keep educational text
    let cleaned = summary.trim()
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove JS protocols
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (cleaned.length < 50) {
      // Pad with educational placeholder if too short
      const padding = '. This concept provides important information for studying and learning purposes.';
      cleaned = cleaned + padding.substring(0, 500 - cleaned.length);
    }
    
    if (cleaned.length > 500) {
      // Find a good break point near the limit
      let breakPoint = 497;
      const lastSentence = cleaned.lastIndexOf('.', 497);
      const lastSpace = cleaned.lastIndexOf(' ', 497);
      
      if (lastSentence > 400) {
        breakPoint = lastSentence + 1;
      } else if (lastSpace > 400) {
        breakPoint = lastSpace;
      }
      
      return cleaned.substring(0, breakPoint).trim() + '...';
    }
    
    return cleaned;
  }

  /**
   * Fallback extraction when LLM fails
   */
  private extractFallback(candidate: ConceptCandidate): DistilledContent {
    const sentences = candidate.normalizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const title = sentences[0]?.trim().substring(0, 100) || 'Concept';
    const summary = candidate.normalizedText.substring(0, 500);

    return {
      title: this.sanitizeTitle(title),
      summary: this.sanitizeSummary(summary),
      contentHash: candidate.contentHash,
      cached: false,
      distilledAt: new Date()
    };
  }

  /**
   * Fallback extraction for multi-concept when LLM fails
   */
  private extractMultipleFallback(candidate: ConceptCandidate): MultiConceptDistillation {
    // Try to split text into paragraphs or sentences as potential concepts
    const paragraphs = candidate.normalizedText.split(/\n\n+/).filter(p => p.trim().length > 50);
    
    // If no good paragraphs, fall back to single concept
    if (paragraphs.length === 0) {
      const singleConcept: ExtractedConcept = {
        title: this.sanitizeTitle(candidate.normalizedText.substring(0, 100)),
        summary: this.sanitizeSummary(candidate.normalizedText.substring(0, 500)),
        relevanceScore: 0.5
      };
      
      return {
        concepts: [singleConcept],
        sourceContentHash: candidate.contentHash,
        totalConcepts: 1,
        cached: false,
        distilledAt: new Date()
      };
    }

    // Extract up to 3 concepts from paragraphs
    const concepts: ExtractedConcept[] = paragraphs.slice(0, 3).map((para, index) => {
      const sentences = para.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const title = sentences[0]?.trim().substring(0, 100) || `Concept ${index + 1}`;
      const summary = para.substring(0, 500);
      
      return {
        title: this.sanitizeTitle(title),
        summary: this.sanitizeSummary(summary),
        relevanceScore: 0.5
      };
    });

    return {
      concepts,
      sourceContentHash: candidate.contentHash,
      totalConcepts: concepts.length,
      cached: false,
      distilledAt: new Date()
    };
  }

  /**
   * Reset daily request counter
   */
  resetDailyCounter(): void {
    this.requestCount = 0;
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }
}