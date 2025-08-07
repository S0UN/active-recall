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
  strategyType?: StrategyType;
  modelName?: string;
  topic?: string;
  confidenceThreshold?: number;
  segmentThresholdProportion?: number;
}


// should look into pruning so we dont have to do unecessary classifications, 
// Wont do for now as the information might be useful for debugging later on
@injectable()
export class SegmentedClassificationService implements ISegmentedClassifier, IClassificationService {
  private static readonly DEFAULT_TOPIC = 'computer science';
  
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
      strategyType: 'zero-shot', // Only using zero-shot strategy
      modelName: config?.modelName ?? 'facebook/bart-large-mnli',
      topic: config?.topic ?? SegmentedClassificationService.DEFAULT_TOPIC,
      confidenceThreshold: config?.confidenceThreshold ?? 0.85, // Lower threshold for testing
      segmentThresholdProportion: config?.segmentThresholdProportion ?? this.getSegmentThresholdFromEnv()
    };
  }
  
  private getSegmentThresholdFromEnv(): number {
    const envValue = process.env.SEGMENT_THRESHOLD_PROPORTION;
    if (envValue) {
      const parsed = parseFloat(envValue);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
      Logger.warn(`Invalid SEGMENT_THRESHOLD_PROPORTION value: ${envValue}, using default: 0.4`);
    }
    return 0.4; // 40% of segments must be studying
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

  // Maybe should implement pruning here
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
    const studyingSegments = this.countStudyingSegments(results);
    const studyingProportion = studyingSegments / results.length;
    
    // Overall classification based on segment proportion threshold
    const overallClassification = studyingProportion >= this.config.segmentThresholdProportion 
      ? highestConfidenceResult.classification 
      : 'idle';
    
    return {
      overallClassification,
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
    if (result.segmentResults.length === 0) {
      return false;
    }
    
    const studyingSegments = this.countStudyingSegments(result.segmentResults);
    const totalSegments = result.segmentResults.length;
    const studyingProportion = studyingSegments / totalSegments;
    
    Logger.debug('Segment threshold analysis', {
      studyingSegments,
      totalSegments,
      studyingProportion,
      requiredProportion: this.config.segmentThresholdProportion,
      meetsThreshold: studyingProportion >= this.config.segmentThresholdProportion
    });
    
    return studyingProportion >= this.config.segmentThresholdProportion;
  }
  
  private countStudyingSegments(segmentResults: SegmentClassificationResult[]): number {
    return segmentResults.filter(result => 
      result.confidence >= this.config.confidenceThreshold && 
      result.classification !== 'idle'
    ).length;
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