// src/polling/impl/StudyingOCRPoller.ts
import { injectable, inject } from "tsyringe";
import { BasePoller } from "./basePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";

@injectable()
export class StudyingOCRPoller extends BasePoller {
  constructor(
    @inject("PollingSystem") polling: IPollingSystem,
    @inject(ConfigService) configInterval: ConfigService,
    @inject("OnOcrTick") onTick: () => void
  ) {

    super(polling, configInterval.studyingOcrIntervalMs, "StudyingOCR", onTick);
  }
}
