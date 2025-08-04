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
}
