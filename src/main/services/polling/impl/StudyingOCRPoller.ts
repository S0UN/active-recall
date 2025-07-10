import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ConfigService } from '../../../configs/ConfigService';

export class StudyingOCRPoller implements IPoller {
  constructor(
    private readonly polling: IPollingSystem,
    private readonly config: ConfigService,
    private readonly onTick: () => void
  ) {}
  
  @LogExecution()
  start(): void {
    this.polling.register('StudyingOCRPoller', this.config.studyingOcrIntervalMs, this.onTick);
  }

  @LogExecution()
  stop(): void {
    this.polling.unregister('StudyingOCRPoller');
  }
}
