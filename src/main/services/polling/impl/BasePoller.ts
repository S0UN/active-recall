import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import Logger from 'electron-log';

export class BasePoller implements IPoller {
  constructor(
    private readonly polling: IPollingSystem,
    private readonly configInterval: number,
    private readonly name: string,
    private readonly onTick: () => void
  ) {}


  start(): void {
    Logger.info(`Starting ${this.name} with interval ${this.configInterval}ms`);
    this.polling.register(this.name, this.configInterval, this.onTick.bind(this));
  }
  stop(): void {
    this.polling.unregister(this.name);
  }
}
