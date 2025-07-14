import { inject, injectable } from 'tsyringe';
import { IScreenCaptureService } from '../../capture/IScreenCaptureService';
import { IOcrService } from '../../analysis/IOcrService';
import { ILogger } from '../../../utils/ILogger';
import { LogExecution } from '../../../utils/LogExecution';

@injectable()
export class VisionService {

  constructor(
    @inject('ScreenCaptureService') private readonly screenCaptureService: IScreenCaptureService,
    @inject('OcrService') private readonly ocrService: IOcrService,
    @inject('LoggerService') private readonly logger: ILogger
  ) {}

  public async captureAndRecognizeText(): Promise<string> {
    try {
      this.logger.info('Capturing screen...');
      const imageBuffer = await this.screenCaptureService.captureScreen();
      await this.ocrService.init();
      const text = await this.ocrService.getTextFromImage(imageBuffer);
      return text;
    } catch (error) {
      this.logger.error('Error in captureAndRecognizeText:', error as Error);
      throw error;
    }
  }
}
