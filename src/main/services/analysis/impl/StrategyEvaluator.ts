import { injectable } from 'tsyringe';
import { StrategyMetadata } from '../IClassificationStrategy';
import { StrategyType } from './UniversalModelFactory';
import Logger from 'electron-log';

export type StrategyPerformanceData = {
  strategy: StrategyType;
  model: string;
  metadata: StrategyMetadata;
  expectedAccuracy: number;
  expectedLatency: number;
  memoryUsage: number;
  isAvailable: boolean;
}


@injectable()
export class StrategyEvaluator {
  private strategyFactories: Map<StrategyType, any> = new Map();

  public setStrategyFactories(factories: Map<StrategyType, any>): void {
    this.strategyFactories = factories;
  }

  public async evaluateAllStrategies(): Promise<StrategyPerformanceData[]> {
    const availableStrategies = await this.discoverAvailableStrategies();
    const evaluatedStrategies = await this.assessStrategyPerformance(availableStrategies);
    return this.sortByPerformance(evaluatedStrategies);
  }

  private async discoverAvailableStrategies(): Promise<Array<{ type: StrategyType; models: string[]; factory: any }>> {
    const strategies = [];
    
    for (const [type, factory] of this.strategyFactories) {
      try {
        const availableModels = await this.getAvailableModelsForStrategy(factory);
        if (this.hasAvailableModels(availableModels)) {
          strategies.push({ type, models: availableModels, factory });
        }
      } catch (error) {
        this.logStrategyDiscoveryError(type, error);
      }
    }
    
    return strategies;
  }

  private async getAvailableModelsForStrategy(factory: any): Promise<string[]> {
    return await factory.getAvailableModels();
  }

  private hasAvailableModels(models: string[]): boolean {
    return models.length > 0;
  }

  private logStrategyDiscoveryError(type: StrategyType, error: unknown): void {
    Logger.warn(`Failed to discover models for strategy ${type}:`, error);
  }

  private async assessStrategyPerformance(
    strategies: Array<{ type: StrategyType; models: string[]; factory: any }>
  ): Promise<StrategyPerformanceData[]> {
    const performanceData: StrategyPerformanceData[] = [];
    
    for (const strategyInfo of strategies) {
      const modelPerformanceData = await this.assessModelsForStrategy(strategyInfo);
      performanceData.push(...modelPerformanceData);
    }
    
    return performanceData;
  }

  private async assessModelsForStrategy(
    strategyInfo: { type: StrategyType; models: string[]; factory: any }
  ): Promise<StrategyPerformanceData[]> {
    const performanceData: StrategyPerformanceData[] = [];
    
    for (const model of strategyInfo.models) {
      const performance = await this.assessSingleModel(strategyInfo.type, model, strategyInfo.factory);
      if (performance) {
        performanceData.push(performance);
      }
    }
    
    return performanceData;
  }

  private async assessSingleModel(
    type: StrategyType, 
    model: string, 
    factory: any
  ): Promise<StrategyPerformanceData | null> {
    try {
      const metadata = this.getModelMetadata(factory, model);
      const performanceMetrics = this.extractPerformanceMetrics(metadata);
      const availability = await this.checkModelAvailability(type, model, factory);
      
      return this.createPerformanceData(type, model, metadata, performanceMetrics, availability);
    } catch (error) {
      this.logModelAssessmentError(type, model, error);
      return null;
    }
  }

  private getModelMetadata(factory: any, model: string): StrategyMetadata {
    return factory.getMetadata(model);
  }

  private extractPerformanceMetrics(metadata: StrategyMetadata) {
    return {
      accuracy: metadata.performance.accuracy,
      latency: this.mapSpeedToLatency(metadata.performance.speed),
      memory: this.mapMemoryUsageToMB(metadata.performance.memoryUsage)
    };
  }

  private mapSpeedToLatency(speed: 'fast' | 'medium' | 'slow'): number {
    const speedMap = { fast: 50, medium: 200, slow: 500 };
    return speedMap[speed];
  }

  private mapMemoryUsageToMB(usage: 'low' | 'medium' | 'high'): number {
    const memoryMap = { low: 500, medium: 1500, high: 3000 };
    return memoryMap[usage];
  }

  private async checkModelAvailability(_type: StrategyType, model: string, factory: any): Promise<boolean> {
    try {
      const strategy = await factory.create(model);
      return await strategy.isAvailable();
    } catch {
      return false;
    }
  }

  private createPerformanceData(
    type: StrategyType,
    model: string,
    metadata: StrategyMetadata,
    metrics: { accuracy: number; latency: number; memory: number },
    isAvailable: boolean
  ): StrategyPerformanceData {
    return {
      strategy: type,
      model,
      metadata,
      expectedAccuracy: metrics.accuracy,
      expectedLatency: metrics.latency,
      memoryUsage: metrics.memory,
      isAvailable
    };
  }

  private logModelAssessmentError(type: StrategyType, model: string, error: unknown): void {
    Logger.warn(`Failed to assess model ${type}-${model}:`, error);
  }

  private sortByPerformance(strategies: StrategyPerformanceData[]): StrategyPerformanceData[] {
    return strategies.sort((a, b) => b.expectedAccuracy - a.expectedAccuracy);
  }


}