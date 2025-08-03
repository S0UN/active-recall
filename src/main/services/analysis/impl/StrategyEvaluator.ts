import { injectable } from 'tsyringe';
import { ClassificationStrategy, StrategyMetadata } from '../IClassificationStrategy';
import { ModelRequirements, StrategyRecommendation, StrategyType } from './UniversalModelFactory';
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

export type TestCase = {
  text: string;
  expectedMatch: boolean;
}

export type BenchmarkResult = {
  strategy: StrategyType;
  model: string;
  accuracy: number;
  avgLatency: number;
  correctPredictions: number;
  totalCases: number;
}

export type BenchmarkResults = Map<string, BenchmarkResult>;

type StrategyCandidate = {
  strategy: StrategyType;
  model: string;
  expectedAccuracy: number;
  expectedLatency: number;
  memoryUsage: number;
}

@injectable()
export class StrategyEvaluator {
  private readonly performanceCache: Map<string, number> = new Map();
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

  public async recommendStrategy(requirements: ModelRequirements): Promise<StrategyRecommendation> {
    const candidates = await this.findCandidateStrategies();
    const filteredCandidates = this.filterByRequirements(candidates, requirements);
    const rankedCandidates = this.rankByPreferences(filteredCandidates, requirements);
    return this.createRecommendation(rankedCandidates);
  }

  private async findCandidateStrategies(): Promise<StrategyCandidate[]> {
    const allStrategies = await this.evaluateAllStrategies();
    return this.convertToCandiates(allStrategies.filter(s => s.isAvailable));
  }

  private convertToCandiates(strategies: StrategyPerformanceData[]): StrategyCandidate[] {
    return strategies.map(s => ({
      strategy: s.strategy,
      model: s.model,
      expectedAccuracy: s.expectedAccuracy,
      expectedLatency: s.expectedLatency,
      memoryUsage: s.memoryUsage
    }));
  }

  private filterByRequirements(
    candidates: StrategyCandidate[], 
    requirements: ModelRequirements
  ): StrategyCandidate[] {
    return candidates.filter(candidate => 
      this.meetsLatencyRequirement(candidate, requirements) &&
      this.meetsAccuracyRequirement(candidate, requirements) &&
      this.meetsMemoryRequirement(candidate, requirements)
    );
  }

  private meetsLatencyRequirement(candidate: StrategyCandidate, requirements: ModelRequirements): boolean {
    return !requirements.maxLatency || candidate.expectedLatency <= requirements.maxLatency;
  }

  private meetsAccuracyRequirement(candidate: StrategyCandidate, requirements: ModelRequirements): boolean {
    return !requirements.minAccuracy || candidate.expectedAccuracy >= requirements.minAccuracy;
  }

  private meetsMemoryRequirement(candidate: StrategyCandidate, requirements: ModelRequirements): boolean {
    return !requirements.maxMemoryUsage || candidate.memoryUsage <= requirements.maxMemoryUsage;
  }

  private rankByPreferences(
    candidates: StrategyCandidate[], 
    requirements: ModelRequirements
  ): StrategyCandidate[] {
    if (requirements.preferSpeed) {
      return this.sortBySpeed(candidates);
    }
    return this.sortByAccuracy(candidates);
  }

  private sortBySpeed(candidates: StrategyCandidate[]): StrategyCandidate[] {
    return [...candidates].sort((a, b) => a.expectedLatency - b.expectedLatency);
  }

  private sortByAccuracy(candidates: StrategyCandidate[]): StrategyCandidate[] {
    return [...candidates].sort((a, b) => b.expectedAccuracy - a.expectedAccuracy);
  }

  private createRecommendation(rankedCandidates: StrategyCandidate[]): StrategyRecommendation {
    if (this.hasNoCandidates(rankedCandidates)) {
      Logger.warn('No strategies meet requirements, using fallback strategy');
      return this.createFallbackRecommendation();
    }

    const bestCandidate = this.selectBestCandidate(rankedCandidates);
    const alternatives = this.selectAlternatives(rankedCandidates);
    
    return this.buildRecommendation(bestCandidate, alternatives);
  }

