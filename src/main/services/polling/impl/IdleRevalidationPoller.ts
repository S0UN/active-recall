import { IPoller } from "../IPoller";
import { IPollingSystem } from "../IPollingSystem";
import { LogExecution } from "../../../utils/LogExecution";
import { ConfigService } from "../../../configs/ConfigService";
import { BasePoller } from "./basePoller";
import inject from 'tsyringe/dist/typings/decorators/inject';

export class IdleRevalidationPoller extends BasePoller implements IPoller {
  constructor(
    @inject("PollingSystem") polling: IPollingSystem,
    @inject("ConfigService") configInterval: ConfigService,
    onTick: () => void,
  ) {
    super(polling, configInterval.idleRevalidationIntervalMs, "IdleRevalidationPoller", onTick);
  }
}
