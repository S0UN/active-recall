import { injectable } from 'tsyringe';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { pipeline, env } from '@xenova/transformers';
import { ClassificationError } from '../../../errors/CustomErrors';
import { z } from 'zod';
import Logger from 'electron-log';

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
  private static readonly STUDYING_THRESHOLD = 0.45;
  private static readonly IDLE_THRESHOLD = 0.15;
  private static readonly DEFAULT_LABELS = [
    "studying technical or educational content",
    "reading documentation or programming textbooks", 
    "learning computer science or software development",
    "engaging with academic or professional material"
  ];

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

    // Preprocess text to improve classification
    const cleanedText = this.preprocessText(validatedText);
    
    const classifier = await this.classifierPromise!;
    
    // Use hypothesis template for better zero-shot performance with NLI
    const hypothesisTemplate = "This text is about {}";
    const result = await classifier(cleanedText, this.labels, {
      hypothesis_template: hypothesisTemplate
    });

    if (!result?.scores) {
      throw new ClassificationError('Invalid response from classification pipeline');
    }

    const confidence = this.findMaxScore(result.scores);
    Logger.info(`Classification confidence: ${confidence}`);
    
    // Log the label with highest confidence for debugging
    const maxIndex = result.scores.indexOf(confidence);
    Logger.info(`Highest scoring label: "${this.labels[maxIndex]}" with confidence: ${confidence}`);
    
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

  private preprocessText(text: string): string {
    // Remove excessive symbols and UI artifacts
    let cleaned = text
      // Remove lines with mostly symbols or UI elements
      .split('\n')
      .filter(line => {
        const symbolCount = (line.match(/[^\w\s]/g) || []).length;
        const wordCount = (line.match(/\b\w+\b/g) || []).length;
        // Keep lines that have more words than symbols
        return wordCount > 0 && (symbolCount / line.length) < 0.5;
      })
      .join(' ');
    
    // Remove multiple spaces and normalize
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/[»«]/g, '')
      .trim();
    
    // Limit text length to improve performance
    const maxLength = 500;
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '...';
    }
    
    return cleaned;
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


