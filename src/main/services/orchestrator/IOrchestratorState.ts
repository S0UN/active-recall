export interface IOrchestratorState {
  onEnter(): void;
  onWindowChange(key: string): void;
  onTick(): void;
  onExit(): void;
}