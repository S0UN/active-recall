import { injectable } from 'tsyringe';
import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
@injectable()
export class StudyingOCRPoller implements IPoller {
  constructor(private readonly polling: IPollingSystem, private readonly onTick: () => void) {
  }
  
  @LogExecution()
  start(): void {
    this.polling.register('StudyingOCRPoller', 1000, this.onTick);
  }

  @LogExecution()
  stop(): void {
    this.polling.unregister('StudyingOCRPoller');
  }
}
