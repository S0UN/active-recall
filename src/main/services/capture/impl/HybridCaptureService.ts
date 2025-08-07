import { injectable, inject } from "tsyringe";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { INativeScreenCapture } from "../INativeScreenCapture";
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import { ILogger } from '../../../utils/ILogger';
import { ErrorHandler } from '../../../utils/ErrorHandler';
import { ElectronCaptureService } from './ElectronCaptureService';
import { NativeCaptureFactory } from '../NativeCaptureFactory';

/**
 * Hybrid screen capture service that tries Electron first, then falls back to native capture.
 * 
 * This service provides a robust screen capture solution by attempting Electron's built-in
 * screen capture first, and automatically falling back to platform-specific native solutions
 * if Electron fails. Once a fallback occurs, the service remembers this preference for the
 * current session to avoid repeated failed attempts.
 * 
 * The native fallback supports:
 * - macOS: Uses screencapture command
 * - Windows: Uses PowerShell with .NET System.Windows.Forms
 * - Linux: Uses gnome-screenshot, scrot, or ImageMagick (import)
 */
@injectable()
export class HybridCaptureService implements IScreenCaptureService {
  private readonly electronService: ElectronCaptureService;
  private readonly nativeService: INativeScreenCapture;
  private readonly errorHandler: ErrorHandler;
  private useNativeFallback = false;

  constructor(
    @inject('LoggerService') private readonly logger: ILogger
  ) {
    this.errorHandler = new ErrorHandler(logger);
    this.electronService = this.createElectronService();
    this.nativeService = this.createNativeService();
  }

  /**
   * Captures the screen using the most reliable method available.
   * Tries Electron first, falls back to native if needed.
   */
  public async captureScreen(): Promise<Buffer> {
    if (this.shouldUseNativeFallback()) {
      return await this.captureWithNative();
    }

    return await this.captureWithElectronOrFallback();
  }

  /**
   * Creates the Electron capture service
   */
  private createElectronService(): ElectronCaptureService {
    return new ElectronCaptureService();
  }

  /**
   * Creates the appropriate native capture service for the current platform
   */
  private createNativeService(): INativeScreenCapture {
    try {
      return NativeCaptureFactory.createValidatedNativeCaptureService(this.logger);
    } catch (error) {
      this.logger.error('Failed to create native capture service', error as Error);
      throw new ScreenCaptureError(
        'Unable to initialize native screen capture for this platform'
      );
    }
  }

  /**
   * Determines if we should skip Electron and use native capture
   */
  private shouldUseNativeFallback(): boolean {
    return this.useNativeFallback;
  }

  /**
   * Captures screen using native service directly
   */
  private async captureWithNative(): Promise<Buffer> {
    this.logger.debug(`Using ${this.nativeService.getPlatformName()} native capture (Electron fallback mode)`);
    return await this.nativeService.captureScreen();
  }

  /**
   * Attempts Electron capture with automatic fallback to native
   */
  private async captureWithElectronOrFallback(): Promise<Buffer> {
    try {
      return await this.attemptElectronCapture();
    } catch (electronError) {
      return await this.handleElectronFailure(electronError);
    }
  }

  /**
   * Attempts to capture screen using Electron
   */
  private async attemptElectronCapture(): Promise<Buffer> {
    this.logger.debug('Attempting Electron screen capture...');
    
    const buffer = await this.electronService.captureScreen();
    
    if (this.isBufferInvalid(buffer)) {
      this.handleInvalidElectronBuffer();
      return await this.captureWithNative();
    }
    
    this.logElectronSuccess(buffer.length);
    return buffer;
  }

  /**
   * Checks if the captured buffer is invalid (empty or null)
   */
  private isBufferInvalid(buffer: Buffer): boolean {
    return !buffer || buffer.length === 0;
  }

  /**
   * Handles the case when Electron returns an invalid buffer
   */
  private handleInvalidElectronBuffer(): void {
    this.logger.warn(
      'Electron screen capture returned empty buffer (known Electron 37+ issue), ' +
      'switching to native fallback'
    );
    this.enableNativeFallback();
  }

