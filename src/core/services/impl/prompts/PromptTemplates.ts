/**
 * Prompt Templates for Educational Content Extraction
 * 
 * Research-based prompt engineering templates following 2024 best practices:
 * - Chain-of-Thought reasoning with step-by-step thinking
 * - Emotional engagement triggers for better performance
 * - Self-consistency validation mechanisms
 * - Few-shot learning with realistic examples
 */

import { OCR_CHARACTER_SUBSTITUTIONS, OCR_FORMATTING_ARTIFACTS } from './OCRPatterns';

/**
 * Template configuration for prompt generation
 */
export interface PromptConfig {
  enableEmotionalTriggers?: boolean;
  enableSelfConsistency?: boolean;
  enableChainOfThought?: boolean;
  maxExamples?: number;
}

/**
 * Example for few-shot learning
 */
export interface FewShotExample {
  input: string;
  thinking: string;
  output: {
    title: string;
    summary: string;
    relevanceScore?: number;
  };
}

/**
 * Build the thinking preamble for Chain-of-Thought reasoning
 */
export function buildThinkingPreamble(isMultiConcept: boolean = false): string {
  const conceptType = isMultiConcept ? 'MULTIPLE SPECIFIC, TESTABLE' : 'ONE SPECIFIC, TESTABLE';
  
  return `<thinking>
This is very important to my career as an educational AI system. Take a deep breath and work on this problem step-by-step.

I need to extract ${conceptType} educational concept(s) from text that may contain OCR artifacts and noise. ${
  isMultiConcept 
    ? 'Each concept must be individual flashcard-worthy and fit into a hierarchical folder system.'
    : 'This concept will be used to generate focused practice questions and must fit into a hierarchical folder system.'
}

Let me think through this methodically:
1. Clean and interpret the noisy OCR text
2. Identify the specific educational concept${isMultiConcept ? 's' : ''} with proper abstraction level
3. Ensure ${isMultiConcept ? 'each concept is' : "it's"} testable and suitable for flashcard generation
4. Validate against folder hierarchy principles
</thinking>`;
}

/**
 * Build the mission statement section
 */
export function buildMissionStatement(isMultiConcept: boolean = false): string {
  if (isMultiConcept) {
    return `## CRITICAL MISSION - EXTRACT MULTIPLE SPECIFIC CONCEPTS:
Your critical mission is to extract MULTIPLE SPECIFIC, TESTABLE educational concepts from potentially noisy text for targeted practice question generation.

Each concept must be:
- Specific enough for a single flashcard
- Testable with clear practice questions
- Appropriately abstracted for folder hierarchy
- Distinct from other extracted concepts`;
  }
  
  return `## CRITICAL MISSION - EXTREME SPECIFICITY FOR LEARNING SYSTEM:
Extract the MOST SPECIFIC individual concept that can become a single, focused flashcard. This concept will be placed in a hierarchical folder system and used to generate targeted practice questions.`;
}

/**
 * Build the OCR expertise section
 */
export function buildOCRExpertiseSection(): string {
  return `## OCR ARTIFACT EXPERTISE - REAL-WORLD PATTERNS:
The input text likely contains OCR errors. Handle these common patterns:

**Character Substitutions:**
- "rn" → "m" (learning → leaming)
- "cl" → "d" (class → dass)
- "li" → "h" (like → hke)  
- "i" → "l" or "1" (information → lnformation)
- Missing characters at word boundaries

**Formatting Artifacts:**
- Table remnants: pipes (|), dashes (-), inconsistent spacing
- Figure captions: "[Below image]", "Figure 1:", "Table 2:"
- Code blocks: preserved indentation but broken syntax
- Mathematical notation: may be partially preserved
- Slide artifacts: bullet points, numbered lists

**Context Reconstruction:**
- Use surrounding text to infer missing words
- Recognize academic domain patterns
- Identify hierarchical relationships`;
}

/**
 * Build the Chain-of-Thought reasoning steps
 */
