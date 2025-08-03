import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';
import { EmbeddingClassificationService, EmbeddingModel } from './EmbeddingClassificationService';
import { TopicClassificationService } from './TopicClassificationService';
import { SupportedModel } from '../IClassificationModelConfig';

export type HybridConfig = {
  topic: string;
  keywords?: string[];
  keywordWeight: number;      // 0-1, how much to weight keyword matching
  semanticWeight: number;     // 0-1, how much to weight semantic similarity  
  ensembleWeight: number;     // 0-1, how much to weight zero-shot classification
  threshold: number;          // Final threshold for classification
}

export type ClassificationScores = {
  keywordScore: number;
  semanticScore: number;
  ensembleScore: number;
  finalScore: number;
  breakdown: {
    keywordMatches: string[];
    semanticSimilarity: number;
    zeroShotConfidence: number;
  };
}

const TopicSchema = z.string()
  .min(1, "Topic is required")
  .refine(str => str.trim().length > 0, {
    message: "Topic cannot be empty"
  })
  .transform(str => str.trim());

const TextSchema = z.string()
  .min(1, "Text is required")
  .refine(str => str.trim().length > 0, {
    message: "Text cannot be empty"
  })
  .transform(str => str.trim());

@injectable()
export class HybridClassificationService implements IClassificationService {
  private embeddingService?: EmbeddingClassificationService;
  private zeroShotService?: TopicClassificationService;
  private currentConfig?: HybridConfig;
  private topicKeywords: Set<string> = new Set();

  constructor(
    private readonly embeddingModel: EmbeddingModel = 'all-MiniLM-L6-v2',
    private readonly zeroShotModel: SupportedModel = 'roberta-large-mnli'
  ) {}

  public async init(): Promise<void> {
    Logger.info(`Initializing HybridClassificationService with embedding: ${this.embeddingModel}, zero-shot: ${this.zeroShotModel}`);
    
    // Initialize both services
    this.embeddingService = new EmbeddingClassificationService(this.embeddingModel);
    this.zeroShotService = new TopicClassificationService(this.zeroShotModel);
    
    await Promise.all([
      this.embeddingService.init(),
      this.zeroShotService.init()
    ]);
  }

  public setTopicConfig(topic: string, config?: Partial<HybridConfig>): void {
    const validatedTopic = TopicSchema.parse(topic);
    
    // Default configuration
    this.currentConfig = {
      topic: validatedTopic,
      keywords: config?.keywords || this.generateTopicKeywords(validatedTopic),
      keywordWeight: config?.keywordWeight ?? 0.3,
      semanticWeight: config?.semanticWeight ?? 0.4,
      ensembleWeight: config?.ensembleWeight ?? 0.3,
      threshold: config?.threshold ?? 0.65,
      ...config
    };

    // Validate weights sum to 1
    const totalWeight = this.currentConfig.keywordWeight + 
                       this.currentConfig.semanticWeight + 
                       this.currentConfig.ensembleWeight;
    
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new ClassificationError("Weights must sum to 1.0");
    }

    // Set up keyword set for fast lookup
    this.topicKeywords = new Set(
      this.currentConfig.keywords?.map(k => k.toLowerCase()) || []
    );

    // Configure sub-services
    this.embeddingService?.setTopicConfig(validatedTopic);
    this.zeroShotService?.setTopicConfig(validatedTopic);

