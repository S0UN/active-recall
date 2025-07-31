import { injectable, inject } from 'tsyringe';
import { 
  ISegmentedClassifier, 
  SegmentedClassificationResult, 
  SegmentClassificationResult,
} from '../ISegmentedClassifier';
import { ITextSegmenter, TextSegment } from '../../preprocessing/ITextSegmenter';
import { ITextPreprocessor } from '../../preprocessing/ITextPreprocessor';
import { IClassificationService } from '../IClassificationService';

@injectable()
export class SegmentedClassificationService implements ISegmentedClassifier {
  private static readonly DEFAULT_STUDYING_THRESHOLD = 0.6;
  private lastClassificationResult: SegmentedClassificationResult | null = null;
  config: { studyingThreshold: number; };

  constructor(
    @inject('TextSegmenter') private readonly textSegmenter: ITextSegmenter,
    @inject('TextPreprocessor') private readonly textPreprocessor: ITextPreprocessor,
    @inject('ClassificationService') private readonly classificationService: IClassificationService,
    config?: { studyingThreshold?: number }
  ) {
    this.config = { 
      studyingThreshold: SegmentedClassificationService.DEFAULT_STUDYING_THRESHOLD,
      ...config
    };
  }

  //NOTE: Might be better to prune results rather than getting the classification for every single segment

  public async classifySegmented(text: string): Promise<boolean> {
    const cleanedText = await this.preprocessFullText(text);
    const segments = this.segmentCleanedText(cleanedText);
    const classificationResult = await this.classifyAllSegments(segments);
    
    this.storeLastResult(classificationResult);
    
    return this.isStudyingBasedOnThreshold(classificationResult);
  }
  
  public getLastClassificationResult(): SegmentedClassificationResult | null {
    return this.lastClassificationResult;
  }
  
  private async preprocessFullText(text: string): Promise<string> {
    return await this.textPreprocessor.preprocess(text);
  }
  
  private segmentCleanedText(cleanedText: string) {
    return this.textSegmenter.segment(cleanedText);
  }
  
  private async classifyAllSegments(segments: TextSegment[]) {
    if (this.hasNoSegments(segments)) {
      return this.createEmptyResult();
    }
    
    const segmentResults = await this.classifyEachSegment(segments);
    return this.buildOverallResult(segmentResults);
  }
  
  private hasNoSegments(segments: TextSegment[]): boolean {
    return segments.length === 0;
  }
  
  private createEmptyResult(): SegmentedClassificationResult {
    return {
      overallClassification: 'idle',
      highestConfidence: 0,
      segmentResults: []
    };
  }
  
  private async classifyEachSegment(segments: TextSegment[]): Promise<SegmentClassificationResult[]> {
    const results: SegmentClassificationResult[] = [];
    
    for (const segment of segments) {
      const segmentResult = await this.classifySingleSegment(segment);
      results.push(segmentResult);
    }
    
    return results;
  }
  
  private async classifySingleSegment(segment: TextSegment): Promise<SegmentClassificationResult> {
    this.validateClassificationCapability();
    
    const classificationResult = await this.classificationService.classifyWithConfidence!(segment.text);
    
    return {
      segment,
      classification: classificationResult.classification,
      confidence: classificationResult.confidence
    };
  }
  
  private validateClassificationCapability(): void {
    if (!this.classificationService.classifyWithConfidence) {
      throw new Error('Classification service must support classifyWithConfidence');
    }
  }
  
  private buildOverallResult(segmentResults: SegmentClassificationResult[]): SegmentedClassificationResult {
    const highestConfidenceResult = this.findHighestConfidenceResult(segmentResults);
    
    return {
      overallClassification: highestConfidenceResult.classification,
      highestConfidence: highestConfidenceResult.confidence,
      segmentResults
    };
  }
  
  private findHighestConfidenceResult(segmentResults: SegmentClassificationResult[]): SegmentClassificationResult {
    return segmentResults.reduce((highest, current) => 
      current.confidence > highest.confidence ? current : highest,
      segmentResults[0]
    );
  }
  
  private storeLastResult(result: SegmentedClassificationResult): void {
    this.lastClassificationResult = result;
  }
  
  private isStudyingBasedOnThreshold(result: SegmentedClassificationResult): boolean {
    return result.highestConfidence >= this.config.studyingThreshold && 
           result.overallClassification === 'studying';
  }
}