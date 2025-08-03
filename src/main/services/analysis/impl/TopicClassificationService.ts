import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';
import { SupportedModel, ModelInfo, MODEL_SPECIFICATIONS } from '../IClassificationModelConfig';

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
  'distilbert-base-uncased-mnli': 0.3,
  'roberta-large-mnli': 0.5,
  'facebook/bart-large-mnli': 0.7,
  'microsoft/deberta-v3-large': 0.5
};

@injectable()
export class TopicClassificationService implements IClassificationService {
  private classifierPromise?: Promise<any>;
  private readonly modelInfo: ModelInfo;
  private readonly topics: Set<string> = new Set();
  private threshold: number;
  private needsReinitialization: boolean = false;

  constructor(
    private readonly modelName: SupportedModel
  ) {
    this.modelInfo = MODEL_SPECIFICATIONS[modelName];
    this.threshold = RECOMMENDED_THRESHOLDS[modelName];
  }

  public async init(): Promise<void> {
    this.setupOfflineEnvironment();
    await this.initializeClassificationPipeline();
  }

  private setupOfflineEnvironment(): void {
    // Use local models for offline functionality
    env.allowRemoteModels = false;
    env.localModelPath = './models/';
  }

  private async initializeClassificationPipeline(): Promise<void> {
    const localModelPath = this.getLocalModelPath();
    Logger.info(`Initializing TopicClassificationService with model: ${this.modelName}`);
    this.classifierPromise = pipeline('zero-shot-classification', localModelPath);
  }

  public setTopicConfig(topic: string, threshold?: number): void {
    this.clearAllTopics();
    this.addTopicToCollection(topic);
    this.updateThreshold(threshold);
    this.logConfigurationChange();
  }

  public getTopicConfig(): TopicClassificationConfig | undefined {
    const primaryTopic = this.getPrimaryTopic();
    if (!primaryTopic) return undefined;
    
    return {
      topic: primaryTopic,
      threshold: this.threshold
    };
  }

  private clearAllTopics(): void {
    this.topics.clear();
    this.markForReinitialization();
  }

  private addTopicToCollection(topic: string): void {
    const validatedTopic = this.validateAndCleanTopic(topic);
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

  private hasNoTopics(): boolean {
    return this.topics.size === 0;
  }

  private createIdleResult(): ClassificationResult {
    return { classification: 'idle', confidence: 0 };
  }

  private async scoreAgainstAllTopics(text: string): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    
    for (const topic of this.topics) {
      const score = await this.scoreTextForTopic(text, topic);
      scores.set(topic, score);
    }
    
    return scores;
  }

  private async scoreTextForTopic(text: string, topic: string): Promise<number> {
    const topicLabel = this.generateLabel(topic);
    return await this.performZeroShotClassification(text, topicLabel);
  }

  private findBestMatchingTopic(topicScores: Map<string, number>): { topic: string; confidence: number } {
    let bestTopic = '';
    let highestConfidence = 0;
    
    for (const [topic, confidence] of topicScores) {
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestTopic = topic;
      }
    }
    
    return { topic: bestTopic, confidence: highestConfidence };
  }

  private createClassificationResult(
    bestMatch: { topic: string; confidence: number }
  ): ClassificationResult {
    const classification = this.determineClassificationFromConfidence(bestMatch.confidence);
    return {
      classification,
      confidence: bestMatch.confidence
    };
  }

  private validateAndCleanText(text: unknown): string {
    return TextSchema.parse(text);
  }

  private async performZeroShotClassification(text: string, topicLabel: string): Promise<number> {
    const classifier = await this.classifierPromise!;
    
    const result = await classifier(text, [topicLabel], {
      multi_label: false
    });
    
    return result.scores[0];
  }

  private determineClassificationFromConfidence(confidence: number): string {
    return this.isConfidenceAboveThreshold(confidence) ? 'studying' : 'idle';
  }

  private isConfidenceAboveThreshold(confidence: number): boolean {
    return confidence >= this.threshold;
  }

  private logClassificationResult(result: ClassificationResult, text: string): void {
    Logger.debug(`Classification result:`, {
      topics: Array.from(this.topics),
      confidence: result.confidence,
      threshold: this.threshold,
      classification: result.classification,
      textPreview: this.createTextPreview(text)
    });
  }

  private createTextPreview(text: string, maxLength: number = 50): string {
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
    return Array.from(this.topics).map(topic => this.generateLabel(topic));
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

  private async reinitializeClassifier(): Promise<void> {
    Logger.info('Reinitializing classifier due to label changes');
    await this.init();
  }

  private logLabelAdded(label: string): void {
    Logger.info(`Label added: ${label}. Total labels: ${this.topics.size}`);
  }

  private logLabelRemoved(label: string): void {
    Logger.info(`Label removed: ${label}. Total labels: ${this.topics.size}`);
  }

  private generateLabel(topic: string): string {
    return `This text is about ${topic}`;
  }

  private ensureServiceIsReady(): void {
    this.ensureInitialized();
    this.ensureConfigured();
  }

  private ensureInitialized(): void {
    if (!this.classifierPromise) {
      throw new ClassificationError(
        "TopicClassificationService must be initialized before use. Call init() first."
      );
    }
  }

  private ensureConfigured(): void {
    if (this.hasNoTopics()) {
      throw new ClassificationError(
        "At least one topic must be configured before classification. Call addLabel() or setTopicConfig() first."
      );
    }
  }

  private getLocalModelPath(): string {
    const modelPathMap: Record<SupportedModel, string> = {
      'distilbert-base-uncased-mnli': 'distilbert-mnli',
      'roberta-large-mnli': 'roberta-large-mnli',
      'microsoft/deberta-v3-large': 'deberta-v3-large',
      'facebook/bart-large-mnli': 'bart-large-mnli'
    };
    
    return modelPathMap[this.modelName];
  }
}