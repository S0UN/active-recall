import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';

export class StudyingState implements IOrchestratorState {
  constructor(private ctx: Orchestrator) {}
  onEnter() {
    // Placeholder
  }
  onWindowChange(key: string) {
    // Placeholder
  }
  onOcrTick() {
    // Placeholder
  }
  onExit() {
    // Placeholder
  }
}