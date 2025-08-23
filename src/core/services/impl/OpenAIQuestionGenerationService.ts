/**
 * OpenAIQuestionGenerationService - Production-grade LLM question generation
 * 
 * Features:
 * - Multiple question types with adaptive difficulty based on spaced repetition data
 * - Advanced prompting with Chain-of-Thought reasoning for educational questions
 * - Spaced repetition integration for optimal learning progression
 * - Production-grade error handling and fallback mechanisms
 * - Intelligent caching to reduce API costs and improve performance
 * - Comprehensive input validation and sanitization
 * 
 * The service uses OpenAI's GPT models with structured JSON responses
 * and implements educational best practices for question generation.
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { 
  DistilledContent,
  QuestionType,
  QuestionDifficulty,
  GeneratedQuestion,
  QuestionGenerationRequest,
  QuestionGenerationResult,
  QuestionGenerationRequestSchema,
  QuestionGenerationResultSchema,
  GeneratedQuestionSchema
} from '../../contracts/schemas';
import { 
  IQuestionGenerationService, 
  QuestionGenerationServiceRequest,
  QuestionGenerationConfig, 
  QuestionGenerationError, 
  QuestionGenerationTimeoutError,
  QuestionGenerationQuotaError,
  QuestionGenerationValidationError,
  QuestionGenerationProviderError
} from '../IQuestionGenerationService';
import { IContentCache } from '../IContentCache';

export class OpenAIQuestionGenerationService implements IQuestionGenerationService {
  private readonly openAiClient: OpenAI;
  private readonly config: QuestionGenerationConfig;
  private readonly contentCache: IContentCache;
  private requestCount = 0;

  constructor(config: QuestionGenerationConfig, cache: IContentCache) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required for question generation');
    }

    this.config = config;
    this.contentCache = cache;
    this.openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.requestTimeout || 45000, // 45 second timeout for question generation
    });
  }

  /**
   * Generate questions from a distilled concept
   * 
   * Creates targeted questions based on the concept content and current
   * spaced repetition performance data to provide optimal learning challenge.
   */
  async generateQuestions(request: QuestionGenerationServiceRequest): Promise<QuestionGenerationResult> {
    this.validateInput(request);
    
    // Create cache key based on concept and request parameters
    const cacheKey = this.createCacheKey(request);
    
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = await this.contentCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            cached: true
          }
        };
      }
    }

    // Check daily limits
    const dailyLimit = this.config.dailyRequestLimit || 500;
    if (this.requestCount >= dailyLimit) {
      throw new QuestionGenerationQuotaError(
        `Daily API limit reached (${dailyLimit} requests)`
      );
    }

    try {
      const startTime = Date.now();
      
      // Convert service request to schema-validated request
      const schemaRequest = this.convertToSchemaRequest(request);
      
      const response = await this.openAiClient.chat.completions.create({
        model: this.config.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: this.buildUserPrompt(schemaRequest)
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: this.config.maxTokens || 800,
        temperature: this.config.temperature || 0.3,
      });

      this.requestCount++;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new QuestionGenerationError('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Process and validate the response
      const result = await this.processResponse(parsed, schemaRequest, startTime, response.usage);
      
      // Cache the result
      if (this.config.cacheEnabled) {
        await this.contentCache.set(cacheKey, result, 7 * 24 * 60 * 60); // 7 days
      }

      return result;

    } catch (error) {
      return this.handleQuestionGenerationError(error, request);
    }
  }

  /**
   * Generate questions for multiple concepts efficiently
   * 
   * Optimized batch processing for generating questions across multiple
   * concepts in a single API call to reduce latency and costs.
   */
  async generateQuestionsForConcepts(requests: QuestionGenerationServiceRequest[]): Promise<QuestionGenerationResult[]> {
    if (!this.config.batchProcessing) {
      // Fall back to individual processing if batch processing is disabled
      return Promise.all(requests.map(request => this.generateQuestions(request)));
    }

    // For now, implement sequential processing
    // TODO: Implement true batch processing in future iteration
    const results: QuestionGenerationResult[] = [];
    
    for (const request of requests) {
      try {
        const result = await this.generateQuestions(request);
        results.push(result);
      } catch (error) {
        // Continue with other requests even if one fails
        const failedResult: QuestionGenerationResult = {
          questions: [],
          requestedCount: request.count || 5,
          generatedCount: 0,
          metadata: {
            processingTimeMs: 0,
            tokensUsed: 0,
            model: this.config.model || 'gpt-3.5-turbo',
            promptVersion: 'v1.0-educational',
            cached: false,
          },
          warnings: [`Failed to generate questions: ${error}`],
          qualityScore: 0,
        };
        results.push(failedResult);
      }
    }
    
    return results;
  }

  /**
   * Validate question quality and educational value
   */
  async validateQuestion(question: GeneratedQuestion): Promise<{
    isValid: boolean;
    qualityScore: number;
    feedback: string[];
    suggestions?: string[];
  }> {
    const feedback: string[] = [];
    let qualityScore = 1.0;

    // Validate against schema first
    try {
      GeneratedQuestionSchema.parse(question);
    } catch (error: any) {
      feedback.push('Schema validation failed');
      qualityScore = 0;
      return { isValid: false, qualityScore, feedback };
    }

    // Educational quality checks
    if (question.question.length < 15) {
      feedback.push('Question text is too short for meaningful assessment');
      qualityScore -= 0.2;
    }

    if (question.type === 'multiple_choice' && (!question.distractors || question.distractors.length < 2)) {
      feedback.push('Multiple choice questions need at least 2 distractors');
      qualityScore -= 0.3;
    }

    if (!question.explanation || question.explanation.length < 20) {
      feedback.push('Explanation is too brief or missing');
      qualityScore -= 0.1;
    }

    // Check for educational appropriateness
    const suspiciousPatterns = [
      /\b(buy|purchase|sale|discount|price)\b/i, // Commercial content
      /\b(click here|download now)\b/i, // Marketing language
      /\b(fuck|shit|damn)\b/i, // Inappropriate language
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(question.question) || pattern.test(question.explanation || '')) {
        feedback.push('Question contains inappropriate or non-educational content');
        qualityScore -= 0.5;
        break;
      }
    }

    const isValid = qualityScore >= (this.config.qualityThreshold || 0.7);
    
    return {
      isValid,
      qualityScore: Math.max(0, qualityScore),
      feedback,
      suggestions: isValid ? undefined : ['Consider regenerating this question with more specific prompts']
    };
  }

  /**
   * Get question difficulty recommendation based on spaced repetition data
   */
  getRecommendedDifficulty(performanceData: {
    easeFactor: number;
    repetitions: number;
    successRate: number;
    avgResponseTime?: number;
  }): QuestionDifficulty {
    const { easeFactor, repetitions, successRate } = performanceData;

    // New concepts (low repetitions)
    if (repetitions <= 2) {
      return 'beginner';
    }

    // High success rate and ease factor - increase difficulty
    if (successRate >= 0.85 && easeFactor >= 2.3) {
      return repetitions >= 8 ? 'advanced' : 'intermediate';
    }

    // Low success rate or ease factor - reduce difficulty
    if (successRate < 0.6 || easeFactor < 1.8) {
      return 'review';
    }

    // Default to intermediate for balanced performance
    return 'intermediate';
  }

  /**
   * Get the identifier of the question generation provider
   */
  getProvider(): string {
    return 'openai';
  }

  /**
   * Get current request usage statistics
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset daily usage counters
   */
  resetDailyCounter(): void {
    this.requestCount = 0;
  }

  /**
   * Validate input before processing
   */
  private validateInput(request: QuestionGenerationServiceRequest): void {
    if (!request) {
      throw new QuestionGenerationValidationError('Request is required', ['Request cannot be null or undefined']);
    }

    if (!request.concept) {
      throw new QuestionGenerationValidationError('Concept is required', ['Request must include a concept to generate questions from']);
    }

    if (!request.concept.title || typeof request.concept.title !== 'string') {
      throw new QuestionGenerationValidationError('Concept must have valid title', ['Concept title is required for question generation']);
    }

    if (!request.concept.summary || typeof request.concept.summary !== 'string') {
      throw new QuestionGenerationValidationError('Concept must have valid summary', ['Concept summary is required for question generation']);
    }

    if (request.concept.title.length < 3) {
      throw new QuestionGenerationValidationError('Concept title too short', ['Concept title must be at least 3 characters']);
    }

    if (request.concept.summary.length < 20) {
      throw new QuestionGenerationValidationError('Concept summary too short', ['Concept summary must be at least 20 characters for meaningful questions']);
    }

    if (request.count && (request.count < 1 || request.count > 20)) {
      throw new QuestionGenerationValidationError('Invalid question count', ['Question count must be between 1 and 20']);
    }

    // Check for suspicious patterns that might indicate malicious input
    const suspiciousPatterns = [
      /\b(DROP|DELETE|INSERT|UPDATE|UNION|SELECT)\s+/i, // SQL injection patterns
      /<script[\s\S]*?>[\s\S]*?<\/script>/i, // Script tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers
    ];

    const textToCheck = `${request.concept.title} ${request.concept.summary} ${request.additionalContext || ''}`;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(textToCheck)) {
        throw new QuestionGenerationValidationError('Request contains potentially malicious content', ['Input failed security validation']);
      }
    }
  }

  /**
   * Create cache key for request
   */
  private createCacheKey(request: QuestionGenerationServiceRequest): string {
    const keyData = {
      contentHash: request.concept.contentHash,
      count: request.count || 5,
      questionTypes: request.questionTypes?.sort() || [],
      targetDifficulty: request.targetDifficulty || 'intermediate',
      performanceContext: request.performanceContext || null,
      additionalContext: request.additionalContext || '',
    };
    
    const keyString = JSON.stringify(keyData);
    return `question_gen_${createHash('sha256').update(keyString).digest('hex').substring(0, 16)}`;
  }

  /**
   * Convert service request to schema-validated request
   */
  private convertToSchemaRequest(request: QuestionGenerationServiceRequest): QuestionGenerationRequest {
    return QuestionGenerationRequestSchema.parse({
      conceptId: `temp_${Date.now()}`, // Temporary ID for processing
      conceptTitle: request.concept.title,
      conceptSummary: request.concept.summary,
      sourceContentHash: request.concept.contentHash,
      count: request.count || 5,
      questionTypes: request.questionTypes,
      targetDifficulty: request.targetDifficulty,
      performanceContext: request.performanceContext,
      additionalContext: request.additionalContext,
      learningGoals: request.learningGoals,
      existingQuestions: request.existingQuestions,
    });
  }

  /**
   * Get the comprehensive system prompt for question generation
   */
  private getSystemPrompt(): string {
    return `You are an expert educational question generator. Your task is to create high-quality, pedagogically sound questions from educational concepts that promote deep learning and understanding.

## CORE PRINCIPLES:
1. Questions must be SPECIFIC and directly related to the concept
2. Each question should test ONE clear learning objective
3. Questions should promote active recall and deep thinking
4. Avoid ambiguous or trick questions
5. Include clear, educational explanations

## QUESTION TYPES:
- **flashcard**: Simple question-answer pairs for basic recall
- **multiple_choice**: Multiple choice with 3-4 plausible distractors
- **short_answer**: Open-ended questions requiring brief explanations
- **true_false**: True/false with detailed explanations of why
- **fill_blank**: Fill-in-the-blank with context clues
- **concept_map**: Questions about relationships between concepts

## DIFFICULTY LEVELS:
- **beginner**: Basic recall, definitions, simple examples
- **intermediate**: Application, analysis, moderate complexity
- **advanced**: Synthesis, evaluation, edge cases, complex scenarios
- **review**: Quick recall refreshers for reinforcement

## RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "questions": [
    {
      "type": "flashcard|multiple_choice|short_answer|true_false|fill_blank|concept_map",
      "difficulty": "beginner|intermediate|advanced|review",
      "question": "Clear, specific question text",
      "correctAnswer": "string or array of strings",
      "distractors": ["array", "of", "plausible", "wrong", "answers"], // only for multiple_choice
      "explanation": "Educational explanation of the correct answer",
      "conceptArea": "Main concept being tested",
      "learningObjective": "What this question assesses",
      "estimatedTimeSeconds": 30,
      "tags": ["relevant", "keywords"],
      "confidence": 0.9
    }
  ],
  "metadata": {
    "totalGenerated": 5,
    "averageConfidence": 0.85,
    "coverageAnalysis": "Brief assessment of concept coverage"
  }
}

## QUALITY STANDARDS:
- Questions must be grammatically correct and clear
- Multiple choice distractors should be plausible but clearly wrong
- Explanations should teach, not just confirm the answer
- Avoid questions that can be answered without understanding the concept
- Test understanding, not memorization of exact wording`;
  }

  /**
   * Build user prompt with concept and context
   */
  private buildUserPrompt(request: QuestionGenerationRequest): string {
    let prompt = `Generate ${request.count || 5} educational questions for this concept:

**Concept Title:** ${request.conceptTitle}
**Concept Summary:** ${request.conceptSummary}`;

    if (request.targetDifficulty) {
      prompt += `\n**Target Difficulty:** ${request.targetDifficulty}`;
    }

    if (request.questionTypes && request.questionTypes.length > 0) {
      prompt += `\n**Preferred Question Types:** ${request.questionTypes.join(', ')}`;
    }

    if (request.performanceContext) {
      const { easeFactor, repetitions, lastResponseQuality } = request.performanceContext;
      const performanceLevel = easeFactor >= 2.3 ? 'high' : easeFactor <= 1.8 ? 'struggling' : 'moderate';
      prompt += `\n**Student Performance:** ${performanceLevel} (${repetitions} reviews, ease factor ${easeFactor})`;
    }

    if (request.additionalContext) {
      prompt += `\n**Additional Context:** ${request.additionalContext}`;
    }

    if (request.learningGoals && request.learningGoals.length > 0) {
      prompt += `\n**Learning Goals:** ${request.learningGoals.join(', ')}`;
    }

    if (request.existingQuestions && request.existingQuestions.length > 0) {
      prompt += `\n**Avoid Similar To:** ${request.existingQuestions.slice(0, 3).join('; ')}`;
    }

    prompt += `\n\nGenerate questions that are educationally valuable, promote understanding, and match the specified criteria. Return only the JSON response.`;

    return prompt;
  }

  /**
   * Process and validate the OpenAI response
   */
  private async processResponse(
    parsed: any, 
    request: QuestionGenerationRequest, 
    startTime: number,
    usage: any
  ): Promise<QuestionGenerationResult> {
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new QuestionGenerationError('Invalid response format: missing questions array');
    }

    const questions: GeneratedQuestion[] = [];
    const warnings: string[] = [];

    for (const [index, questionData] of parsed.questions.entries()) {
      try {
        const question: GeneratedQuestion = {
          id: `q_${createHash('sha256').update(`${request.sourceContentHash}_${index}_${Date.now()}`).digest('hex').substring(0, 12)}`,
          type: questionData.type || 'flashcard',
          difficulty: questionData.difficulty || request.targetDifficulty || 'intermediate',
          question: questionData.question || '',
          correctAnswer: questionData.correctAnswer || '',
          distractors: questionData.distractors,
          explanation: questionData.explanation || '',
          conceptArea: questionData.conceptArea || request.conceptTitle,
          learningObjective: questionData.learningObjective,
          estimatedTimeSeconds: questionData.estimatedTimeSeconds || 30,
          tags: questionData.tags || [],
          sourceContentHash: request.sourceContentHash,
          confidence: questionData.confidence || 0.8,
          metadata: {
            model: this.config.model || 'gpt-3.5-turbo',
            promptVersion: 'v1.0-educational',
            tokensUsed: usage?.total_tokens || 0,
            generatedAt: new Date(),
          },
        };

        // Validate each question
        if (this.config.enableValidation) {
          const validation = await this.validateQuestion(question);
          if (!validation.isValid) {
            warnings.push(`Question ${index + 1} failed validation: ${validation.feedback.join(', ')}`);
            continue;
          }
        }

        questions.push(question);
      } catch (error) {
        warnings.push(`Failed to process question ${index + 1}: ${error}`);
      }
    }

    const result: QuestionGenerationResult = {
      questions,
      requestedCount: request.count || 5,
      generatedCount: questions.length,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        tokensUsed: usage?.total_tokens || 0,
        model: this.config.model || 'gpt-3.5-turbo',
        promptVersion: 'v1.0-educational',
        cached: false,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      qualityScore: parsed.metadata?.averageConfidence || 0.8,
    };

    // Validate final result against schema
    return QuestionGenerationResultSchema.parse(result);
  }

  /**
   * Handle errors during question generation
   */
  private handleQuestionGenerationError(error: any, request: QuestionGenerationServiceRequest): never {
    // OpenAI API errors
    if (error.status) {
      if (error.status === 429) {
        throw new QuestionGenerationQuotaError('OpenAI API rate limit exceeded', 'api');
      }
      if (error.status === 401) {
        throw new QuestionGenerationProviderError('Invalid OpenAI API key', 'openai', error.status);
      }
      if (error.status >= 500) {
        throw new QuestionGenerationProviderError('OpenAI service unavailable', 'openai', error.status);
      }
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw new QuestionGenerationTimeoutError(this.config.requestTimeout || 45000);
    }

    // JSON parsing errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      throw new QuestionGenerationError('Invalid JSON response from OpenAI', error);
    }

    // Zod validation errors
    if (error.name === 'ZodError') {
      const zodError = error as any;
      const errorMessage = zodError.issues?.map((issue: any) => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ') || 'Validation failed';
      
      throw new QuestionGenerationValidationError(`Schema validation failed: ${errorMessage}`, zodError.issues || []);
    }

    // Default error handling
    throw new QuestionGenerationError(
      `OpenAI question generation failed: ${error}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}