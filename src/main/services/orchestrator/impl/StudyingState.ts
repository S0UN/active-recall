import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';

export class StudyingState implements IOrchestratorState {
  constructor(private orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startStudyingOcrPolling();
  }
  onWindowChange(key: string) {
    // Placeholder
  }
  onOcrTick() {
    this.orchestrator.runFullPipeline(this.orchestrator.currentKey!);
  }
  onExit() {
    this.orchestrator.stopStudyingOcrPolling();
  }
}