import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ConfigService } from '../../../configs/ConfigService';

export class BasePoller implements IPoller {
  constructor(
    private readonly polling: IPollingSystem,
    private readonly configInterval: number,
    private readonly name: string,
    private readonly onTick: () => void
  ) {}


  @LogExecution()
  start(): void {
    this.polling.register(this.name, this.configInterval, this.onTick.bind(this));
  }
  @LogExecution()
  stop(): void {
    this.polling.unregister(this.name);
  }
}
