export interface IClassificationService {
  classify(text: string): Promise<string>;
}
