export interface IClassificationService {
  classify(text: string): Promise<boolean>;
}
