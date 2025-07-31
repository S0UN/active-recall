import { TextSegment } from '../preprocessing/ITextSegmenter';

export interface SegmentClassificationResult {
	segment: TextSegment;
	classification: string;
	confidence: number;
}

export interface SegmentedClassificationResult {
	overallClassification: string;
	highestConfidence: number;
	segmentResults: SegmentClassificationResult[];
}

export interface ISegmentedClassifier {
	classifySegmented(text: string): Promise<boolean>;
}