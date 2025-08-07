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
 * Windows-specific implementation of native screen capture.
 * Uses PowerShell with .NET System.Windows.Forms for screenshot capture.
 */
@injectable()
export class WindowsNativeCaptureService implements INativeScreenCapture, IScreenCaptureService {
  private readonly errorHandler: ErrorHandler;
  private readonly platformName = 'Windows';

  constructor(
    @inject('LoggerService') private readonly logger: ILogger
  ) {
    this.errorHandler = new ErrorHandler(logger);
  }

  /**
   * Main entry point for screen capture on Windows
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
   * Captures the screen and saves it to the specified file
   */
  private async captureScreenToFile(filePath: string): Promise<void> {
    this.logger.debug(`Capturing Windows screen to: ${filePath}`);
    
    const powershellScript = this.buildPowerShellScript(filePath);
    await this.executePowerShellScript(powershellScript);
  }

  /**
   * Builds the PowerShell script for screen capture
   */
  private buildPowerShellScript(outputPath: string): string {
    // Escape backslashes for PowerShell
    const escapedPath = outputPath.replace(/\\/g, '\\\\');
    
    return `
      Add-Type -AssemblyName System.Windows.Forms,System.Drawing
      $screens = [Windows.Forms.Screen]::AllScreens
      $top = ($screens.Bounds.Top | Measure-Object -Minimum).Minimum
      $left = ($screens.Bounds.Left | Measure-Object -Minimum).Minimum
      $right = ($screens.Bounds.Right | Measure-Object -Maximum).Maximum
      $bottom = ($screens.Bounds.Bottom | Measure-Object -Maximum).Maximum
      $width = $right - $left
      $height = $bottom - $top
      $bounds = [Drawing.Rectangle]::FromLTRB($left, $top, $right, $bottom)
      $bitmap = New-Object Drawing.Bitmap $width, $height
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
      $bitmap.Save("${escapedPath}")
      $graphics.Dispose()
      $bitmap.Dispose()
    `.trim();
  }

  /**
   * Executes the PowerShell script with proper error handling
   */
  private async executePowerShellScript(script: string): Promise<void> {
    const timeout = 10000; // 10 seconds
    
    try {
      await this.runPowerShellCommand(script, timeout);
      this.logger.debug('PowerShell screenshot command completed successfully');
    } catch (error) {
      throw new ScreenCaptureError(
        `Failed to execute Windows screenshot command`,
        error as Error
      );
    }
  }

  /**
   * Runs a PowerShell command with the given script
   */
  private async runPowerShellCommand(script: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script
      ];
      
      this.logger.debug('Executing PowerShell command for screenshot');
      
      const process = spawn('powershell.exe', args, { 
        stdio: 'pipe',
        windowsHide: true 
      });
      
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
          reject(new Error(`PowerShell command failed with exit code ${code}: ${stderrData}`));
          return;
        }
        
        resolve();
      });

      // Handle process errors
      process.on('error', (error) => {
        if (timedOut) return;
        reject(error);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        reject(new Error(`PowerShell command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Clear timeout on completion
      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Reads the captured screenshot file into a buffer
   */
  private async readCaptureFile(filePath: string): Promise<Buffer> {
    const buffer = await fs.readFile(filePath);
    
    if (!buffer || buffer.length === 0) {
      throw new ScreenCaptureError('Windows screen capture produced empty file');
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
    this.logger.debug(`Windows native screen capture successful: ${bufferSize} bytes`);
  }

  /**
   * Handles and logs capture errors appropriately
   */
  private handleCaptureError(error: unknown): never {
    if (error instanceof ScreenCaptureError) {
      throw error;
    }
    
    const captureError = new ScreenCaptureError(
      'Windows native screen capture failed', 
      error as Error
    );
    
    this.errorHandler.logAndThrow(captureError, {
      operation: 'WindowsNativeCaptureService.captureScreen'
    });
  }

  /**
   * Ensures the service is running on Windows
   */
  private ensurePlatformSupported(): void {
    if (!this.isSupported()) {
      throw new ScreenCaptureError(
        `WindowsNativeCaptureService can only be used on Windows. Current platform: ${process.platform}`
      );
    }
  }

  /**
   * Checks if this service is supported on the current platform
   */
  public isSupported(): boolean {
    return process.platform === 'win32';
  }

  /**
   * Gets the platform name for this service
   */
  public getPlatformName(): string {
    return this.platformName;
  }
}