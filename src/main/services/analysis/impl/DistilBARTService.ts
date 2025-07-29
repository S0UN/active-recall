import { injectable, inject } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';

const ClassificationTextSchema = z.string()
  .min(1, "Text is required for classification")
  .refine(str => str.trim().length > 0, {
    message: "Text is required for classification"
  })
  .transform(str => str.trim());

const LabelSchema = z.string()
  .min(1, "Label cannot be empty")
  .refine(str => str.trim().length > 0, {
    message: "Label cannot be empty"
  })
  .transform(str => str.trim());

@injectable()
export class DistilBARTService implements IClassificationService {
  private static readonly STUDYING_THRESHOLD = 0.45;
  private static readonly DEFAULT_LABELS = [
    "studying technical or educational content",
    "reading documentation or programming textbooks", 
    "learning computer science or software development",
    "engaging with academic or professional material"
  ];

  private classifierPromise?: Promise<any>;
  private labels: string[] = [...DistilBARTService.DEFAULT_LABELS];

  constructor(@inject('TextPreprocessor') private readonly textPreprocessor: ITextPreprocessor) {}

  public async init(): Promise<void> {
    this.configureOfflineMode();
    this.classifierPromise = pipeline('zero-shot-classification', 'distilbert-mnli');
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    const validatedText = this.validateInput(text);
    this.validateInitialization();

    const cleanedText = await this.prepareTextForClassification(validatedText);
    const classifier = await this.classifierPromise!;
    
    const result = await this.performZeroShotClassification(classifier, cleanedText);
    const confidence = this.findMaxScore(result.scores);
    
    this.logClassificationResults(confidence, result);
    
    const classification = this.determineClassification(confidence);
    return { classification, confidence };
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

  private validateInitialization(): void {
    if (!this.classifierPromise) {
      throw new ClassificationError("DistilBARTService must be initialized first!");
    }
  }

  private async prepareTextForClassification(text: string): Promise<string> {
    const preprocessed = await this.textPreprocessor.preprocess(text);
    if (!preprocessed.trim()) {
      throw new ClassificationError("Preprocessed text is empty");
    }
    return preprocessed;
  }

  private configureOfflineMode(): void {
    env.allowRemoteModels = false;
    env.localModelPath = './models/';
  }

  private async performZeroShotClassification(classifier: any, text: string): Promise<any> {
    const hypothesisTemplate = "This text is about {}";
    const result = await classifier(text, this.labels, {
      hypothesis_template: hypothesisTemplate
    });

    if (!result?.scores) {
      throw new ClassificationError('Invalid response from classification pipeline');
    }

    return result;
  }

  private logClassificationResults(confidence: number, result: any): void {
    Logger.info(`Classification confidence: ${confidence}`);
    
    const maxIndex = result.scores.indexOf(confidence);
    Logger.info(`Highest scoring label: "${this.labels[maxIndex]}" with confidence: ${confidence}`);
  }

  private findMaxScore(scores: number[]): number {
    return Math.max(...scores);
  }

  private determineClassification(confidence: number): string {
    if (confidence >= DistilBARTService.STUDYING_THRESHOLD) {
      return "Studying";
    } else {
      return "Idle";
    }
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

  public clearLabels(): void {
    this.labels = [...DistilBARTService.DEFAULT_LABELS];
  }

  public getLabels(): string[] {
    return [...this.labels];
  }

  private validateLabel(label: unknown): string {
    try {
      return LabelSchema.parse(label);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.issues[0];
        throw new ClassificationError(firstError?.message || "Invalid label");
      }
      throw new ClassificationError("Invalid label");
    }
  }
}