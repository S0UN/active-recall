import { injectable } from "tsyringe";
import { desktopCapturer, screen } from "electron";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import Logger from 'electron-log';

@injectable()
export class ElectronCaptureService implements IScreenCaptureService {

  public async captureScreen(): Promise<Buffer> {
    try {
      const primaryDisplay = this.getPrimaryDisplay();
      const sources = await this.getScreenSources(primaryDisplay);
      const primarySource = this.findPrimarySource(sources, primaryDisplay);
      return this.generateScreenBuffer(primarySource);
    } catch (error) {
      if (error instanceof ScreenCaptureError) {
        throw error;
      }
      throw new ScreenCaptureError('Failed to capture screen', error as Error);
    }
  }

  private getPrimaryDisplay() {
    const primaryDisplay = screen.getPrimaryDisplay();
    
    if (!primaryDisplay) {
      throw new ScreenCaptureError('No primary display found');
    }
    
    return primaryDisplay;
  }

  private async getScreenSources(primaryDisplay: any) {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height,
      },
    });

    if (!sources || sources.length === 0) {
      throw new ScreenCaptureError('No screen sources available');
    }

    // this.logSourceInformation(sources, primaryDisplay);
    return sources;
  }
/*
  private logSourceInformation(sources: any[], primaryDisplay: any): void {
    Logger.debug('Available screen sources:', sources.map(s => ({ 
      id: s.id, 
      name: s.name, 
      display_id: s.display_id 
    })));
    Logger.debug('Primary display ID:', primaryDisplay.id);
  }
    */

  private findPrimarySource(sources: any[], primaryDisplay: any) {
    let primarySource = this.findExactDisplayMatch(sources, primaryDisplay);
    
    if (!primarySource && sources.length > 0) {
      primarySource = this.useFirstAvailableSource(sources);
    }

    if (!primarySource) {
      this.throwPrimarySourceNotFoundError(sources);
    }

    return primarySource;
  }

  private findExactDisplayMatch(sources: any[], primaryDisplay: any) {
    return sources.find(
      (source) =>
        source.name.includes("Screen 1") ||
        source.name.includes(primaryDisplay.id.toString()) ||
        source.name.toLowerCase().includes("entire screen") ||
        source.name.toLowerCase().includes("screen") ||
        (source as any).display_id === primaryDisplay.id.toString()
    );
  }

  private useFirstAvailableSource(sources: any[]) {
    Logger.debug('No exact match found, using first available screen source');
    return sources[0];
  }

  private throwPrimarySourceNotFoundError(sources: any[]): never {
    const availableNames = sources.map(s => s.name).join(', ');
    throw new ScreenCaptureError(`Primary display source not found. Available sources: ${availableNames}`);
  }

  private generateScreenBuffer(primarySource: any): Buffer {
    const buffer = primarySource.thumbnail.toPNG();
    
    if (!buffer || buffer.length === 0) {
      throw new ScreenCaptureError('Screen capture produced empty buffer');
    }
    
    return buffer;
  }
}
