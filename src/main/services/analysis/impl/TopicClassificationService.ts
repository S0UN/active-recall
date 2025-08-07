import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { ClassificationError, ModelInitializationError, ModelInferenceError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';
import { SupportedModel, ModelInfo, MODEL_SPECIFICATIONS, DEFAULT_CLASSIFICATION_CONFIG } from '../IClassificationModelConfig';
import { HuggingFaceBridge, ClassificationRequest } from './HuggingFaceBridge';

export type ModelInfoWithName = ModelInfo & {
  modelName: SupportedModel;
}

export type TopicClassificationConfig = {
  topic: string;
  threshold: number;
}

const TextSchema = z.string()
  .min(1, "Text is required for classification")
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

const ThresholdSchema = z.number()
  .min(0, "Threshold must be at least 0")
  .max(1, "Threshold must be at most 1");

// Recommended thresholds based on our testing
export const RECOMMENDED_THRESHOLDS: Record<SupportedModel, number> = {
  'distilbert-base-uncased-mnli': 0.5,
  'roberta-large-mnli': 0.5,
  'facebook/bart-large-mnli': 0.5,
  'microsoft/deberta-v3-large': 0.5
};

@injectable()
export class TopicClassificationService implements IClassificationService {
  private huggingFaceBridge: HuggingFaceBridge | null = null;
  private readonly modelInfo: ModelInfo;
  private readonly topics: Set<string> = new Set();
  private threshold: number;
  private needsReinitialization = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly modelName: SupportedModel = 'facebook/bart-large-mnli'
  ) {
    this.modelInfo = this.getModelSpecification(modelName);
    this.threshold = this.getDefaultThreshold(modelName);
    this.setupDefaultTopics();
  }

  private getModelSpecification(modelName: SupportedModel): ModelInfo {
    const spec = MODEL_SPECIFICATIONS[modelName];
    if (!spec) {
      throw new ModelInitializationError(`Unknown model: ${modelName}`);
    }
    return spec;
  }

  private getDefaultThreshold(modelName: SupportedModel): number {
    return RECOMMENDED_THRESHOLDS[modelName] || DEFAULT_CLASSIFICATION_CONFIG.threshold;
  }

  private setupDefaultTopics(): void {
    const defaultTopic = DEFAULT_CLASSIFICATION_CONFIG.topic;
    if (defaultTopic) {
      this.topics.add(defaultTopic);
    }
  }

  public async init(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeClassifier();
    return this.initializationPromise;
  }

  private async initializeClassifier(): Promise<void> {
    try {
      Logger.info(`Initializing HuggingFace bridge for ${this.modelName}`);
      
      // Create and initialize the HuggingFace bridge
      this.huggingFaceBridge = new HuggingFaceBridge(this.modelName);
      await this.huggingFaceBridge.initialize();
      
      Logger.info(`Successfully initialized HuggingFace bridge for ${this.modelName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to initialize HuggingFace bridge: ${errorMessage}`);
      throw new ModelInitializationError(
        `Failed to initialize model ${this.modelName}: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async reinitializeClassifier(): Promise<void> {
    // Shutdown existing bridge if any
    if (this.huggingFaceBridge) {
      await this.huggingFaceBridge.shutdown();
      this.huggingFaceBridge = null;
    }
    
    // Reset initialization promise
    this.initializationPromise = null;
    
    // Reinitialize
    await this.init();
  }

  public setTopicConfig(topic?: string, threshold?: number): void {
    if (topic !== undefined) {
      this.updateTopics(topic);
    }
    
    if (threshold !== undefined) {
      this.updateThreshold(threshold);
    }
    
    this.logConfigurationChange();
  }

  public getTopicConfig(): TopicClassificationConfig | undefined {
    const primaryTopic = this.getPrimaryTopic();
    if (!primaryTopic) {
      return undefined;
    }
    
    return {
      topic: primaryTopic,
      threshold: this.threshold
    };
  }

  private updateTopics(topic: string): void {
    const validatedTopic = this.validateAndCleanTopic(topic);
    this.topics.clear();
    this.topics.add(validatedTopic);
    this.markForReinitialization();
  }

  private validateAndCleanTopic(topic: string): string {
    return TopicSchema.parse(topic);
  }

  private updateThreshold(threshold?: number): void {
    this.threshold = threshold !== undefined 
      ? ThresholdSchema.parse(threshold)
      : RECOMMENDED_THRESHOLDS[this.modelName];
  }

  private getPrimaryTopic(): string | undefined {
    return Array.from(this.topics)[0];
  }

  private markForReinitialization(): void {
    this.needsReinitialization = true;
  }

  private logConfigurationChange(): void {
    Logger.info(`Topic configuration updated:`, {
      topics: Array.from(this.topics),
      threshold: this.threshold,
      model: this.modelName
    });
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    await this.reinitializeIfNeeded();
    const validatedText = this.validateAndCleanText(text);
    this.ensureServiceIsReady();

    if (this.hasNoTopics()) {
      return this.createIdleResult();
    }

    const topicScores = await this.scoreAgainstAllTopics(validatedText);
    const bestMatch = this.findBestMatchingTopic(topicScores);
    const result = this.createClassificationResult(bestMatch);
    
    this.logClassificationResult(result, validatedText);
    
    return result;
  }

  private validateAndCleanText(text: unknown): string {
    if (typeof text !== 'string') {
      throw new ClassificationError('Text input must be a string');
    }
    return TextSchema.parse(text);
  }

  private ensureServiceIsReady(): void {
    if (!this.huggingFaceBridge || !this.huggingFaceBridge.ready) {
      throw new ModelInitializationError('Classification service not initialized');
    }
  }

  private hasNoTopics(): boolean {
    return this.topics.size === 0;
  }

  private createIdleResult(): ClassificationResult {
    return {
      classification: 'idle',
      confidence: 1.0
    };
  }

  private async scoreAgainstAllTopics(text: string): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    const topicArray = Array.from(this.topics);
    
    // Prepare labels for classification
    const labels = topicArray.concat(['idle']);
    
    try {
      // Use HuggingFace bridge for classification
      const request: ClassificationRequest = {
        text: text,
        labels: labels,
        multiLabel: false
      };
      
      const response = await this.huggingFaceBridge!.classify(request);
      
      // Map the response to our score format
      for (let i = 0; i < response.labels.length; i++) {
        const label = response.labels[i];
        const score = response.scores[i];
        
        // Only track scores for our topics (not 'idle')
        if (this.topics.has(label)) {
          scores.set(label, score);
        }
      }
      
      return scores;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown inference error';
      
      throw new ModelInferenceError(
        `Classification inference failed for model ${this.modelName}: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private findBestMatchingTopic(topicScores: Map<string, number>): { topic: string; confidence: number } {
    let bestTopic = 'idle';
    let bestConfidence = 0;

    for (const [topic, confidence] of topicScores) {
      if (confidence > bestConfidence) {
        bestTopic = topic;
        bestConfidence = confidence;
      }
    }

    return { topic: bestTopic, confidence: bestConfidence };
  }

  private createClassificationResult(bestMatch: { topic: string; confidence: number }): ClassificationResult {
    const classification = this.determineClassificationFromConfidence(
      bestMatch.topic, 
      bestMatch.confidence
    );
    
    return {
      classification,
      confidence: bestMatch.confidence
    };
  }

  private determineClassificationFromConfidence(topic: string, confidence: number): string {
    return this.isConfidenceAboveThreshold(confidence) ? topic : 'idle';
  }

  private isConfidenceAboveThreshold(confidence: number): boolean {
    return confidence >= this.threshold;
  }

  private logClassificationResult(result: ClassificationResult, text: string): void {
    Logger.debug('Classification result:', {
      text: this.truncateText(text, 100),
      classification: result.classification,
      confidence: result.confidence,
      threshold: this.threshold,
      model: this.modelName
    });
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  public getModelInfo(): ModelInfoWithName {
    return {
      ...this.modelInfo,
      modelName: this.modelName
    };
  }

  public async addLabel(label: unknown): Promise<void> {
    const cleanedLabel = this.validateAndCleanLabel(label);
    this.addLabelToCollection(cleanedLabel);
    await this.reinitializeIfNeeded();
    this.logLabelAdded(cleanedLabel);
  }

  public async removeLabel(label: unknown): Promise<void> {
    const cleanedLabel = this.validateAndCleanLabel(label);
    this.removeLabelFromCollection(cleanedLabel);
    await this.reinitializeIfNeeded();
    this.logLabelRemoved(cleanedLabel);
  }

  public getLabels(): string[] {
    return Array.from(this.topics);
  }

  private validateAndCleanLabel(label: unknown): string {
    const labelString = String(label);
    return TopicSchema.parse(labelString);
  }

  private addLabelToCollection(label: string): void {
    this.topics.add(label);
    this.markForReinitialization();
  }

  private removeLabelFromCollection(label: string): void {
    this.topics.delete(label);
    this.markForReinitialization();
  }

  private async reinitializeIfNeeded(): Promise<void> {
    if (this.needsReinitialization) {
      await this.reinitializeClassifier();
      this.needsReinitialization = false;
    }
  }

  private logLabelAdded(label: string): void {
    Logger.info(`Label added to classification service: ${label}`);
  }

  private logLabelRemoved(label: string): void {
    Logger.info(`Label removed from classification service: ${label}`);
  }

  // Cleanup method
  public async shutdown(): Promise<void> {
    if (this.huggingFaceBridge) {
      await this.huggingFaceBridge.shutdown();
      this.huggingFaceBridge = null;
    }
  }
}