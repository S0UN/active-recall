import { inject, injectable } from 'tsyringe';
import { IScreenCaptureService } from '../../capture/IScreenCaptureService';
import { IOcrService } from '../../analysis/IOcrService';
import { ILogger } from '../../../utils/ILogger';
import { VisionServiceError, ScreenCaptureError, OcrProcessingError } from '../../../errors/CustomErrors';

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
			
			if (!imageBuffer || imageBuffer.length === 0) {
				throw new ScreenCaptureError('Screen capture returned empty buffer');
			}
			
			await this.ocrService.init();
			const text = await this.ocrService.getTextFromImage(imageBuffer);
			return text || '';
		} catch (error) {
			// Re-throw known domain errors to preserve error chain
			if (error instanceof ScreenCaptureError || error instanceof OcrProcessingError) {
				throw error;
			}
			
			// Wrap unknown errors with context, preserving original as cause
			const visionError = new VisionServiceError(
				'Failed to capture and recognize text', 
				error as Error
			);
			
			this.logger.error(
				`Vision service error in captureAndRecognizeText: ${error instanceof Error ? error.message : String(error)}`
			);
			
			throw visionError;
		}
	}
}
