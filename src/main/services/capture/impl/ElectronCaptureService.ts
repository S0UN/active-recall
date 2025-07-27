import { injectable } from "tsyringe";
import { desktopCapturer, screen } from "electron";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { ScreenCaptureError } from '../../../errors/CustomErrors';

@injectable()
export class ElectronCaptureService implements IScreenCaptureService {

  public async captureScreen(): Promise<Buffer> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      
      if (!primaryDisplay) {
        throw new ScreenCaptureError('No primary display found');
      }
      
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

      // Log available sources for debugging
      console.log('Available screen sources:', sources.map(s => ({ 
        id: s.id, 
        name: s.name, 
        display_id: s.display_id 
      })));
      console.log('Primary display ID:', primaryDisplay.id);

      // Find the matching source by display name (may vary by platform)
      let primarySource = sources.find(
        (source) =>
          source.name.includes("Screen 1") ||
          source.name.includes(primaryDisplay.id.toString()) ||
          source.name.toLowerCase().includes("entire screen") ||
          source.name.toLowerCase().includes("screen") ||
          (source as any).display_id === primaryDisplay.id.toString()
      );

      // Fallback: use the first available screen source if no exact match
      if (!primarySource && sources.length > 0) {
        console.log('No exact match found, using first available screen source');
        primarySource = sources[0];
      }

      if (!primarySource) {
        const availableNames = sources.map(s => s.name).join(', ');
        throw new ScreenCaptureError(`Primary display source not found. Available sources: ${availableNames}`);
      }

      const buffer = primarySource.thumbnail.toPNG();
      
      if (!buffer || buffer.length === 0) {
        throw new ScreenCaptureError('Screen capture produced empty buffer');
      }
      
      return buffer;
    } catch (error) {
      if (error instanceof ScreenCaptureError) {
        throw error;
      }
      throw new ScreenCaptureError('Failed to capture screen', error as Error);
    }
  }
}
