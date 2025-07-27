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

      // Find the matching source by display name (may vary by platform)
      const primarySource = sources.find(
        (source) =>
          source.name.includes("Screen 1") ||
          source.name.includes(primaryDisplay.id.toString())
      );

      if (!primarySource) {
        throw new ScreenCaptureError("Primary display source not found");
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
