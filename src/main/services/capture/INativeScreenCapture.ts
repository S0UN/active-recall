/**
 * Interface for platform-specific native screen capture implementations.
 * Each platform (Windows, macOS, Linux) should implement this interface
 * to provide native screen capture functionality as a fallback when
 * Electron's screen capture fails.
 */
export interface INativeScreenCapture {
  /**
   * Captures the current screen and returns it as a Buffer.
   * @returns Promise<Buffer> The captured screen as a PNG image buffer
   * @throws ScreenCaptureError if the capture fails
   */
  captureScreen(): Promise<Buffer>;

  /**
   * Checks if this capture service is supported on the current platform.
   * @returns boolean True if the platform is supported, false otherwise
   */
  isSupported(): boolean;

  /**
   * Gets the name of the platform this service is designed for.
   * @returns string The platform name (e.g., 'macOS', 'Windows', 'Linux')
   */
  getPlatformName(): string;
}