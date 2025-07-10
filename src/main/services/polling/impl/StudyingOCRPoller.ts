import { IPoller } from '../IPoller';
import { IPollingSystem } from '../IPollingSystem';
import { LogExecution } from '../../../utils/LogExecution';
import { ConfigService } from '../../../configs/ConfigService';

export class StudyingOCRPoller implements IPoller {
  constructor(
    private readonly pollyingSystem: IPollingSystem,
    private readonly configInterval: ConfigService,
    private readonly onTick: () => void
  ) {}
  
  @LogExecution()
  start(): void {
    this.pollyingSystem.register('StudyingOCRPoller', this.configInterval.studyingOcrIntervalMs, this.onTick);
  }

  @LogExecution()
  stop(): void {
    this.pollyingSystem.unregister('StudyingOCRPoller');
  }
}
