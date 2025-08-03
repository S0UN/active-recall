import { TextSegment } from '../preprocessing/ITextSegmenter';

export type SegmentClassificationResult = {
	segment: TextSegment;
	classification: string;
	confidence: number;
}

export type SegmentedClassificationResult = {
	overallClassification: string;
	highestConfidence: number;
	segmentResults: SegmentClassificationResult[];
}

export interface ISegmentedClassifier {
	classifySegmented(text: string): Promise<boolean>;
}