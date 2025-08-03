import { injectable, inject } from 'tsyringe';
import { 
  ISegmentedClassifier, 
  SegmentedClassificationResult, 
  SegmentClassificationResult,
} from '../ISegmentedClassifier';
import { IClassificationService, ClassificationResult } from '../IClassificationService';
import { ITextSegmenter, TextSegment } from '../../preprocessing/ITextSegmenter';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { ClassificationStrategy } from '../IClassificationStrategy';
import { UniversalModelFactory, StrategyType } from './UniversalModelFactory';
import { ClassificationError } from '../../../errors/CustomErrors';
import Logger from 'electron-log';

export type SegmentedClassificationConfig = {
  studyingThreshold?: number;
  strategyType?: StrategyType;
  modelName?: string;
  topic?: string;
  confidenceThreshold?: number;
}

@injectable()
export class SegmentedClassificationService implements ISegmentedClassifier, IClassificationService {
  private static readonly DEFAULT_STUDYING_THRESHOLD = 0.65;
  private static readonly DEFAULT_TOPIC = 'studying';
  
  private lastClassificationResult: SegmentedClassificationResult | null = null;
  private currentClassifier?: ClassificationStrategy;
  private readonly config: Required<SegmentedClassificationConfig>;

  constructor(
    @inject('TextSegmenter') private readonly textSegmenter: ITextSegmenter,
    @inject('TextPreprocessor') private readonly textPreprocessor: ITextPreprocessor,
    @inject('ModelFactory') private readonly modelFactory: UniversalModelFactory
  ) {
    this.config = this.createCompleteConfiguration();
  }

  private createCompleteConfiguration(config?: SegmentedClassificationConfig): Required<SegmentedClassificationConfig> {
    return {
      studyingThreshold: config?.studyingThreshold ?? SegmentedClassificationService.DEFAULT_STUDYING_THRESHOLD,
      strategyType: config?.strategyType ?? 'zero-shot',
      modelName: config?.modelName ?? 'roberta-large-mnli',
      topic: config?.topic ?? SegmentedClassificationService.DEFAULT_TOPIC,
      confidenceThreshold: config?.confidenceThreshold ?? 0.5
    };
  }

  // IClassificationService implementation
  public async classify(text: string): Promise<string> {
    const cleanedText = await this.preprocessText(text);
    const segments = this.splitIntoSegments(cleanedText);
    const classifier = await this.getOrCreateClassifier();
    const results = await this.classifyEachSegment(segments, classifier);
    const aggregatedResult = this.aggregateSegmentResults(results);
    this.cacheResults(aggregatedResult);
    return this.meetsStudyingThreshold(aggregatedResult) ? 'Studying' : 'Idle';
  }

  public async classifyWithConfidence(text: unknown): Promise<ClassificationResult> {
    if (typeof text !== 'string') {
      throw new ClassificationError('Text input must be a string');
    }
    
    const cleanedText = await this.preprocessText(text);
    const segments = this.splitIntoSegments(cleanedText);
    const classifier = await this.getOrCreateClassifier();
    const results = await this.classifyEachSegment(segments, classifier);
    const aggregatedResult = this.aggregateSegmentResults(results);
    this.cacheResults(aggregatedResult);
    
    return {
      classification: this.meetsStudyingThreshold(aggregatedResult) ? 'Studying' : 'Idle',
      confidence: aggregatedResult.highestConfidence
    };
  }

  public getLabels(): string[] {
    return ['Studying', 'Idle'];
  }

  // ISegmentedClassifier implementation
  public async classifySegmented(text: string): Promise<boolean> {
    const cleanedText = await this.preprocessText(text);
    const segments = this.splitIntoSegments(cleanedText);
    const classifier = await this.getOrCreateClassifier();
    const results = await this.classifyEachSegment(segments, classifier);
    const aggregatedResult = this.aggregateSegmentResults(results);
    this.cacheResults(aggregatedResult);
    return this.meetsStudyingThreshold(aggregatedResult);
  }

