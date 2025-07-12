import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';

export class StudyingState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startStudyingOcrPolling();
  }
  onWindowChange(oldKey: string, newKey: string) {
    this.orchestrator.onCommonWindowChange(oldKey, newKey);
  }
  onTick() {
    this.orchestrator.runFullPipeline(this.orchestrator.currentWindow!);
  }
  onExit() {
    this.orchestrator.stopStudyingOcrPolling();
  }
}