export interface IOrchestratorState {
  onEnter(): void;
  onWindowChange(key: string): void;
  onOcrTick(): void;
  onExit(): void;
}