import { IPollingConfig } from './IPollingConfig';
import { injectable } from 'tsyringe';

@injectable()
export class ConfigService implements IPollingConfig {
  public windowChangeIntervalMs = process.env.WINDOW_POLL_MS ? +process.env.WINDOW_POLL_MS : 1000;
  public studyingOcrIntervalMs = process.env.STUDYING_OCR_POLL_MS ? +process.env.STUDYING_OCR_POLL_MS : 30_000;
  public idleRevalidationThresholdMs = process.env.IDLE_REVALIDATION_THRESHOLD_MS ? +process.env.IDLE_REVALIDATION_THRESHOLD_MS : 15 * 60_000;

}
