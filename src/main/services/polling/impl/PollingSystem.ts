import { inject, injectable } from 'tsyringe';
import { IPollingSystem } from '../IPollingSystem';
import { ILogger } from '../../../utils/ILogger';
@injectable()
export class PollingSystem implements IPollingSystem {
  private readonly pollers = new Map<string, any>();

  constructor(
    @inject("LoggerService")
    private readonly logger: ILogger
  ) {
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

register(
  name: string,
  interval: number,
  callback: () => void | Promise<void>
): void {
  if (this.pollers.has(name)) {
    return;
  }
  const timer = setInterval(() => {
    Promise
      .resolve()           
      .then(() => callback()) 
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

