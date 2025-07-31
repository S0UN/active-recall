import { injectable } from 'tsyringe';
import { IModelFactory } from '../IModelFactory';
import { IClassificationService } from '../IClassificationService';
import { SupportedModel, ModelInfo, MODEL_SPECIFICATIONS } from '../IClassificationModelConfig';
import { UniversalClassificationService } from './UniversalClassificationService';
import * as fs from 'fs';
import * as path from 'path';

@injectable()
export class ModelFactory implements IModelFactory {
  public async createClassifier(modelName: SupportedModel): Promise<IClassificationService> {
    this.validateModelSupport(modelName);
    
    const service = new UniversalClassificationService(modelName);
    await service.init();
    
    return service;
  }

  public getSupportedModels(): SupportedModel[] {
    return Object.keys(MODEL_SPECIFICATIONS) as SupportedModel[];
  }

  public getModelInfo(modelName: SupportedModel): ModelInfo {
    this.validateModelSupport(modelName);
    return MODEL_SPECIFICATIONS[modelName];
  }

  public async isModelAvailable(modelName: SupportedModel): Promise<boolean> {
    this.validateModelSupport(modelName);
    
    const modelInfo = MODEL_SPECIFICATIONS[modelName];
    const modelPath = modelInfo.localModelPath;
    
    return this.checkModelFilesExist(modelPath);
  }

  private validateModelSupport(modelName: SupportedModel): void {
    if (!MODEL_SPECIFICATIONS[modelName]) {
      throw new Error(`Unsupported model: ${modelName}`);
    }
  }

  private checkModelFilesExist(modelPath: string): boolean {
    try {
      const requiredFiles = ['config.json', 'tokenizer.json'];
      
      for (const file of requiredFiles) {
        const filePath = path.join(modelPath, file);
        if (!fs.existsSync(filePath)) {
          return false;
        }
      }
      
      const onnxDir = path.join(modelPath, 'onnx');
      if (!fs.existsSync(onnxDir)) {
        return false;
      }
      
      const onnxFiles = fs.readdirSync(onnxDir);
      const hasModelFile = onnxFiles.some(file => file.startsWith('model') && file.endsWith('.onnx'));
      
      return hasModelFile;
    } catch (error) {
      return false;
    }
  }
}