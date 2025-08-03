export type ClassificationConfig = {
  topic: string;
  threshold?: number;
  [key: string]: any; 
}

export type StrategyMetadata = {
  name: string;
  type: 'zero-shot' | 'embedding' | 'hybrid' | 'keyword' | 'ensemble';
  version: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  recommendedFor: string[];
  performance: {
    accuracy: number;     
    speed: 'fast' | 'medium' | 'slow';
    memoryUsage: 'low' | 'medium' | 'high';
    cpuUsage: 'low' | 'medium' | 'high';
  };
  requirements: {
    models: string[];     
    minRam?: string;   
    supportedLanguages: string[];
  };
}

export interface ClassificationStrategy {
  // Core functionality
  init(): Promise<void>;
  classify(text: string): Promise<string>;
  classifyWithConfidence(text: unknown): Promise<import('./IClassificationService').ClassificationResult>;
  
  // Configuration
  setConfig(config: ClassificationConfig): void;
  getConfig(): ClassificationConfig | undefined;
  
  // Metadata and introspection
  getMetadata(): StrategyMetadata;
  isAvailable(): Promise<boolean>;
  
  // Compatibility with existing interface
  getLabels(): string[];
  addLabel?(label: unknown): void;
  removeLabel?(label: unknown): void;
}