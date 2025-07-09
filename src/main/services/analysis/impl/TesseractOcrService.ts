import { IOcrService } from '../IOcrService';
import { createWorker } from 'tesseract.js';
import { LogExecution } from '../../../utils/LogExecution';
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

  @LogExecution() 
  private async initializeWorker(): Promise<void> {
    if (this.worker) {
      return;
    }
    this.logger.info('TesseractOcrService: Initializing worker...');
    this.worker = await createWorker();
    await this.worker.load();
    await this.worker.loadLanguage('eng');
    await this.worker.initialize('eng');
    this.logger.info('TesseractOcrService: Worker initialized.');
  }

  @LogExecution()
  public async getTextFromImage(imageBuffer: Buffer): Promise<string> {
    if (!this.worker) {
      throw new Error('Tesseract worker not initialized.');
    }
    const { data: { text } } = await this.worker.recognize(imageBuffer);
    return text;
  }

  @LogExecution()
  public async dispose(): Promise<void> {
    if (this.worker) {
      this.logger.info('TesseractOcrService: Terminating worker...');
      await this.worker.terminate();
      this.worker = null;
      this.logger.info('TesseractOcrService: Worker terminated.');
    }
  }
}
