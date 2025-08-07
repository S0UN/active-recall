import { injectable } from 'tsyringe';
import { ClassificationStrategy, StrategyMetadata, ClassificationConfig } from '../IClassificationStrategy';
import { IClassificationService } from '../IClassificationService';
import { TopicClassificationService } from './TopicClassificationService';
import { SupportedModel, MODEL_SPECIFICATIONS, DEFAULT_CLASSIFICATION_CONFIG } from '../IClassificationModelConfig';
import { IModelPathResolver, QuantizedModelPathResolver, FullModelPathResolver } from '../IModelPathResolver';
import { StrategyEvaluator } from './StrategyEvaluator';
import { StrategyNotFoundError, ModelNotAvailableError } from '../../../errors/CustomErrors';
import Logger from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';

export type StrategyType = 'zero-shot' | 'auto';


type StrategyFactory = {
  create(model: string): Promise<ClassificationStrategy>;
  getAvailableModels(): Promise<string[]>;
  getMetadata(model: string): StrategyMetadata;
}

@injectable()
export class UniversalModelFactory {
  private readonly strategies: Map<StrategyType, StrategyFactory> = new Map();
  private readonly evaluator: StrategyEvaluator;
  private readonly modelPathResolver: IModelPathResolver;

  constructor() {
    this.evaluator = new StrategyEvaluator();
    this.modelPathResolver = this.createModelPathResolver();
    this.initializeFactory();
  }

  private createModelPathResolver(): IModelPathResolver {
    const envValue = process.env.USE_FULL_MODELS;
    const useFullModels = envValue === 'true' || DEFAULT_CLASSIFICATION_CONFIG.useFullModels;
    
    Logger.info('Model path resolver configuration:', {
      USE_FULL_MODELS_env: envValue,
      defaultConfig: DEFAULT_CLASSIFICATION_CONFIG.useFullModels,
      usingFullModels: useFullModels,
      resolverType: useFullModels ? 'FullModelPathResolver' : 'QuantizedModelPathResolver'
    });
    
    return useFullModels ? new FullModelPathResolver() : new QuantizedModelPathResolver();
  }

  private initializeFactory(): void {
    this.registerAllStrategies();
    this.configureEvaluator();
  }

  private registerAllStrategies(): void {
    this.registerZeroShotStrategy();
  }

  private configureEvaluator(): void {
    this.evaluator.setStrategyFactories(this.strategies);
  }

  public async createStrategy(
    strategyType: StrategyType, 
    model: string, 
    config?: ClassificationConfig
  ): Promise<ClassificationStrategy> {
    const resolvedStrategy = await this.resolveStrategyType(strategyType, model);
    this.validateStrategyRequest(resolvedStrategy.type, resolvedStrategy.model);
    
    const strategy = await this.instantiateStrategy(resolvedStrategy.type, resolvedStrategy.model);
    this.configureStrategy(strategy, config);
    await this.ensureStrategyIsReady(strategy);
    
    this.logStrategyCreation(resolvedStrategy.type, resolvedStrategy.model);
    return strategy;
  }

  private async resolveStrategyType(
    strategyType: StrategyType, 
    model: string
  ): Promise<{ type: StrategyType; model: string }> {
    if (this.isAutoStrategy(strategyType)) {
      // Default to zero-shot with BART when auto is selected
      return { type: 'zero-shot', model: 'facebook/bart-large-mnli' };
    }
    return { type: strategyType, model };
  }

  private isAutoStrategy(strategyType: StrategyType): boolean {
    return strategyType === 'auto';
  }

  private validateStrategyRequest(strategyType: StrategyType, model: string): void {
    this.ensureStrategyTypeExists(strategyType);
    this.ensureModelIsValid(model);
  }

  private ensureStrategyTypeExists(strategyType: StrategyType): void {
    if (!this.strategies.has(strategyType)) {
      throw new StrategyNotFoundError(`Unsupported strategy type: ${strategyType}`);
    }
  }

  private ensureModelIsValid(model: string): void {
    if (!model || model.trim() === '') {
      throw new ModelNotAvailableError('Model name cannot be empty');
    }
  }

  private async instantiateStrategy(strategyType: StrategyType, model: string): Promise<ClassificationStrategy> {
    const factory = this.getStrategyFactory(strategyType);
    try {
      return await factory.create(model);
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      throw new ModelNotAvailableError(
        `Failed to create ${model} for ${strategyType}: ${errorMsg}`
      );
    }
  }

  private getStrategyFactory(strategyType: StrategyType): StrategyFactory {
    return this.strategies.get(strategyType)!;
  }

  private configureStrategy(strategy: ClassificationStrategy, config?: ClassificationConfig): void {
    if (config) {
      strategy.setConfig(config);
    }
  }

  private async ensureStrategyIsReady(strategy: ClassificationStrategy): Promise<void> {
    const isAvailable = await strategy.isAvailable();
    if (!isAvailable) {
      throw new ModelNotAvailableError('Strategy is not available after initialization');
    }
  }

  private logStrategyCreation(strategyType: StrategyType, model: string): void {
    Logger.info(`Created ${strategyType} strategy with model: ${model}`);
  }


