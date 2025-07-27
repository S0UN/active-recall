import { injectable, inject } from "tsyringe";
import { BasePoller } from "./BasePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { IPoller } from "../IPoller";

@injectable()
export class StudyingOCRPoller extends BasePoller implements IPoller {
  private onTickCallback: () => void = () => {};

  constructor(
    @inject("PollingSystem")   polling: IPollingSystem,
    @inject(ConfigService)      configInterval: ConfigService
  ) {
    super(
      polling,
      configInterval.studyingOcrIntervalMs,
      "StudyingOCR",
      () => this.onTickCallback()
    );
  }

  public setOnTick(cb: () => void): void {
    this.onTickCallback = cb;
  }
}
