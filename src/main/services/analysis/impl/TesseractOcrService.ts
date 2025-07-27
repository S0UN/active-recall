import { IOcrService } from '../IOcrService';
import { createWorker } from 'tesseract.js';
import { ILogger } from '../../../utils/ILogger';
import { inject, injectable } from 'tsyringe';
import { OcrInitializationError, OcrProcessingError } from '../../../errors/CustomErrors';
@injectable()
export class TesseractOcrService implements IOcrService {
  private worker: any = undefined;
  
  constructor(@inject('LoggerService') private readonly logger: ILogger) {}
   
  public async init(): Promise<void> {
    await this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    if (this.worker) {
      return;
    }
    
    try {
      this.logger.debug('TesseractOcrService: Initializing worker...');
      this.worker = await createWorker('eng');
      this.logger.debug('TesseractOcrService: Worker initialized.');
    } catch (error) {
      throw new OcrInitializationError('Failed to initialize Tesseract worker', error as Error);
    }
  }

  public async getTextFromImage(imageBuffer: Buffer): Promise<string> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new OcrProcessingError('Image buffer is empty or invalid');
    }
    
    if (!this.worker) {
      throw new OcrInitializationError('Tesseract worker not initialized');
    }
    
    try {
      const { data: { text } } = await this.worker.recognize(imageBuffer);
      return this.cleanText(text);
    } catch (error) {
      throw new OcrProcessingError('Failed to process image with Tesseract', error as Error);
    }
  }

  public async dispose(): Promise<void> {
    if (this.worker) {
      try {
        this.logger.info('TesseractOcrService: Terminating worker...');
        await this.worker.terminate();
        this.worker = undefined;
        this.logger.info('TesseractOcrService: Worker terminated.');
      } catch (error) {
        this.logger.error('Error terminating Tesseract worker:', error as Error);
        this.worker = undefined;
      }
    }
  }

  public cleanText(text: string): string {
    if (!text) {
      return '';
    }
    
    return text.replace(/\s+/g, ' ').trim();
  }
}
