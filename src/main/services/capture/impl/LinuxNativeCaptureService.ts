import { injectable, inject } from "tsyringe";
import { INativeScreenCapture } from "../INativeScreenCapture";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import { ILogger } from '../../../utils/ILogger';
import { ErrorHandler } from '../../../utils/ErrorHandler';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Linux-specific implementation of native screen capture.
 * Tries multiple Linux screenshot tools in order of preference:
 * 1. gnome-screenshot (GNOME desktop)
 * 2. scrot (X11 systems)
 * 3. import (ImageMagick - widely available)
 */
@injectable()
export class LinuxNativeCaptureService implements INativeScreenCapture, IScreenCaptureService {
  private readonly errorHandler: ErrorHandler;
  private readonly platformName = 'Linux';
  private readonly screenshotTools = [
    { command: 'gnome-screenshot', args: ['--file'] },
    { command: 'scrot', args: [] },
    { command: 'import', args: ['-window', 'root'] }
  ];

  constructor(
    @inject('LoggerService') private readonly logger: ILogger
  ) {
    this.errorHandler = new ErrorHandler(logger);
  }

  /**
   * Main entry point for screen capture on Linux
   */
  public async captureScreen(): Promise<Buffer> {
    this.ensurePlatformSupported();
    
    try {
      return await this.performScreenCapture();
    } catch (error) {
      this.handleCaptureError(error);
    }
  }

  /**
   * Performs the actual screen capture operation
   */
  private async performScreenCapture(): Promise<Buffer> {
    const tempFilePath = this.generateTempFilePath();
    
    await this.captureScreenToFile(tempFilePath);
    const buffer = await this.readCaptureFile(tempFilePath);
    await this.cleanupTempFile(tempFilePath);
    
    this.logSuccessfulCapture(buffer.length);
    return buffer;
  }

  /**
   * Generates a unique temporary file path for the screenshot
   */
  private generateTempFilePath(): string {
    return join(tmpdir(), `screenshot-${Date.now()}.png`);
  }

  /**
   * Attempts to capture screen using available Linux tools
   */
  private async captureScreenToFile(filePath: string): Promise<void> {
    this.logger.debug(`Capturing Linux screen to: ${filePath}`);
    
    const errors: Error[] = [];
    
    for (const tool of this.screenshotTools) {
      try {
        await this.tryScreenshotTool(tool, filePath);
        this.logger.debug(`Successfully captured screen using ${tool.command}`);
        return;
      } catch (error) {
        this.logger.debug(`${tool.command} failed: ${error instanceof Error ? error.message : String(error)}`);
        errors.push(error as Error);
        continue;
      }
    }
    
    // If we get here, all tools failed
    this.throwAllToolsFailedError(errors);
  }

  /**
   * Attempts screenshot with a specific tool
   */
  private async tryScreenshotTool(
    tool: { command: string; args: string[] }, 
    outputPath: string
  ): Promise<void> {
    const args = this.buildToolArguments(tool, outputPath);
    const timeout = 10000; // 10 seconds
    
    await this.executeScreenshotCommand(tool.command, args, timeout);
  }

  /**
   * Builds command arguments for each screenshot tool
   */
  private buildToolArguments(
    tool: { command: string; args: string[] }, 
    outputPath: string
  ): string[] {
    // All tools currently use the same pattern: [...args, outputPath]
    // This method exists for future extensibility if tools need different argument patterns
    return [...tool.args, outputPath];
  }

  /**
   * Executes a screenshot command with proper error handling
   */
  private async executeScreenshotCommand(
    command: string, 
    args: string[], 
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Executing command: ${command} ${args.join(' ')}`);
      
      const process = spawn(command, args, { stdio: 'pipe' });
      let stderrData = '';
      let timedOut = false;
      
      // Collect stderr for error reporting
      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      // Handle process completion
      process.on('close', (code) => {
        if (timedOut) return;
        
        if (code !== 0) {
          reject(new Error(`${command} failed with exit code ${code}: ${stderrData}`));
          return;
        }
        
        resolve();
      });

      // Handle process errors (command not found, etc.)
      process.on('error', (error) => {
        if (timedOut) return;
        reject(new Error(`Failed to execute ${command}: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Clear timeout on completion
      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Throws an error when all screenshot tools fail
   */
  private throwAllToolsFailedError(errors: Error[]): never {
    const toolNames = this.screenshotTools.map(tool => tool.command).join(', ');
    const errorMessages = errors.map(err => err.message).join('; ');
    
    throw new ScreenCaptureError(
      `All Linux screenshot tools failed (${toolNames}). Errors: ${errorMessages}. ` +
      `Please install one of: gnome-screenshot, scrot, or ImageMagick (import command).`
    );
  }

  /**
   * Reads the captured screenshot file into a buffer
   */
  private async readCaptureFile(filePath: string): Promise<Buffer> {
    const buffer = await fs.readFile(filePath);
    
    if (!buffer || buffer.length === 0) {
      throw new ScreenCaptureError('Linux screen capture produced empty file');
    }
    
    return buffer;
  }

  /**
   * Cleans up the temporary screenshot file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      // Log but don't throw - cleanup failure shouldn't fail the operation
      this.logger.warn('Failed to cleanup temp screenshot file', {
        path: filePath,
        error: unlinkError
      });
    }
  }

  /**
   * Logs successful capture information
   */
  private logSuccessfulCapture(bufferSize: number): void {
    this.logger.debug(`Linux native screen capture successful: ${bufferSize} bytes`);
  }

  /**
   * Handles and logs capture errors appropriately
   */
  private handleCaptureError(error: unknown): never {
    if (error instanceof ScreenCaptureError) {
      throw error;
    }
    
    const captureError = new ScreenCaptureError(
      'Linux native screen capture failed', 
      error as Error
    );
    
    this.errorHandler.logAndThrow(captureError, {
      operation: 'LinuxNativeCaptureService.captureScreen'
    });
  }

  /**
   * Ensures the service is running on Linux
   */
  private ensurePlatformSupported(): void {
    if (!this.isSupported()) {
      throw new ScreenCaptureError(
        `LinuxNativeCaptureService can only be used on Linux. Current platform: ${process.platform}`
      );
    }
  }

  /**
   * Checks if this service is supported on the current platform
   */
  public isSupported(): boolean {
    return process.platform === 'linux';
  }

  /**
   * Gets the platform name for this service
   */
  public getPlatformName(): string {
    return this.platformName;
  }
}