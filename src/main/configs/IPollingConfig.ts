export interface IPollingConfig {
  windowChangeIntervalMs: number;
  studyingOcrIntervalMs: number;
  idleRevalidationThresholdMs: number;
  idleRevalidationIntervalMs: number;
  windowCacheTTL: number;
  newWindowPipelineDelayMs: number;
}
