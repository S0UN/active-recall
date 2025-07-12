import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { WindowCache } from '../../../utils/WindowCache';
import activeWindow from 'active-win';
import { ConfigService } from '../../../configs/ConfigService';

export class IdleRevalidationPoller implements IPoller {
  constructor(
    private readonly polling: IPollingSystem,
    private readonly configInterval: ConfigService,
    private readonly onTick: () => void
  ) {}


  @LogExecution()
  start(): void {
    this.polling.register('IdleRevalidationPoller', this.configInterval.idleRevalidationIntervalMs, this.onTick.bind(this));
  }
  @LogExecution()
  stop(): void {
    this.polling.unregister('IdleRevalidationPoller');
  }
}
