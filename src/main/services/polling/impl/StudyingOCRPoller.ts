// src/services/polling/impl/StudyingOCRPoller.ts
import { injectable, inject } from "tsyringe";
import { BasePoller } from "./BasePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { IPoller } from "../IPoller";

@injectable()
export class StudyingOCRPoller extends BasePoller implements IPoller {
  // 1) default no-op callback  
  private onTickCallback: () => void = () => {};

  constructor(
    @inject("PollingSystem")   polling: IPollingSystem,
    @inject(ConfigService)      configInterval: ConfigService
  ) {
    // 2) pass a closure that will invoke our onTickCallback field
    super(
      polling,
      configInterval.studyingOcrIntervalMs,
      "StudyingOCR",
      () => this.onTickCallback()
    );
  }

  /** 3) setter to wire in the real callback later */
  public setOnTick(cb: () => void): void {
    this.onTickCallback = cb;
  }
}
