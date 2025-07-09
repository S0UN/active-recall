import { injectable } from "tsyringe";
import { desktopCapturer, screen } from "electron";
import { IScreenCaptureService } from "../IScreenCaptureService";
import { LogExecution } from '../../../utils/LogExecution';

@injectable()
export class ElectronCaptureService implements IScreenCaptureService {

  @LogExecution()
  public async captureScreen(): Promise<Buffer> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: screen.getPrimaryDisplay().size.width,
        height: screen.getPrimaryDisplay().size.height,
      },
    });

    const primaryDisplay = screen.getPrimaryDisplay();

    // Find the matching source by display name (may vary by platform)
    const primarySource = sources.find(
      (source) =>
        source.name.includes("Screen 1") ||
        source.name.includes(primaryDisplay.id.toString())
    );

    if (!primarySource) {
      throw new Error("Primary display source not found");
    }

    return primarySource.thumbnail.toPNG();
  }
}
