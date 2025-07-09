import { injectable } from 'tsyringe';
import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';

//make a microservice thats a cache
//make a microservice the polls for a window change
//make a microservice that polls for a window change and then calls a callback with the key

@injectable()
export class WindowChangePoller {
  constructor(private polling: IPollingSystem, private onChange: (key:string)=>void) {
    // Placeholder
  }
  @LogExecution()
  start(): void {
    this.polling.register('WindowChangePoller', 1000, () => {
   
    });
  }
  @LogExecution()
  stop(): void {
    this.polling.unregister('WindowChangePoller');
  }
}
