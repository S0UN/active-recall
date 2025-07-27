import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';

// Zod Schemas - Define first, derive types
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
  private static readonly STUDYING_THRESHOLD = 0.80;
  private static readonly IDLE_THRESHOLD = 0.15;
  private static readonly DEFAULT_LABELS = [ "Computer Science",
    "Programming",
    "Software Development",
    "Technical Learning"];

  private classifierPromise?: Promise<any>;
  private labels: string[] = [...DistilBARTService.DEFAULT_LABELS];

  public async init(): Promise<void> {
    // Configure Transformers.js for offline models
    env.allowRemoteModels = false;
    env.localModelPath = './models/';
    
    this.classifierPromise = pipeline(
      'zero-shot-classification',
      'distilbert-mnli'
    );
  }

  public async classify(text: string): Promise<string> {
    const result = await this.classifyWithConfidence(text);
    return result.classification;
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    const validatedText = this.validateInput(text);
    this.validateInitialization();

    const classifier = await this.classifierPromise!;
    const result = await classifier(validatedText, this.labels);

    if (!result?.scores) {
      throw new ClassificationError('Invalid response from classification pipeline');
    }

    const confidence = this.findMaxScore(result.scores);
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

  private findMaxScore(scores: number[]): number {
    return Math.max(...scores);
  }

  private determineClassification(confidence: number): string {
    if (confidence >= DistilBARTService.STUDYING_THRESHOLD) {
      return "Studying";
    } else if (confidence <= DistilBARTService.IDLE_THRESHOLD) {
      return "Idle";
    } else {
      return "Undetermined";
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
    const index = this.labels.indexOf(validatedLabel);
    if (index > -1) {
      this.labels.splice(index, 1);
    }
  }

  private validateLabel(label: unknown): string {
    try {
      return LabelSchema.parse(label);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.issues[0];
        throw new ClassificationError(firstError?.message || "Invalid label input");
      }
      throw new ClassificationError("Invalid label input");
    }
  }

  public getLabels(): string[] {
    return [...this.labels];
  }
}


