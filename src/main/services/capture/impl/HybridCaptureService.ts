import { injectable, inject } from "tsyringe";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import { ILogger } from '../../../utils/ILogger';
import { ErrorHandler } from '../../../utils/ErrorHandler';
import { ElectronCaptureService } from './ElectronCaptureService';
import { MacOSNativeCaptureService } from './MacOSNativeCaptureService';

// Make a native screen capture interface
// Make all the OS systems implemetnt this
// HybridCaptureService will try Electron first, then native if Electron fails
// We will have a create native screen capture service in this class that 
// will create it based on the OS. We can have a create method that does this

@injectable()
export class HybridCaptureService implements IScreenCaptureService {
  private electronService: ElectronCaptureService;
  private nativeService: MacOSNativeCaptureService;
  private useNativeFallback = false;
  private readonly errorHandler: ErrorHandler;

  constructor(
    @inject('LoggerService') private readonly logger: ILogger
  ) {
    this.errorHandler = new ErrorHandler(logger);
    this.electronService = new ElectronCaptureService();
    this.nativeService = new MacOSNativeCaptureService(logger);
  }

  public async captureScreen(): Promise<Buffer> {
    if (this.shouldUseNativeFallback()) {
      return await this.captureWithNative();
    }

    return await this.captureWithElectronOrFallback();
  }

  private shouldUseNativeFallback(): boolean {
    return this.useNativeFallback;
  }

  private async captureWithNative(): Promise<Buffer> {
    this.logger.debug('Using native screencapture (Electron fallback mode)');
    return await this.nativeService.captureScreen();
  }

  private async captureWithElectronOrFallback(): Promise<Buffer> {
    try {
      const buffer = await this.attemptElectronCapture();
      return buffer;
    } catch (electronError) {
      return await this.fallbackToNativeCapture(electronError);
    }
  }

  private async attemptElectronCapture(): Promise<Buffer> {
    this.logger.debug('Attempting Electron screen capture...');
    const buffer = await this.electronService.captureScreen();
    
    if (this.isBufferEmpty(buffer)) {
      this.handleEmptyElectronBuffer();
      return await this.captureWithNative();
    }
    
    this.logger.debug('Electron screen capture successful');
    return buffer;
  }

  private isBufferEmpty(buffer: Buffer): boolean {
    return !buffer || buffer.length === 0;
  }

  private handleEmptyElectronBuffer(): void {
    this.logger.warn('Electron screen capture returned empty buffer (known Electron 37 issue), switching to native fallback');
    this.enableNativeFallback();
  }

  private enableNativeFallback(): void {
    this.useNativeFallback = true;
  }

  private async fallbackToNativeCapture(electronError: unknown): Promise<Buffer> {
    const electronErrorMsg = this.formatError(electronError);
    this.logger.warn(`Electron screen capture failed: ${electronErrorMsg}, trying native fallback`);
    
    try {
      const buffer = await this.nativeService.captureScreen();
      this.handleSuccessfulNativeFallback();
      return buffer;
    } catch (nativeError) {
      this.handleBothMethodsFailed(electronError, nativeError);
    }
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private handleSuccessfulNativeFallback(): void {
    this.logger.info('Native screen capture successful, switching to native mode for this session');
    this.enableNativeFallback();
  }

  private handleBothMethodsFailed(electronError: unknown, nativeError: unknown): never {
    const combinedError = new ScreenCaptureError(
      `Both capture methods failed. Electron: ${this.formatError(electronError)}, Native: ${this.formatError(nativeError)}`,
      electronError instanceof Error ? electronError : new Error(String(electronError))
    );
    
    this.errorHandler.logAndThrow(combinedError, {
      operation: 'HybridCaptureService.captureScreen',
      metadata: {
        electronError: this.formatError(electronError),
        nativeError: this.formatError(nativeError),
        useNativeFallback: this.useNativeFallback
      }
    });
  }

  // Method to check if we're using native fallback (for debugging/monitoring)
  public isUsingNativeFallback(): boolean {
    return this.useNativeFallback;
  }

  // Method to force native mode (for testing)
  public forceNativeMode(): void {
    this.useNativeFallback = true;
    this.logger.info('Forced switch to native screen capture mode');
  }

  // Method to reset to try Electron first (for testing)
  public resetToElectronFirst(): void {
    this.useNativeFallback = false;
    this.logger.info('Reset to try Electron screen capture first');
  }
}