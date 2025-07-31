export type TextSegment = {
  text: string;
  startIndex: number;
  endIndex: number;
  type: 'sentence' | 'line' | 'chunk';
};

export type SegmentationOptions = {
  minLength?: number;
  maxLength?: number;
  preferredMethod?: 'sentence' | 'line';
};

export interface ITextSegmenter {
  segment(text: string, options?: SegmentationOptions): TextSegment[];
}