  private hasNoCandidates(candidates: StrategyCandidate[]): boolean {
    return candidates.length === 0;
  }

  private createFallbackRecommendation(): StrategyRecommendation {
    return {
      strategy: 'zero-shot',
      model: 'roberta-large-mnli',
      expectedAccuracy: 0.85,
      expectedLatency: 3000,
      memoryUsage: 1500,
      rationale: 'Fallback strategy selected due to no available models meeting requirements',
      alternatives: []
    };
  }

  private selectBestCandidate(candidates: StrategyCandidate[]): StrategyCandidate {
    return candidates[0];
  }

  private selectAlternatives(candidates: StrategyCandidate[]): StrategyCandidate[] {
    return candidates.slice(1, 4);
  }

  private buildRecommendation(
    best: StrategyCandidate, 
    alternatives: StrategyCandidate[]
  ): StrategyRecommendation {
    return {
      strategy: best.strategy,
      model: best.model,
      expectedAccuracy: best.expectedAccuracy,
      expectedLatency: best.expectedLatency,
      memoryUsage: best.memoryUsage,
      rationale: this.generateRationale(best),
      alternatives: this.formatAlternatives(alternatives)
    };
  }

  private generateRationale(candidate: StrategyCandidate): string {
    const accuracy = this.formatAccuracy(candidate.expectedAccuracy);
    const latency = this.formatLatency(candidate.expectedLatency);
    const memory = this.formatMemory(candidate.memoryUsage);
    
    return `${candidate.strategy} with ${candidate.model}: ${accuracy} accuracy, ${latency} latency, ${memory} memory`;
  }

  private formatAccuracy(accuracy: number): string {
    return `${(accuracy * 100).toFixed(1)}%`;
  }

  private formatLatency(latency: number): string {
    return `${latency}ms`;
  }

  private formatMemory(memory: number): string {
    return `${memory}MB`;
  }

  private formatAlternatives(alternatives: StrategyCandidate[]): Array<{
    strategy: StrategyType;
    model: string;
    reason: string;
  }> {
    return alternatives.map(alt => ({
      strategy: alt.strategy,
      model: alt.model,
      reason: this.generateAlternativeReason(alt)
    }));
  }

  private generateAlternativeReason(candidate: StrategyCandidate): string {
    const accuracy = this.formatAccuracy(candidate.expectedAccuracy);
    const latency = this.formatLatency(candidate.expectedLatency);
    return `${accuracy} accuracy, ${latency} latency`;
  }

  public async benchmarkStrategies(
    testCases: TestCase[], 
    topic: string,
    createStrategyFn: (type: StrategyType, model: string, config: any) => Promise<ClassificationStrategy>
  ): Promise<BenchmarkResults> {
    const topStrategies = await this.selectTopPerformingStrategies();
    const benchmarkResults = await this.runBenchmarksOnStrategies(
      topStrategies, 
      testCases, 
      topic,
      createStrategyFn
    );
    this.cacheBenchmarkResults(benchmarkResults);
    return benchmarkResults;
  }

  private async selectTopPerformingStrategies(limit: number = 3): Promise<StrategyPerformanceData[]> {
    const allStrategies = await this.evaluateAllStrategies();
    const availableStrategies = this.filterAvailableStrategies(allStrategies);
    return this.takeTopStrategies(availableStrategies, limit);
  }

  private filterAvailableStrategies(strategies: StrategyPerformanceData[]): StrategyPerformanceData[] {
    return strategies.filter(s => s.isAvailable);
  }

  private takeTopStrategies(strategies: StrategyPerformanceData[], limit: number): StrategyPerformanceData[] {
    return strategies.slice(0, limit);
  }

  private async runBenchmarksOnStrategies(
    strategies: StrategyPerformanceData[],
    testCases: TestCase[],
    topic: string,
    createStrategyFn: (type: StrategyType, model: string, config: any) => Promise<ClassificationStrategy>
  ): Promise<BenchmarkResults> {
    const results = new Map<string, BenchmarkResult>();
    
    for (const strategyInfo of strategies) {
      const result = await this.benchmarkSingleStrategy(strategyInfo, testCases, topic, createStrategyFn);
      if (result) {
        const key = this.createBenchmarkKey(strategyInfo);
        results.set(key, result);
      }
    }
    
    return results;
  }

