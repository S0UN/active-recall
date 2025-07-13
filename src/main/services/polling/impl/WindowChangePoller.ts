// src/polling/impl/WindowChangePoller.ts
import { injectable, inject } from "tsyringe";
import activeWindow from "active-win";
import { BasePoller } from "./basePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { LogExecution } from "../../../utils/LogExecution";

@injectable()
export class WindowChangePoller extends BasePoller {
  private currentWindow: string | null = null;

  constructor(
    @inject("PollingSystem") polling: IPollingSystem,
    @inject(ConfigService) configInterval: ConfigService,
    @inject("OnWindowChange") onChange: (old: string | null, next: string) => void
  ) {
    // name: "WindowChange"
    // interval: configInterval.windowChangeIntervalMs
    // onTick: delegate to our instance method
    super(polling, configInterval.windowChangeIntervalMs, "WindowChange", () =>
      this.poll()
    );
    this.onChange = onChange;
  }

  private onChange: (old: string | null, next: string) => void;

  @LogExecution()
  private async poll(): Promise<void> {
    const title = (await activeWindow())?.title;
    if (!title) return;
    if (title !== this.currentWindow) {
      const old = this.currentWindow;
      this.currentWindow = title;
      this.onChange(old, title);
    }
  }
}
