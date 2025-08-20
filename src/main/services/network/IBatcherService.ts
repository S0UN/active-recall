export type BatchEntry = {
  text: string;
}

export type Batch = {
  window: string;
  topic: string;
  entries: BatchEntry[];
}

export interface IBatcherService {
  add(windowTitle: string, topicLabel: string, text: string): void;
  flushIfNeeded(): Promise<void>;
  getBatches(): Batch[];
  getBatchesAsJson(): string;
  clearBatches(): void;
  
  // Idle flush functionality
  notifyStudyingStarted(): void;
  notifyIdleStarted(): void;
  
  // State inspection (for testing and debugging)
  getIsInStudyingMode(): boolean;
}
