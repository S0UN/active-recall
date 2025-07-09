export interface IOcrService {
  init(): Promise<void>;
  getTextFromImage(imageBuffer: Buffer): Promise<string>;
  dispose(): Promise<void>;
}
