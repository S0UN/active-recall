// src/polling/impl/WindowChangePoller.ts
import { injectable, inject } from "tsyringe";
import activeWindow from "active-win";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { BasePoller } from "./BasePoller";
import { IPoller } from "../IPoller";
import Logger from "electron-log";
import { WindowDetectionError } from "../../../errors/CustomErrors";

@injectable()
export class WindowChangePoller extends BasePoller implements IPoller {
  private currentWindow = "";
  private onChange: (old: string, next: string) => void = () => {};

  constructor(
    @inject("PollingSystem") polling: IPollingSystem,
    @inject("PollingConfig") configInterval: ConfigService
  ) {
    // pass only your polling and interval to the base
    super(polling, configInterval.windowChangeIntervalMs, "WindowChange", () =>
      this.poll()
    );
  }

  /**
   * Call this from your Orchestrator (or WindowManager)
   * to wire up the real callback before you call start().
   */
  public setOnChange(cb: (old: string, next: string) => void): void {
    this.onChange = cb;
  }

  private async poll(): Promise<void> {
  try {
    const window = await activeWindow();
    
    if (!window) {
      Logger.warn('No active window detected');
      return;
    }

    let windowIdentifier: string;
    
    // Handle browsers with empty titles
    if (!window.title || window.title.trim() === '') {
      // Check if URL is available (macOS only)
      if ('url' in window && typeof window.url === 'string' && window.url) {
        // macOS: Use URL for better browser identification
        try {
          const url = new URL(window.url);
          
          if (url.protocol === 'favorites:') {
            windowIdentifier = `${window.owner.name} - Favorites`;
          } else if (url.hostname) {
            windowIdentifier = `${window.owner.name} - ${url.hostname}`;
          } else {
            windowIdentifier = `${window.owner.name} - ${window.url}`;
          }
        } catch (urlError) {
          windowIdentifier = `${window.owner.name} - ${window.url}`;
        }
      } else {
        // Windows/Linux: Use app name + process info for better identification
        if (window.owner.name === 'Google Chrome' || window.owner.name === 'chrome.exe') {
          windowIdentifier = `Chrome - Active Tab`;
        } else if (window.owner.name === 'Safari') {
          windowIdentifier = `Safari - Active Tab`;
        } else if (window.owner.name.toLowerCase().includes('firefox')) {
          windowIdentifier = `Firefox - Active Tab`;
        } else if (window.owner.name.toLowerCase().includes('edge')) {
          windowIdentifier = `Edge - Active Tab`;
        } else {
          windowIdentifier = `${window.owner.name} - No Title`;
        }
      }
    } else {
      windowIdentifier = window.title;
    }
    
    Logger.info(`Current active window: ${this.currentWindow}, New window: ${windowIdentifier}`);
    
    if (windowIdentifier !== this.currentWindow) {
      const old = this.currentWindow;
      this.currentWindow = windowIdentifier;
      this.onChange(old, windowIdentifier);
    }
  } catch (error) {
    throw new WindowDetectionError('Failed to detect active window', error as Error);
  }
}
}