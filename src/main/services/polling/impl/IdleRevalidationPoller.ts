// src/services/polling/impl/IdleRevalidationPoller.ts
import { injectable, inject } from "tsyringe";
import { BasePoller } from "./BasePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { IPoller } from "../IPoller";

@injectable()
export class IdleRevalidationPoller extends BasePoller implements IPoller {
  // default no-op
  private onTickCallback: () => void = () => {};

  constructor(
    @inject("PollingSystem")   polling: IPollingSystem,
    @inject("PollingConfig")    config: ConfigService
  ) {
    super(
      polling,
      config.idleRevalidationIntervalMs,
      "IdleRevalidation",
      () => this.onTickCallback()
    );
  }

  /** Wire in the real callback before you call start() */
  public setOnTick(cb: () => void): void {
    this.onTickCallback = cb;
  }
}
