// src/polling/impl/WindowChangePoller.ts
import { injectable, inject } from "tsyringe";
import activeWindow from "active-win";
import { IPollingSystem } from "../IPollingSystem";
import { PollingConfigService } from "../../../configs/PollingConfigService";
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
    @inject("PollingConfig") configInterval: PollingConfigService
  ) {
    super(polling, configInterval.windowChangeIntervalMs, "WindowChange", () =>
      this.poll()
    );
  }

  public setOnChange(cb: (old: string, next: string) => void): void {
    this.onChange = cb;
  }

  private async poll(): Promise<void> {
    try {
      const window = await this.detectActiveWindow();
      
      if (!window) {
        Logger.warn('No active window detected');
        return;
      }

      const windowIdentifier = this.createWindowIdentifier(window);
      this.handleWindowChange(windowIdentifier);
    } catch (error) {
      throw new WindowDetectionError('Failed to detect active window', error as Error);
    }
  }

  private async detectActiveWindow(): Promise<any> {
    return await activeWindow();
  }

  private createWindowIdentifier(window: any): string {
    if (this.hasValidTitle(window)) {
      return window.title;
    }
    
    return this.createFallbackIdentifier(window);
  }

  private hasValidTitle(window: any): boolean {
    return window.title && window.title.trim() !== '';
  }

  private createFallbackIdentifier(window: any): string {
    if (this.hasUrlInformation(window)) {
      return this.createUrlBasedIdentifier(window);
    }
    
    return this.createBrowserSpecificIdentifier(window);
  }

  private hasUrlInformation(window: any): boolean {
    return 'url' in window && typeof window.url === 'string' && window.url;
  }

  private createUrlBasedIdentifier(window: any): string {
    try {
      const url = new URL(window.url);
      
      if (url.protocol === 'favorites:') {
        return `${window.owner.name} - Favorites`;
      }
      
      if (url.hostname) {
        return `${window.owner.name} - ${url.hostname}`;
      }
      
      return `${window.owner.name} - ${window.url}`;
    } catch (urlError) {
      return `${window.owner.name} - ${window.url}`;
    }
  }

  private createBrowserSpecificIdentifier(window: any): string {
    const appName = window.owner.name;
    
    if (this.isChromeApplication(appName)) {
      return 'Chrome - Active Tab';
    }
    
    if (this.isSafariApplication(appName)) {
      return 'Safari - Active Tab';
    }
    
    if (this.isFirefoxApplication(appName)) {
      return 'Firefox - Active Tab';
    }
    
    if (this.isEdgeApplication(appName)) {
      return 'Edge - Active Tab';
    }
    
    return `${appName} - No Title`;
  }

  private isChromeApplication(appName: string): boolean {
    return appName === 'Google Chrome' || appName === 'chrome.exe';
  }

  private isSafariApplication(appName: string): boolean {
    return appName === 'Safari';
  }

  private isFirefoxApplication(appName: string): boolean {
    return appName.toLowerCase().includes('firefox');
  }

  private isEdgeApplication(appName: string): boolean {
    return appName.toLowerCase().includes('edge');
  }

  private handleWindowChange(windowIdentifier: string): void {
    
    if (this.isWindowChange(windowIdentifier)) {
      this.notifyWindowChange(windowIdentifier);
    }
  }

  private isWindowChange(newIdentifier: string): boolean {
    return newIdentifier !== this.currentWindow;
  }

  private notifyWindowChange(newIdentifier: string): void {
    const previousWindow = this.currentWindow;
    this.currentWindow = newIdentifier;
    this.onChange(previousWindow, newIdentifier);
  }
}