  /**
   * Logs successful Electron capture
   */
  private logElectronSuccess(bufferSize: number): void {
    this.logger.debug(`Electron screen capture successful: ${bufferSize} bytes`);
  }

  /**
   * Handles Electron capture failure by attempting native fallback
   */
  private async handleElectronFailure(electronError: unknown): Promise<Buffer> {
    const errorMessage = this.formatError(electronError);
    this.logger.warn(`Electron screen capture failed: ${errorMessage}, trying native fallback`);
    
    try {
      const buffer = await this.nativeService.captureScreen();
      this.handleSuccessfulNativeFallback();
      return buffer;
    } catch (nativeError) {
      this.handleBothMethodsFailed(electronError, nativeError);
    }
  }

  /**
   * Formats error objects into readable strings
   */
  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Handles successful native fallback after Electron failure
   */
  private handleSuccessfulNativeFallback(): void {
    const platformName = this.nativeService.getPlatformName();
    this.logger.info(
      `${platformName} native screen capture successful, switching to native mode for this session`
    );
    this.enableNativeFallback();
  }

  /**
   * Enables native fallback mode for the remainder of the session
   */
  private enableNativeFallback(): void {
    this.useNativeFallback = true;
  }

  /**
   * Handles the case when both Electron and native capture fail
   */
  private handleBothMethodsFailed(electronError: unknown, nativeError: unknown): never {
    const combinedError = this.createCombinedFailureError(electronError, nativeError);
    
    this.errorHandler.logAndThrow(combinedError, {
      operation: 'HybridCaptureService.captureScreen',
      metadata: this.createErrorMetadata(electronError, nativeError)
    });
  }

  /**
   * Creates a comprehensive error when both capture methods fail
   */
  private createCombinedFailureError(electronError: unknown, nativeError: unknown): ScreenCaptureError {
    const electronMsg = this.formatError(electronError);
    const nativeMsg = this.formatError(nativeError);
    const platformName = this.nativeService.getPlatformName();
    
    return new ScreenCaptureError(
      `Both capture methods failed on ${platformName}. ` +
      `Electron: ${electronMsg} | Native: ${nativeMsg}`,
      electronError instanceof Error ? electronError : new Error(String(electronError))
    );
  }

  /**
   * Creates error metadata for detailed logging
   */
  private createErrorMetadata(electronError: unknown, nativeError: unknown): Record<string, unknown> {
    return {
      electronError: this.formatError(electronError),
      nativeError: this.formatError(nativeError),
      platform: this.nativeService.getPlatformName(),
      useNativeFallback: this.useNativeFallback,
      platformSupported: this.nativeService.isSupported()
    };
  }

  // Public methods for monitoring and testing

  /**
   * Checks if the service is currently using native fallback mode.
   * Useful for monitoring and diagnostics.
   */
  public isUsingNativeFallback(): boolean {
    return this.useNativeFallback;
  }

  /**
   * Gets information about the current capture configuration.
   * Useful for debugging and system monitoring.
   */
  public getCaptureInfo(): {
    isUsingNativeFallback: boolean;
    nativePlatform: string;
    nativePlatformSupported: boolean;
  } {
    return {
      isUsingNativeFallback: this.useNativeFallback,
      nativePlatform: this.nativeService.getPlatformName(),
      nativePlatformSupported: this.nativeService.isSupported()
    };
  }

  /**
   * Forces the service to use native capture mode.
   * Primarily intended for testing scenarios.
   */
  public forceNativeMode(): void {
    this.useNativeFallback = true;
    const platformName = this.nativeService.getPlatformName();
    this.logger.info(`Forced switch to ${platformName} native screen capture mode`);
  }

  /**
   * Resets the service to try Electron first.
   * Primarily intended for testing scenarios.
   */
  public resetToElectronFirst(): void {
    this.useNativeFallback = false;
    this.logger.info('Reset to try Electron screen capture first');
  }
}