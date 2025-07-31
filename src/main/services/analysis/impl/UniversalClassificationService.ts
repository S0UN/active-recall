import { injectable, inject } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';
import { SupportedModel, ModelInfo, MODEL_SPECIFICATIONS } from '../IClassificationModelConfig';

const ClassificationTextSchema = z.string()
  .min(1, "Text is required for classification")
  .refine(str => str.trim().length > 0, {
    message: "Text is required for classification"
  })
  .transform(str => str.trim());

export type ModelInfoWithName = ModelInfo & { modelName: SupportedModel };

@injectable()
export class UniversalClassificationService implements IClassificationService {
  private static readonly DEFAULT_LABELS = [
    "studying technical or educational content",
    "reading documentation or programming textbooks", 
    "learning computer science or software development",
    "engaging with academic or professional material"
  ];

  private classifierPromise?: Promise<any>;
  private labels: string[] = [...UniversalClassificationService.DEFAULT_LABELS];
  private readonly modelInfo: ModelInfo;

  constructor(
    private readonly modelName: SupportedModel
  ) {
    this.modelInfo = MODEL_SPECIFICATIONS[modelName];
  }

  public async init(): Promise<void> {
    this.configureOfflineMode();
    const resolvedModelName = this.resolveModelName(this.modelName);
    this.classifierPromise = pipeline('zero-shot-classification', resolvedModelName);
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    const validatedText = this.validateInput(text);
    this.validateInitialization();

    const classifier = await this.classifierPromise!;
    
    const result = await this.performZeroShotClassification(classifier, validatedText);
    const confidence = this.findMaxScore(result.scores);
    
    this.logClassificationResults(confidence, result);
    
    const classification = this.determineClassification(confidence);
    return { classification, confidence };
  }

  public getModelInfo(): ModelInfoWithName {
    return {
      ...this.modelInfo,
      modelName: this.modelName
    };
  }

  public addLabel(label: unknown): void {
    const validatedLabel = this.validateLabel(label);
    if (!this.labels.includes(validatedLabel)) {
      this.labels.push(validatedLabel);
    }
  }

  public removeLabel(label: unknown): void {
    const validatedLabel = this.validateLabel(label);
    this.labels = this.labels.filter(l => l !== validatedLabel);
  }

  public getLabels(): string[] {
    return [...this.labels];
  }

  private validateInput(text: unknown): string {
    try {
      return ClassificationTextSchema.parse(text);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.issues[0];
        throw new ClassificationError(firstError?.message || "Invalid input for classification");
      }
      throw new ClassificationError("Invalid input for classification");
    }
  }

  private validateLabel(label: unknown): string {
    if (typeof label !== 'string' || !label.trim()) {
      throw new ClassificationError("Label must be a non-empty string");
    }
    return label.trim();
  }

  private validateInitialization(): void {
    if (!this.classifierPromise) {
      throw new ClassificationError("UniversalClassificationService must be initialized first!");
    }
  }


  private configureOfflineMode(): void {
    env.allowRemoteModels = false;
    env.localModelPath = './models/';
  }

  private resolveModelName(modelName: SupportedModel): string {
    const modelNameMap: Record<SupportedModel, string> = {
      'distilbert-base-uncased-mnli': 'distilbert-mnli',
      'roberta-large-mnli': 'roberta-large-mnli',
      'microsoft/deberta-v3-large': 'deberta-v3-large',
      'facebook/bart-large-mnli': 'bart-large-mnli'
    };
    
    return modelNameMap[modelName];
  }

  private async performZeroShotClassification(classifier: any, text: string): Promise<any> {
    const hypothesisTemplate = "This text is about {}";
    const result = await classifier(text, this.labels, {
      hypothesis_template: hypothesisTemplate
    });
    return result;
  }

  private findMaxScore(scores: number[]): number {
    return Math.max(...scores);
  }

  private logClassificationResults(confidence: number, result: any): void {
    Logger.info(`Classification confidence: ${confidence}`);
    
    if (result.labels && result.scores) {
      const topLabelIndex = result.scores.indexOf(confidence);
      const topLabel = result.labels[topLabelIndex];
      Logger.info(`Highest scoring label: "${topLabel}" with confidence: ${confidence}`);
    }
  }

  private determineClassification(confidence: number): string {
    return confidence > 0.5 ? 'studying' : 'idle';
  }
}