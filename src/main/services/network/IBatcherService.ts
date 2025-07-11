export interface IBatcherService {
  add(text: string): void;
  flushIfNeeded(): Promise<void>;
}
