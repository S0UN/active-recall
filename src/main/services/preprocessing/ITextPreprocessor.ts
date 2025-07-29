export interface ITextPreprocessor {
  preprocess(text: string): Promise<string>;
}