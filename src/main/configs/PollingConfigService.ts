import { IPollingConfig } from './IPollingConfig';
import { injectable } from 'tsyringe';

@injectable()
export class PollingConfigService implements IPollingConfig {
	public windowChangeIntervalMs = process.env.WINDOW_POLL_MS ? +process.env.WINDOW_POLL_MS : 1000;
	public studyingOcrIntervalMs = process.env.STUDYING_OCR_POLL_MS ? +process.env.STUDYING_OCR_POLL_MS : 30_000;
	public idleRevalidationThresholdMs = process.env.IDLE_REVALIDATION_THRESHOLD_MS ? +process.env.IDLE_REVALIDATION_THRESHOLD_MS : 15 * 60_000;
	public idleRevalidationIntervalMs = process.env.IDLE_REVALIDATION_INTERVAL_MS ? +process.env.IDLE_REVALIDATION_INTERVAL_MS : 60_000;
	public windowCacheTTL = process.env.WINDOW_CACHE_TTL ? +process.env.WINDOW_CACHE_TTL : 15 * 60_000; // 15 minutes
	public newWindowPipelineDelayMs = process.env.NEW_WINDOW_PIPELINE_DELAY_MS ? +process.env.NEW_WINDOW_PIPELINE_DELAY_MS : 15_000; // 15 seconds

}
