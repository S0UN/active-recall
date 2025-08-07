import { INativeScreenCapture } from './INativeScreenCapture';
import { ILogger } from '../../utils/ILogger';
import { MacOSNativeCaptureService } from './impl/MacOSNativeCaptureService';
import { WindowsNativeCaptureService } from './impl/WindowsNativeCaptureService';
import { LinuxNativeCaptureService } from './impl/LinuxNativeCaptureService';
import { ScreenCaptureError } from '../../errors/CustomErrors';

/**
 * Factory class for creating platform-specific native screen capture services.
 * Uses the factory pattern to abstract platform detection and service instantiation.
 */
export class NativeCaptureFactory {
  
  /**
   * Creates the appropriate native screen capture service for the current platform.
   * 
   * @param logger - Logger instance for the created service
   * @returns INativeScreenCapture implementation for the current platform
   * @throws ScreenCaptureError if the platform is not supported
   */
  public static createNativeCaptureService(logger: ILogger): INativeScreenCapture {
    const currentPlatform = process.platform;
    
    switch (currentPlatform) {
      case 'darwin':
        return new MacOSNativeCaptureService(logger);
      
      case 'win32':
        return new WindowsNativeCaptureService(logger);
      
      case 'linux':
        return new LinuxNativeCaptureService(logger);
      
      default:
        throw new ScreenCaptureError(
          `Unsupported platform for native screen capture: ${currentPlatform}. ` +
          `Supported platforms: macOS (darwin), Windows (win32), Linux (linux)`
        );
    }
  }

  /**
   * Gets information about all supported platforms.
   * Useful for diagnostics and platform capability reporting.
   * 
   * @returns Array of supported platform information
   */
  public static getSupportedPlatforms(): Array<{
    platformCode: string;
    displayName: string;
    isCurrentPlatform: boolean;
  }> {
    const currentPlatform = process.platform;
    
    return [
      {
        platformCode: 'darwin',
        displayName: 'macOS',
        isCurrentPlatform: currentPlatform === 'darwin'
      },
      {
        platformCode: 'win32',
        displayName: 'Windows',
        isCurrentPlatform: currentPlatform === 'win32'
      },
      {
        platformCode: 'linux',
        displayName: 'Linux',
        isCurrentPlatform: currentPlatform === 'linux'
      }
    ];
  }

  /**
   * Checks if the current platform supports native screen capture.
   * 
   * @returns true if native capture is supported on this platform
   */
  public static isCurrentPlatformSupported(): boolean {
    const supportedPlatforms = ['darwin', 'win32', 'linux'];
    return supportedPlatforms.includes(process.platform);
  }

  /**
   * Gets the display name for the current platform.
   * 
   * @returns Human-readable platform name
   */
  public static getCurrentPlatformDisplayName(): string {
    const platformInfo = this.getSupportedPlatforms().find(p => p.isCurrentPlatform);
    return platformInfo?.displayName || `Unknown (${process.platform})`;
  }

  /**
   * Creates a native capture service with validation.
   * This method adds additional safety checks before service creation.
   * 
   * @param logger - Logger instance for the created service
   * @returns INativeScreenCapture implementation
   * @throws ScreenCaptureError if platform is unsupported or service creation fails
   */
  public static createValidatedNativeCaptureService(logger: ILogger): INativeScreenCapture {
    // Pre-validate platform support
    if (!this.isCurrentPlatformSupported()) {
      throw new ScreenCaptureError(
        `Cannot create native capture service: platform '${process.platform}' is not supported. ` +
        `Supported platforms: ${this.getSupportedPlatforms().map(p => p.displayName).join(', ')}`
      );
    }

    try {
      const service = this.createNativeCaptureService(logger);
      
      // Double-check that the created service supports this platform
      if (!service.isSupported()) {
        throw new ScreenCaptureError(
          `Created service ${service.getPlatformName()} does not support current platform ${process.platform}`
        );
      }

      logger.debug(`Created native capture service for ${service.getPlatformName()}`);
      return service;

    } catch (error) {
      if (error instanceof ScreenCaptureError) {
        throw error;
      }
      
      throw new ScreenCaptureError(
        `Failed to create native capture service for platform ${this.getCurrentPlatformDisplayName()}`,
        error as Error
      );
    }
  }
}