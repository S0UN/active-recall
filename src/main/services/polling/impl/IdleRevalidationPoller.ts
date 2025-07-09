import { injectable } from 'tsyringe';
import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';

@injectable()
export class IdleRevalidationPoller implements IPoller {
  constructor(private readonly polling: IPollingSystem, private readonly onTick: () => void) {
    this.polling.register('IdleRevalidationPoller', 1000, this.onTick);
  }
  @LogExecution()
  start(): void {
    this.polling.register('IdleRevalidationPoller', 1000, this.onTick);
  }
  @LogExecution()
  stop(): void {
    this.polling.unregister('IdleRevalidationPoller');
  }
}