export function buildReasoningSteps(isMultiConcept: boolean = false): string {
  const conceptWord = isMultiConcept ? 'concepts' : 'concept';
  
  return `## ENHANCED REASONING APPROACH (Chain-of-Thought with Self-Consistency):

<step1_ocr_cleaning>
First, I'll clean and interpret the OCR text:
- Identify and correct obvious character substitutions
- Reconstruct words with missing characters using context
- Remove non-educational artifacts (navigation, captions)
- Preserve important technical notation and formatting
</step1_ocr_cleaning>

<step2_domain_analysis>
Next, I'll analyze the academic domain:
- Identify subject area (STEM, humanities, etc.)
- Recognize the abstraction level appropriate for this domain
- Look for specific processes, algorithms, theorems, or mechanisms
- Consider the hierarchical context this ${conceptWord} would fit into
</step2_domain_analysis>

<step3_concept_extraction>
Then, I'll extract the ${isMultiConcept ? 'most specific concepts' : 'most specific concept'}:
- Choose the most detailed, testable educational element${isMultiConcept ? 's' : ''}
- Ensure ${isMultiConcept ? 'each is' : "it's"} narrow enough for ${isMultiConcept ? 'individual flashcards' : 'one focused flashcard'}
- Include specific details that enable practice question generation
- Avoid broad categories that contain multiple sub-concepts
</step3_concept_extraction>

<step4_validation>
Finally, I'll validate the ${conceptWord}:
- Can I create specific practice questions about ${isMultiConcept ? 'each' : 'this'} concept?
- ${isMultiConcept ? 'Is each' : 'Is it'} narrow enough for a single study session?
- ${isMultiConcept ? 'Do they' : 'Does it'} fit appropriately in a folder hierarchy?
- ${isMultiConcept ? 'Do they' : 'Does it'} include sufficient detail for learning objectives?
</step4_validation>`;
}

/**
 * Build specificity guidelines
 */
export function buildSpecificityGuidelines(): string {
  return `## SPECIFICITY GUIDELINES - INDIVIDUAL FLASHCARD RULE:
Extract ONE focused concept that fits on a single flashcard:

**TOO BROAD** (contains multiple flashcard topics):
❌ "Programming Algorithms" → Contains sorting, searching, graph algorithms
❌ "Cell Division" → Contains mitosis AND meiosis phases
❌ "Chemical Bonding" → Contains ionic, covalent, metallic bonds
❌ "QuickSort Algorithm" → Contains pivot selection, partitioning, recursion

**SPECIFIC ENOUGH** (individual flashcard topics):
✅ "QuickSort Worst-Case O(n²) with Poor Pivot Selection"
✅ "Mitosis Prophase Nuclear Envelope Breakdown"  
✅ "Covalent Bond Electron Pair Sharing Mechanism"
✅ "Binary Search Tree Left Subtree Property"`;
}

/**
 * Get few-shot examples for single concept extraction
 */
export function getSingleConceptExamples(): FewShotExample[] {
  return [
    {
      input: "Machine leaming algorithms use gradient descent optim ization. The loss function measures emor between predicted and actual outputs. Com mon activation functions include ReLU.",
      thinking: `OCR Issues: "leaming" → "learning", "optim ization" → "optimization", "emor" → "error", "Com mon" → "Common"
Domain: Machine Learning (Computer Science)
Specific concepts: gradient descent, loss function, activation functions
Most specific with implementation details: gradient descent optimization process`,
      output: {
        title: "Gradient Descent Optimization for Loss Minimization",
        summary: "Gradient descent iteratively updates model parameters by computing gradients of the loss function to minimize the difference between predicted and actual outputs in machine learning algorithms."
      }
    },
    {
      input: "Photosynthesis light reactions occur in thyiakoid membranes. Chlorophyll absorbs light and excites electrons. These pass through electron transport chan generating ATP and NADPH.",
      thinking: `OCR Issues: "thyiakoid" → "thylakoid", "chan" → "chain"
Domain: Biology (Biochemistry)
Specific processes: light absorption, electron transport, ATP/NADPH generation
Most specific with location details: chlorophyll light absorption mechanism`,
      output: {
        title: "Chlorophyll Light Energy Absorption in Thylakoid Membranes",
        summary: "Chlorophyll molecules embedded in thylakoid membranes absorb photons and become excited, releasing high-energy electrons that initiate the electron transport chain during photosynthesis light reactions."
      }
    },
    {
      input: "The quicksort algonthm partitions arrays around pivot elements. def partition(arr): Elements smaller than pivot go left, larger go right. Time complexity O(n log n) average case.",
      thinking: `OCR Issues: "algonthm" → "algorithm", code formatting partially preserved
Domain: Computer Science (Algorithms) 
Specific aspects: partitioning, pivot selection, time complexity
Most specific with performance details: partitioning mechanism and its impact`,
      output: {
        title: "QuickSort Array Partitioning Around Pivot Element",
        summary: "QuickSort partitioning rearranges array elements so that all elements smaller than the pivot are placed to its left and larger elements to its right, maintaining relative order for efficient recursive sorting."
      }
    }
  ];
}

