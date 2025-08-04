export type SupportedModel = 
  | 'distilbert-base-uncased-mnli'
  | 'roberta-large-mnli' 
  | 'microsoft/deberta-v3-large'
  | 'facebook/bart-large-mnli';

export type ModelInfo = {
  memoryRequirement: string;
  initializationTime: string;
  accuracy: 'low' | 'medium' | 'high' | 'highest';
  localModelPath: string;
  modelSize: string;
};

export type ClassificationModelConfig = {
  activeModel: SupportedModel;
  fallbackModel: SupportedModel;
  useLocalModels: boolean;
  modelStoragePath: string;
  threshold: number;
  useFullModels?: boolean; // true for full models, false for quantized
};

export const MODEL_SPECIFICATIONS: Record<SupportedModel, ModelInfo> = {
  'distilbert-base-uncased-mnli': {
    memoryRequirement: '512MB',
    initializationTime: '2-5s',
    accuracy: 'medium',
    localModelPath: './models/distilbert-mnli',
    modelSize: '265MB'
  },
  'roberta-large-mnli': {
    memoryRequirement: '1.5GB',
    initializationTime: '8-12s', 
    accuracy: 'high',
    localModelPath: './models/roberta-large-mnli',
    modelSize: '1.42GB'
  },
  'microsoft/deberta-v3-large': {
    memoryRequirement: '1.8GB',
    initializationTime: '12-18s',
    accuracy: 'highest',
    localModelPath: './models/deberta-v3-large',
    modelSize: '1.74GB'
  },
  'facebook/bart-large-mnli': {
    memoryRequirement: '2GB',
    initializationTime: '10-15s',
    accuracy: 'highest',
    localModelPath: './models/bart-large-mnli',
    modelSize: '1.63GB'
  }
};

export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationModelConfig = {
  activeModel: 'microsoft/deberta-v3-large',
  fallbackModel: 'distilbert-base-uncased-mnli',
  useLocalModels: true,
  modelStoragePath: './models',
  threshold: 0.5,
  useFullModels: false // Default to quantized models for better performance
};