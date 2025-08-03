import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';

export type EmbeddingModel = 
  | 'all-MiniLM-L6-v2'           // Fast, good performance
  | 'all-mpnet-base-v2'          // Better quality
  | 'e5-large-v2'                // Microsoft's latest
  | 'bge-base-en-v1.5'           // BAAI general embedding
  | 'sentence-t5-base'           // T5-based embeddings
  | 'gte-large';                 // Alibaba's GTE

export type EmbeddingModelInfo = {
  name: EmbeddingModel;
  size: string;
  speed: 'fast' | 'medium' | 'slow';
  quality: 'good' | 'better' | 'best';
  localPath: string;
  recommendedThreshold: number;
}

export const EMBEDDING_MODEL_SPECS: Record<EmbeddingModel, EmbeddingModelInfo> = {
  'all-MiniLM-L6-v2': {
    name: 'all-MiniLM-L6-v2',
    size: '90MB',
    speed: 'fast',
    quality: 'good',
    localPath: './models/all-MiniLM-L6-v2',
    recommendedThreshold: 0.65
  },
  'all-mpnet-base-v2': {
    name: 'all-mpnet-base-v2', 
    size: '420MB',
    speed: 'medium',
    quality: 'better',
    localPath: './models/all-mpnet-base-v2',
    recommendedThreshold: 0.7
  },
  'e5-large-v2': {
    name: 'e5-large-v2',
    size: '1.2GB',
    speed: 'slow',
    quality: 'best',
    localPath: './models/e5-large-v2',
    recommendedThreshold: 0.75
  },
  'bge-base-en-v1.5': {
    name: 'bge-base-en-v1.5',
    size: '420MB',
    speed: 'medium', 
    quality: 'better',
    localPath: './models/bge-base-en-v1.5',
    recommendedThreshold: 0.72
  },
  'sentence-t5-base': {
    name: 'sentence-t5-base',
    size: '220MB',
    speed: 'medium',
    quality: 'better',
    localPath: './models/sentence-t5-base',
    recommendedThreshold: 0.68
  },
  'gte-large': {
    name: 'gte-large',
    size: '670MB',
    speed: 'medium',
    quality: 'best',
    localPath: './models/gte-large',
    recommendedThreshold: 0.73
  }
};

const TextSchema = z.string()
  .min(1, "Text is required")
  .refine(str => str.trim().length > 0, {
    message: "Text cannot be empty"
  })
  .transform(str => str.trim());

const TopicSchema = z.string()
  .min(1, "Topic is required")
  .refine(str => str.trim().length > 0, {
    message: "Topic cannot be empty"
  })
  .transform(str => str.trim());

@injectable()
export class EmbeddingClassificationService implements IClassificationService {
  private encoderPromise?: Promise<any>;
  private currentTopic?: string;
  private topicEmbedding?: number[];
  private threshold: number;
  private readonly modelInfo: EmbeddingModelInfo;

  constructor(
    private readonly modelName: EmbeddingModel
  ) {
    this.modelInfo = EMBEDDING_MODEL_SPECS[modelName];
    this.threshold = this.modelInfo.recommendedThreshold;
  }

  public async init(): Promise<void> {
    this.configureOfflineMode();
    
    Logger.info(`Initializing EmbeddingClassificationService with model: ${this.modelName}`);
    
    // Load the sentence transformer model
    this.encoderPromise = pipeline('feature-extraction', this.modelName, {
      // pooling: 'mean', // Mean pooling for sentence embeddings (not supported in this version)
      // normalize: true  // L2 normalization (not supported in this version)
    });
  }

  public setTopicConfig(topic: string, threshold?: number): void {
    const validatedTopic = TopicSchema.parse(topic);
    
    if (threshold !== undefined) {
      if (threshold < 0 || threshold > 1) {
        throw new ClassificationError("Threshold must be between 0 and 1");
      }
      this.threshold = threshold;
    }

    this.currentTopic = validatedTopic;
    this.topicEmbedding = undefined; // Reset cached embedding
    
    Logger.info(`Topic configuration set:`, {
      topic: validatedTopic,
      threshold: this.threshold,
      model: this.modelName
    });
  }

  public getTopicConfig(): { topic: string; threshold: number } | undefined {
    if (!this.currentTopic) return undefined;
    return {
      topic: this.currentTopic,
      threshold: this.threshold
    };
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    const validatedText = TextSchema.parse(text);
    this.validateState();

    // Get topic embedding (cached after first call)
    if (!this.topicEmbedding) {
      this.topicEmbedding = await this.getEmbedding(this.currentTopic!);
    }

    // Get text embedding
    const textEmbedding = await this.getEmbedding(validatedText);

    // Calculate cosine similarity
    const similarity = this.cosineSimilarity(this.topicEmbedding, textEmbedding);
    
    const classification = similarity >= this.threshold ? 'studying' : 'idle';
    
    Logger.debug(`Embedding similarity result:`, {
      topic: this.currentTopic,
      similarity,
      threshold: this.threshold,
      classification,
      textPreview: validatedText.substring(0, 50) + '...'
    });

    return { 
      classification, 
      confidence: similarity // Use similarity as confidence score
    };
  }

  public getModelInfo(): EmbeddingModelInfo {
    return { ...this.modelInfo };
  }

  public addLabel(_label: unknown): void {
    throw new ClassificationError(
      "EmbeddingClassificationService does not support manual label management. Use setTopicConfig() instead."
    );
  }

  public removeLabel(_label: unknown): void {
    throw new ClassificationError(
      "EmbeddingClassificationService does not support manual label management. Use setTopicConfig() instead."
    );
  }

  public getLabels(): string[] {
    return this.currentTopic ? [this.currentTopic] : [];
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const encoder = await this.encoderPromise!;
    
    // Get embeddings - transformers.js returns nested arrays
    const result = await encoder(text);
    
    // Extract the actual embedding vector
    // The format might be [[embedding]] or [embedding] depending on the model
    let embedding: number[];
    if (Array.isArray(result.data)) {
      embedding = Array.from(result.data);
    } else if (result.length && Array.isArray(result[0])) {
      embedding = Array.from(result[0]);
    } else {
      embedding = Array.from(result);
    }
    
    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new ClassificationError("Embedding dimensions must match");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private validateState(): void {
    if (!this.encoderPromise) {
      throw new ClassificationError(
        "EmbeddingClassificationService must be initialized before use. Call init() first."
      );
    }
    
    if (!this.currentTopic) {
      throw new ClassificationError(
        "Topic configuration must be set before classification. Call setTopicConfig() first."
      );
    }
  }

  private configureOfflineMode(): void {
    env.allowRemoteModels = false;
    env.localModelPath = './models/';
  }
}