import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';
import { ILogger } from '../../../utils/ILogger';
import { inject } from 'tsyringe';
export class IdleState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startWindowPolling();
    this.orchestrator.startIdleRevalidationPolling();
    this.orchestrator.logger.info('Entered Idle State');
  }
  onWindowChange(key: string) {
    this.orchestrator.updateLastSeen(key);
  }

  onTick() { 
    const state = this.orchestrator.getWindowCache().get(this.orchestrator.currentKey!);
    if (!state || Date.now() - state.lastClassified > 15 * 60_000) {
      this.orchestrator.runFullPipeline(this.orchestrator.currentKey!);
    } else {
      this.orchestrator.logger.info(`Window ${this.orchestrator.currentKey} is still active, no reclassification needed.`);
    }
   
   }
  onExit() {
    this.orchestrator.stopWindowPolling();
  }
}