  public async getAvailableStrategies(): Promise<Array<{
    type: StrategyType;
    models: string[];
    metadata: StrategyMetadata;
  }>> {
    const performanceData = await this.evaluator.evaluateAllStrategies();
    return this.groupStrategiesByType(performanceData);
  }

  private groupStrategiesByType(performanceData: any[]): Array<{
    type: StrategyType;
    models: string[];
    metadata: StrategyMetadata;
  }> {
    const grouped = new Map<StrategyType, {
      models: string[];
      metadata: StrategyMetadata;
    }>();

    for (const data of performanceData) {
      if (!grouped.has(data.strategy)) {
        grouped.set(data.strategy, {
          models: [],
          metadata: data.metadata
        });
      }
      grouped.get(data.strategy)!.models.push(data.model);
    }

    return Array.from(grouped.entries()).map(([type, info]) => ({
      type,
      models: info.models,
      metadata: info.metadata
    }));
  }


  // Creates the best available classifier using default zero-shot
  public async createBestAvailableClassifier(): Promise<IClassificationService> {
    const strategy = await this.createStrategy('zero-shot', 'facebook/bart-large-mnli');
    return this.wrapStrategy(strategy);
  }

  // Legacy compatibility - creates the best available strategy
  public async createClassifier(
    modelName?: SupportedModel
  ): Promise<IClassificationService> {
    if (modelName && modelName in MODEL_SPECIFICATIONS) {
      // Legacy zero-shot model requested
      const strategy = await this.createStrategy('zero-shot', modelName);
      return this.wrapStrategy(strategy);
    }


    // Default to zero-shot with BART
    const strategy = await this.createStrategy('zero-shot', 'facebook/bart-large-mnli');
    return this.wrapStrategy(strategy);
  }

  private registerZeroShotStrategy(): void {
    this.strategies.set('zero-shot', {
      create: async (model: string) => {
        return await this.createZeroShotService(model);
      },
      getAvailableModels: async () => {
        return await this.discoverAvailableZeroShotModels();
      },
      getMetadata: (model: string) => this.createZeroShotMetadata(model)
    });
  }

  private async createZeroShotService(model: string): Promise<ClassificationStrategy> {
    const service = new TopicClassificationService(model as SupportedModel);
    await service.init();
    return this.wrapAsStrategy(service, 'zero-shot');
  }

  private async discoverAvailableZeroShotModels(): Promise<string[]> {
    const models = Object.keys(MODEL_SPECIFICATIONS) as SupportedModel[];
    const availableModels = [];
    
    for (const model of models) {
      const modelPath = this.modelPathResolver.resolvePath(model);
      if (await this.checkModelAvailability(modelPath)) {
        availableModels.push(model);
      }
    }
    
    return availableModels;
  }

  private createZeroShotMetadata(model: string): StrategyMetadata {
    return {
      name: `Zero-Shot Classification (${model})`,
      type: 'zero-shot',
      version: '1.0.0',
      description: 'Uses pre-trained NLI models for zero-shot topic classification',
      strengths: ['No training required', 'Works with any topic', 'High accuracy'],
      weaknesses: ['Slower inference', 'Large memory usage'],
      recommendedFor: ['Complex topics', 'High accuracy requirements'],
      performance: {
        accuracy: 0.85,
        speed: 'medium',
        memoryUsage: 'high',
        cpuUsage: 'high'
      },
      requirements: {
        models: [model],
        minRam: '2GB',
        supportedLanguages: ['en']
      }
    };
  }




  private async checkModelAvailability(modelPath: string): Promise<boolean> {
    try {
      const requiredFiles = ['config.json', 'tokenizer.json'];
      
      for (const file of requiredFiles) {
        const filePath = path.join(modelPath, file);
        if (!fs.existsSync(filePath)) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  private wrapAsStrategy(service: any, type: StrategyType): ClassificationStrategy {
    const factory = this.strategies.get(type)!;
    
    return {
      init: () => Promise.resolve(), // Already initialized
      classify: (text: string) => service.classify(text),
      classifyWithConfidence: (text: unknown) => service.classifyWithConfidence(text),
      setConfig: (config: ClassificationConfig) => {
        if ('setTopicConfig' in service) {
          service.setTopicConfig(config.topic, config.threshold);
        }
      },
      getConfig: () => {
        if ('getTopicConfig' in service) {
          return service.getTopicConfig();
        }
        return undefined;
      },
      getMetadata: () => factory.getMetadata('default'),
      isAvailable: () => Promise.resolve(true),
      getLabels: () => service.getLabels(),
      addLabel: service.addLabel ? (label: unknown) => service.addLabel(label) : undefined,
      removeLabel: service.removeLabel ? (label: unknown) => service.removeLabel(label) : undefined
    };
  }

  private wrapStrategy(strategy: ClassificationStrategy): IClassificationService {
    return {
      classify: (text: string) => strategy.classify(text),
      classifyWithConfidence: (text: unknown) => strategy.classifyWithConfidence(text),
      getLabels: () => strategy.getLabels(),
      addLabel: strategy.addLabel || (() => { 
        throw new Error('Not supported by this strategy'); 
      }),
      removeLabel: strategy.removeLabel || (() => { 
        throw new Error('Not supported by this strategy'); 
      })
    };
  }
}