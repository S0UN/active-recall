import { inject, injectable } from 'tsyringe';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ILogger } from '../../../utils/ILogger';
@injectable()
export class PollingSystem implements IPollingSystem {
  private readonly pollers = new Map<string, any>();

  constructor(
    @inject("LoggerService")
    private readonly logger: ILogger
  ) {
    // No constructor parameters needed
  }


  /*
WRONG FOFR SOME REASON
  @LogExecution()
  register(name: string, interval: number, callback: () => void): void {
    if (this.pollers.has(name)) {
      return;
    }
    const poller = setInterval(callback, interval);
    this.pollers.set(name, poller);
  }
*/

//@LogExecution()
register(
  name: string,
  interval: number,
  callback: () => void | Promise<void>
): void {
  if (this.pollers.has(name)) {
    return;
  }
  const timer = setInterval(() => {
    // Wrap in Promise.resolve so we catch both sync & async errors:
    Promise
      .resolve()              // start a new microtask
      .then(() => callback()) // call your callback (may return Promise)
      .catch(err => {
        this.logger.error(`[${name}] poll error:`, err as Error);
      });
  }, interval);
  this.pollers.set(name, timer);
}

  unregister(name: string): void {
    if (this.pollers.has(name)) {
      clearInterval(this.pollers.get(name));
      this.pollers.delete(name);
    }
  }
}

