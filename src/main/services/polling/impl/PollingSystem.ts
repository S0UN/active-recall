import { injectable } from 'tsyringe';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';

@injectable()
export class PollingSystem implements IPollingSystem {
  private readonly pollers = new Map<string, any>();

  constructor() {
    // No constructor parameters needed
  }

  @LogExecution()
  register(name: string, interval: number, callback: () => void): void {
    if (this.pollers.has(name)) {
      return;
    }
    const poller = setInterval(callback, interval);
    this.pollers.set(name, poller);
  }

  @LogExecution()
  unregister(name: string): void {
    if (this.pollers.has(name)) {
      clearInterval(this.pollers.get(name));
      this.pollers.delete(name);
    }
  }
}

