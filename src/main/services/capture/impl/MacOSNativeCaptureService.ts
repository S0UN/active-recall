import { injectable, inject } from "tsyringe";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import { ILogger } from '../../../utils/ILogger';
import { ErrorHandler } from '../../../utils/ErrorHandler';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

@injectable()
export class MacOSNativeCaptureService implements IScreenCaptureService {
  private readonly errorHandler: ErrorHandler;

  constructor(
    @inject('LoggerService') private readonly logger: ILogger
  ) {
    this.errorHandler = new ErrorHandler(logger);
  }

  public async captureScreen(): Promise<Buffer> {
    try {
      const tempFilePath = await this.createTempFilePath();
      await this.captureToFile(tempFilePath);
      const buffer = await this.readCapturedFile(tempFilePath);
      await this.cleanupTempFile(tempFilePath);
      
      this.logger.debug(`Native screen capture successful: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      // Already a ScreenCaptureError - rethrow with additional context
      if (error instanceof ScreenCaptureError) {
        throw error;
      }
      
      // Wrap unexpected errors
      const captureError = new ScreenCaptureError(
        'Native macOS screen capture failed', 
        error as Error
      );
      
      this.errorHandler.logAndThrow(captureError, {
        operation: 'MacOSNativeCaptureService.captureScreen'
      });
    }
  }

  private async createTempFilePath(): Promise<string> {
    return join(tmpdir(), `screenshot-${Date.now()}.png`);
  }

  private async captureToFile(filePath: string): Promise<void> {
    this.logger.debug(`Capturing screen to: ${filePath}`);
    await this.executeScreencapture(filePath);
  }

  private async readCapturedFile(filePath: string): Promise<Buffer> {
    const buffer = await fs.readFile(filePath);
    
    if (!buffer || buffer.length === 0) {
      throw new ScreenCaptureError('Native screen capture produced empty file');
    }
    
    return buffer;
  }

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

  private async executeScreencapture(filePath: string): Promise<void> {
    const command = this.buildScreencaptureCommand(filePath);
    const timeout = 10000; // 10 seconds
    
    try {
      await this.runCommand(command.cmd, command.args, timeout);
      this.logger.debug('screencapture command completed successfully');
    } catch (error) {
      // Re-throw as ScreenCaptureError with context
      throw new ScreenCaptureError(
        `Failed to execute screencapture command`,
        error as Error
      );
    }
  }

  private buildScreencaptureCommand(filePath: string): { cmd: string; args: string[] } {
    return {
      cmd: 'screencapture',
      args: [
        '-x',        // Do not play sounds
        '-t', 'png', // Save as PNG format
        '-T', '0',   // Take screenshot immediately (no delay)
        filePath
      ]
    };
  }

  private async runCommand(cmd: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Executing command: ${cmd} ${args.join(' ')}`);
      
      const process = spawn(cmd, args, { stdio: 'pipe' });
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
          reject(new Error(`Command failed with exit code ${code}: ${stderrData}`));
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
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Clear timeout on completion
      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }
}