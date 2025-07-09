import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';

export class IdleState implements IOrchestratorState {
  constructor(private ctx: Orchestrator) {}
  onEnter() {
    // Placeholder
  }
  onWindowChange(key: string) {
    // Placeholder
  }
  onOcrTick() { /* noop in Idle */ }
  onExit() {
    // Placeholder
  }
}