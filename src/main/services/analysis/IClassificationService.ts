export interface ClassificationResult {
  classification: string;
  confidence: number;
}

export interface IClassificationService {
  classify(text: string): Promise<string>;
  classifyWithConfidence?(text: unknown): Promise<ClassificationResult>;
  addLabel?(label: unknown): void;
  removeLabel?(label: unknown): void;
  getLabels?(): string[];
}