  private async benchmarkSingleStrategy(
    strategyInfo: StrategyPerformanceData,
    testCases: TestCase[],
    topic: string,
    createStrategyFn: (type: StrategyType, model: string, config: any) => Promise<ClassificationStrategy>
  ): Promise<BenchmarkResult | null> {
    try {
      const strategy = await this.createStrategyForBenchmark(strategyInfo, topic, createStrategyFn);
      const benchmarkMetrics = await this.measureStrategyPerformance(strategy, testCases);
      return this.createBenchmarkResult(strategyInfo, benchmarkMetrics);
    } catch (error) {
      this.logBenchmarkError(strategyInfo, error);
      return null;
    }
  }

  private async createStrategyForBenchmark(
    strategyInfo: StrategyPerformanceData,
    topic: string,
    createStrategyFn: (type: StrategyType, model: string, config: any) => Promise<ClassificationStrategy>
  ): Promise<ClassificationStrategy> {
    return await createStrategyFn(strategyInfo.strategy, strategyInfo.model, { topic });
  }

  private async measureStrategyPerformance(
    strategy: ClassificationStrategy,
    testCases: TestCase[]
  ): Promise<{ correctPredictions: number; totalTime: number; totalCases: number }> {
    const startTime = Date.now();
    const correctPredictions = await this.countCorrectPredictions(strategy, testCases);
    const totalTime = Date.now() - startTime;
    
    return { correctPredictions, totalTime, totalCases: testCases.length };
  }

  private async countCorrectPredictions(
    strategy: ClassificationStrategy,
    testCases: TestCase[]
  ): Promise<number> {
    let correctCount = 0;
    
    for (const testCase of testCases) {
      const prediction = await this.predictTestCase(strategy, testCase);
      if (this.isPredictionCorrect(prediction, testCase)) {
        correctCount++;
      }
    }
    
    return correctCount;
  }

  private async predictTestCase(strategy: ClassificationStrategy, testCase: TestCase): Promise<string> {
    return await strategy.classify(testCase.text);
  }

  private isPredictionCorrect(prediction: string, testCase: TestCase): boolean {
    const expected = testCase.expectedMatch ? 'studying' : 'idle';
    return prediction === expected;
  }

  private createBenchmarkResult(
    strategyInfo: StrategyPerformanceData,
    metrics: { correctPredictions: number; totalTime: number; totalCases: number }
  ): BenchmarkResult {
    const accuracy = this.calculateAccuracy(metrics.correctPredictions, metrics.totalCases);
    const avgLatency = this.calculateAverageLatency(metrics.totalTime, metrics.totalCases);
    
    return {
      strategy: strategyInfo.strategy,
      model: strategyInfo.model,
      accuracy,
      avgLatency,
      correctPredictions: metrics.correctPredictions,
      totalCases: metrics.totalCases
    };
  }

  private calculateAccuracy(correct: number, total: number): number {
    return correct / total;
  }

  private calculateAverageLatency(totalTime: number, totalCases: number): number {
    return totalTime / totalCases;
  }

  private createBenchmarkKey(strategyInfo: StrategyPerformanceData): string {
    return `${strategyInfo.strategy}-${strategyInfo.model}`;
  }

  private cacheBenchmarkResults(results: BenchmarkResults): void {
    for (const [key, result] of results) {
      this.cacheStrategyPerformance(key, result.accuracy);
    }
  }

  private cacheStrategyPerformance(key: string, accuracy: number): void {
    this.performanceCache.set(key, accuracy);
  }

  private logBenchmarkError(strategyInfo: StrategyPerformanceData, error: unknown): void {
    const key = this.createBenchmarkKey(strategyInfo);
    Logger.warn(`Failed to benchmark ${key}:`, error);
  }
}