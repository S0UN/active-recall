import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ConfigService } from '../../../configs/ConfigService';
import { ICache } from '../../../utils/ICache';
import activeWindow from 'active-win';
  
export class WindowChangePoller {
  private currentWindow: string | null = null;

  constructor(
    private readonly pollingSystem: IPollingSystem,
    private readonly configInterval: ConfigService,
    private readonly onChange: (oldWindow: string | null, newWindow: string) => void
  ) {}

  @LogExecution()
  async onTick(): Promise<void> {
    const activeWindowTitle = (await activeWindow())?.title;
    console.log('Active window title:', activeWindowTitle);
    if (!activeWindowTitle) {
      console.warn('No active window detected');
      return;
    }

    if (this.currentWindow !== activeWindowTitle) {
      
      this.onChange(this.currentWindow, activeWindowTitle);
      this.currentWindow = activeWindowTitle;
    }
  }

  @LogExecution()
  start(): void {
    this.pollingSystem.register('WindowChangePoller', this.configInterval.windowChangeIntervalMs,
      this.onTick.bind(this));
  }
  @LogExecution()
  stop(): void {
    this.pollingSystem.unregister('WindowChangePoller');
  }
}
