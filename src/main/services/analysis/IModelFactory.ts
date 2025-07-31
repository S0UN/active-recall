import { IClassificationService } from './IClassificationService';
import { SupportedModel, ModelInfo } from './IClassificationModelConfig';

export interface IModelFactory {
  createClassifier(modelName: SupportedModel): Promise<IClassificationService>;
  getSupportedModels(): SupportedModel[];
  getModelInfo(modelName: SupportedModel): ModelInfo;
  isModelAvailable(modelName: SupportedModel): Promise<boolean>;
}