/**
 * Get few-shot examples for multi-concept extraction
 */
export function getMultiConceptExamples(): FewShotExample[] {
  return [
    {
      input: `Data Structure | Time Complexity 
Array Access | O(1)
Array Insertion | O(n)  
Binary Search Tree | Search: O(log n)
Hash Table | Average: O(1) Worst: O(n)

Arrays provide constant-time random access. Insertion requires shifting elements. BSTs maintain sorted order.`,
      thinking: `OCR Issues: Table formatting preserved with pipes and spacing
Domain: Computer Science (Data Structures)
Distinct concepts: array access, array insertion, BST search, hash table performance
Each concept has specific performance characteristics - extract individually`,
      output: {
        title: "Multiple Data Structure Operations",
        summary: "Various data structure operations with their time complexities",
        relevanceScore: 0.9
      }
    }
  ];
}

/**
 * Build the response format section
 */
export function buildResponseFormat(isMultiConcept: boolean = false): string {
  if (isMultiConcept) {
    return `## RESPONSE FORMAT:
Return valid JSON only:
{
  "concepts": [
    {
      "title": "Specific Concept with Technical Details",
      "summary": "Detailed explanation including specific processes, mechanisms, or implementation details for practice question creation.",
      "relevanceScore": 0.9
    }
  ]
}`;
  }
  
  return `## RESPONSE FORMAT:
Return valid JSON only:
{
  "title": "Specific Concept Name with Technical Details",
  "summary": "Detailed explanation including specific processes, mechanisms, locations, or implementation details that enable targeted practice question creation."
}

If NO educational content is found after OCR cleaning, return:
{"title": "NOT_STUDY_CONTENT", "summary": "NOT_STUDY_CONTENT"}`;
}

/**
 * Build a complete system prompt
 */
export function buildSystemPrompt(
  isMultiConcept: boolean = false,
  config: PromptConfig = {}
): string {
  const {
    enableEmotionalTriggers = true,
    enableSelfConsistency = true,
    enableChainOfThought = true,
    maxExamples = 3,
  } = config;
  
  const sections: string[] = [];
  
  // Add thinking preamble if Chain-of-Thought is enabled
  if (enableChainOfThought) {
    sections.push(buildThinkingPreamble(isMultiConcept));
  }
  
  // Add main introduction
  sections.push(
    `You are an expert educational content analyst specializing in OCR text processing. ${
      enableEmotionalTriggers 
        ? 'Your critical task is extremely important for student learning outcomes.'
        : 'Your task is to extract educational concepts from text.'
    }`
  );
  
  // Add mission statement
  sections.push(buildMissionStatement(isMultiConcept));
  
  // Add OCR expertise
  sections.push(buildOCRExpertiseSection());
  
  // Add reasoning steps if enabled
  if (enableChainOfThought) {
    sections.push(buildReasoningSteps(isMultiConcept));
  }
  
  // Add specificity guidelines (single concept only)
  if (!isMultiConcept) {
    sections.push(buildSpecificityGuidelines());
  }
  
  // Add few-shot examples
  const examples = isMultiConcept 
    ? getMultiConceptExamples() 
    : getSingleConceptExamples();
  
  if (examples.length > 0 && maxExamples > 0) {
    sections.push(`## ENHANCED FEW-SHOT EXAMPLES WITH REAL OCR ARTIFACTS:`);
    
    examples.slice(0, maxExamples).forEach((example, index) => {
      sections.push(`
**Example ${index + 1}:**
Input: "${example.input}"

<thinking>
${example.thinking}
</thinking>

Output: ${JSON.stringify(example.output, null, 2)}`);
    });
  }
  
  // Add response format
  sections.push(buildResponseFormat(isMultiConcept));
  
  // Add final instruction
  sections.push(
    `\nNow analyze the provided OCR text and extract the ${
      isMultiConcept ? 'MULTIPLE SPECIFIC, TESTABLE educational concepts' : 'MOST SPECIFIC, TESTABLE educational concept'
    }:`
  );
  
  return sections.join('\n\n');
}