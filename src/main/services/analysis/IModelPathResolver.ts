export enum ModelVariant {
  QUANTIZED = 'quantized',
  FULL = 'full'
}

export interface IModelPathResolver {
  resolvePath(modelName: string): string;
  getVariant(): ModelVariant;
}

export class QuantizedModelPathResolver implements IModelPathResolver {
  public resolvePath(modelName: string): string {
    const pathMap: Record<string, string> = {
      'distilbert-base-uncased-mnli': 'distilbert-mnli',
      'roberta-large-mnli': 'roberta-large-mnli',
      'facebook/bart-large-mnli': 'bart-large-mnli',
      'microsoft/deberta-v3-large': 'deberta-v3-large'
    };
    
    return pathMap[modelName] || modelName;
  }

  public getVariant(): ModelVariant {
    return ModelVariant.QUANTIZED;
  }
}

export class FullModelPathResolver implements IModelPathResolver {
  public resolvePath(modelName: string): string {
    const pathMap: Record<string, string> = {
      'distilbert-base-uncased-mnli': 'distilbert-mnli',
      'roberta-large-mnli': 'roberta-large-mnli',
      'facebook/bart-large-mnli': 'bart-large-mnli-xenova',  // Use ONNX version
      'microsoft/deberta-v3-large': 'deberta-v3-large'
    };
    
    return pathMap[modelName] || modelName;
  }

  public getVariant(): ModelVariant {
    return ModelVariant.FULL;
  }
}