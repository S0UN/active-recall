import { IOcrService } from '../IOcrService';
import { createWorker } from 'tesseract.js';
import { ILogger } from '../../../utils/ILogger';
import { inject, injectable } from 'tsyringe';
@injectable()
export class TesseractOcrService implements IOcrService {
  private worker:any;
  
  constructor(@inject('LoggerService') private readonly logger: ILogger) {
    this.worker = null;
  }
   
  public async init(): Promise<void> {
    await this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    if (this.worker) {
      return;
    }
    this.logger.debug('TesseractOcrService: Initializing worker...');
    this.worker = await createWorker('eng');
    this.logger.debug('TesseractOcrService: Worker initialized.');
  }

  public async getTextFromImage(imageBuffer: Buffer): Promise<string> {
    if (!this.worker) {
      throw new Error('Tesseract worker not initialized.');
    }
    const { data: { text } } = await this.worker.recognize(imageBuffer);
    return this.cleanText(text);
  }

  public async dispose(): Promise<void> {
    if (this.worker) {
      this.logger.info('TesseractOcrService: Terminating worker...');
      await this.worker.terminate();
      this.worker = null;
      this.logger.info('TesseractOcrService: Worker terminated.');
    }
  }

  public cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}
