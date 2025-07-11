import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';

export class StudyingState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startStudyingOcrPolling();
  }
  onWindowChange(key: string) {
    this.orchestrator.updateLastSeen(key);
  }
  onTick() {
    this.orchestrator.runFullPipeline(this.orchestrator.currentKey!);
  }
  onExit() {
    this.orchestrator.stopStudyingOcrPolling();
  }
}