export interface IOrchestratorState {
  onEnter(): void;
  onWindowChange(oldKey: string, newKey: string): void;
  onTick(): void;
  onExit(): void;
}