  private async preprocessText(text: string): Promise<string> {
    return await this.textPreprocessor.preprocess(text);
  }

  private splitIntoSegments(cleanedText: string): TextSegment[] {
    return this.textSegmenter.segment(cleanedText);
  }

  private async getOrCreateClassifier(): Promise<ClassificationStrategy> {
    if (!this.currentClassifier || this.shouldRecreateClassifier()) {
      this.currentClassifier = await this.createOptimalClassifier();
    }
    return this.currentClassifier;
  }

  private shouldRecreateClassifier(): boolean {
    return false; // For now, we don't recreate unless needed
  }

  private async createOptimalClassifier(): Promise<ClassificationStrategy> {
    Logger.info('Creating classifier for segmented classification', {
      strategy: this.config.strategyType,
      model: this.config.modelName,
      topic: this.config.topic
    });
    
    return await this.modelFactory.createStrategy(
      this.config.strategyType,
      this.config.modelName,
      {
        topic: this.config.topic,
        threshold: this.config.confidenceThreshold
      }
    );
  }

  private async classifyEachSegment(
    segments: TextSegment[], 
    classifier: ClassificationStrategy
  ): Promise<SegmentClassificationResult[]> {
    const results: SegmentClassificationResult[] = [];
    
    for (const segment of segments) {
      const result = await this.classifySingleSegment(segment, classifier);
      results.push(result);
    }
    
    return results;
  }

  private async classifySingleSegment(
    segment: TextSegment,
    classifier: ClassificationStrategy
  ): Promise<SegmentClassificationResult> {
    const classificationResult = await classifier.classifyWithConfidence(segment.text);
    
    return {
      segment,
      classification: classificationResult.classification,
      confidence: classificationResult.confidence
    };
  }

  private aggregateSegmentResults(results: SegmentClassificationResult[]): SegmentedClassificationResult {
    if (this.hasNoResults(results)) {
      return this.createEmptyResult();
    }
    
    const highestConfidenceResult = this.findHighestConfidenceResult(results);
    
    return {
      overallClassification: highestConfidenceResult.classification,
      highestConfidence: highestConfidenceResult.confidence,
      segmentResults: results
    };
  }

  private hasNoResults(results: SegmentClassificationResult[]): boolean {
    return results.length === 0;
  }

  private cacheResults(result: SegmentedClassificationResult): void {
    this.lastClassificationResult = result;
  }

  private meetsStudyingThreshold(result: SegmentedClassificationResult): boolean {
    return result.highestConfidence >= this.config.studyingThreshold && 
           result.overallClassification === 'studying';
  }
  
  public getLastClassificationResult(): SegmentedClassificationResult | null {
    return this.lastClassificationResult;
  }

  public async updateConfiguration(newConfig: Partial<SegmentedClassificationConfig>): Promise<void> {
    Object.assign(this.config, newConfig);
    await this.recreateClassifier();
    this.logConfigurationUpdate(newConfig);
  }

  private async recreateClassifier(): Promise<void> {
    this.currentClassifier = undefined;
    this.currentClassifier = await this.createOptimalClassifier();
  }

  private logConfigurationUpdate(newConfig: Partial<SegmentedClassificationConfig>): void {
    Logger.info('Segmented classification configuration updated', {
      changes: newConfig,
      currentConfig: this.config
    });
  }

  private createEmptyResult(): SegmentedClassificationResult {
    return {
      overallClassification: 'idle',
      highestConfidence: 0,
      segmentResults: []
    };
  }

  private findHighestConfidenceResult(segmentResults: SegmentClassificationResult[]): SegmentClassificationResult {
    if (segmentResults.length === 0) {
      throw new ClassificationError('Cannot find highest confidence from empty results');
    }
    
    return segmentResults.reduce((highest, current) => 
      current.confidence > highest.confidence ? current : highest,
      segmentResults[0]
    );
  }
}