    Logger.info(`Hybrid configuration set:`, this.currentConfig);
  }

  public getTopicConfig(): HybridConfig | undefined {
    return this.currentConfig ? { ...this.currentConfig } : undefined;
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    const validatedText = TextSchema.parse(text);
    this.validateState();

    const scores = await this.calculateAllScores(validatedText);
    
    const classification = scores.finalScore >= this.currentConfig!.threshold ? 'studying' : 'idle';
    
    Logger.debug(`Hybrid classification result:`, {
      topic: this.currentConfig!.topic,
      scores,
      classification,
      textPreview: validatedText.substring(0, 50) + '...'
    });

    return {
      classification,
      confidence: scores.finalScore,
      // Include detailed breakdown in a custom property
      ...(scores as any)
    };
  }

  public async classifyWithScores(text: string): Promise<ClassificationScores & { classification: string }> {
    const validatedText = TextSchema.parse(text);
    this.validateState();

    const scores = await this.calculateAllScores(validatedText);
    const classification = scores.finalScore >= this.currentConfig!.threshold ? 'studying' : 'idle';

    return {
      ...scores,
      classification
    };
  }

  public getModelInfo(): any {
    return {
      embeddingModel: this.embeddingModel,
      zeroShotModel: this.zeroShotModel,
      approach: 'hybrid',
      components: ['keyword-matching', 'semantic-similarity', 'zero-shot-classification']
    };
  }

  public addLabel(_label: unknown): void {
    throw new ClassificationError(
      "HybridClassificationService does not support manual label management. Use setTopicConfig() instead."
    );
  }

  public removeLabel(_label: unknown): void {
    throw new ClassificationError(
      "HybridClassificationService does not support manual label management. Use setTopicConfig() instead."
    );
  }

  public getLabels(): string[] {
    return this.currentConfig ? [this.currentConfig.topic] : [];
  }

  private async calculateAllScores(text: string): Promise<ClassificationScores> {
    const [keywordResult, semanticResult, ensembleResult] = await Promise.all([
      this.calculateKeywordScore(text),
      this.embeddingService!.classifyWithConfidence(text),
      this.zeroShotService!.classifyWithConfidence(text)
    ]);

    const keywordScore = keywordResult.score;
    const semanticScore = semanticResult.confidence;
    const ensembleScore = ensembleResult.confidence;

    // Weighted combination
    const finalScore = 
      (keywordScore * this.currentConfig!.keywordWeight) +
      (semanticScore * this.currentConfig!.semanticWeight) +
      (ensembleScore * this.currentConfig!.ensembleWeight);

    return {
      keywordScore,
      semanticScore,
      ensembleScore,
      finalScore,
      breakdown: {
        keywordMatches: keywordResult.matches,
        semanticSimilarity: semanticScore,
        zeroShotConfidence: ensembleScore
      }
    };
  }

  private calculateKeywordScore(text: string): { score: number; matches: string[] } {
    const textLower = text.toLowerCase();
    const textWords = new Set(textLower.split(/\s+/));
    
    const matches: string[] = [];
    let matchCount = 0;
    
    // Check for exact keyword matches
    for (const keyword of this.topicKeywords) {
      if (textLower.includes(keyword)) {
        matches.push(keyword);
        matchCount++;
      }
    }
    
    // Check for word-level matches
    for (const word of textWords) {
      if (this.topicKeywords.has(word) && !matches.includes(word)) {
        matches.push(word);
        matchCount++;
      }
    }

    // Calculate score based on match ratio and text length
    const totalKeywords = this.topicKeywords.size;
    const matchRatio = matchCount / totalKeywords;
    
    // Boost score for multiple matches
    const matchBonus = Math.min(matchCount * 0.1, 0.3);
    const score = Math.min(matchRatio + matchBonus, 1.0);
    
    return { score, matches };
  }

  private generateTopicKeywords(topic: string): string[] {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const keywords = [...topicWords];
    
    // Add domain-specific keywords based on topic
    const expansions = this.getTopicExpansions(topic.toLowerCase());
    keywords.push(...expansions);
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  private getTopicExpansions(topic: string): string[] {
    const expansions: Record<string, string[]> = {
      'chemistry': [
        'molecular', 'atoms', 'molecules', 'reactions', 'compounds',
        'periodic', 'elements', 'bonds', 'organic', 'inorganic',
        'acid', 'base', 'ph', 'solution', 'catalyst', 'synthesis'
      ],
      'javascript': [
        'js', 'react', 'node', 'typescript', 'async', 'await',
        'promise', 'function', 'variable', 'array', 'object',
        'dom', 'event', 'callback', 'closure', 'prototype'
      ],
      'programming': [
        'code', 'coding', 'software', 'development', 'algorithm',
        'function', 'variable', 'class', 'method', 'api',
        'debugging', 'testing', 'framework', 'library'
      ],
      'machine learning': [
        'ml', 'ai', 'model', 'training', 'dataset', 'neural',
        'algorithm', 'regression', 'classification', 'clustering',
        'supervised', 'unsupervised', 'deep learning', 'tensorflow'
      ],
      'history': [
        'historical', 'century', 'war', 'empire', 'civilization',
        'ancient', 'medieval', 'renaissance', 'revolution',
        'cultural', 'political', 'social', 'economic'
      ]
    };

    // Find matching expansions
    for (const [key, values] of Object.entries(expansions)) {
      if (topic.includes(key)) {
        return values;
      }
    }

    return [];
  }

  private validateState(): void {
    if (!this.embeddingService || !this.zeroShotService) {
      throw new ClassificationError(
        "HybridClassificationService must be initialized before use. Call init() first."
      );
    }
    
    if (!this.currentConfig) {
      throw new ClassificationError(
        "Topic configuration must be set before classification. Call setTopicConfig() first."
      );
    }
  }
}