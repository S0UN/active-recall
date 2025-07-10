import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ConfigService } from '../../../configs/ConfigService';
//make a microservice thats a cache
//make a microservice the polls for a window change
//make a microservice that polls for a window change and then calls a callback with the key

export class WindowChangePoller {
  constructor(
    private readonly polling: IPollingSystem,
    private readonly config: ConfigService,
    private readonly onChange: (key: string) => void
  ) {}

  @LogExecution()
  start(): void {
    this.polling.register('WindowChangePoller', 1000, () => {
      // TODO: Implement actual window detection logic
      // For now, just call with a placeholder
      this.onChange('placeholder-window-key');
    });
  }
  @LogExecution()
  stop(): void {
    this.polling.unregister('WindowChangePoller');
  }
}
