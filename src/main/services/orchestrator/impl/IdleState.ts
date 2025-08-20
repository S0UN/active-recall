import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';
export class IdleState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startWindowPolling();
    this.orchestrator.startIdleRevalidationPolling();
    try {
      this.orchestrator.notifyBatcherIdleStarted();
    } catch (error) {
      this.orchestrator.logger.warn('Failed to notify batcher of idle state', error as Error);
    }
  }
  onWindowChange(oldWindow: string, newWindow: string) {
    this.orchestrator.handleWindowChange(oldWindow, newWindow);
  }

  onTick() { 
    //this.orchestrator.performIdleRevalidation();
   }
  onExit() {
     this.orchestrator.stopIdleRevalidationPolling();
  }
}