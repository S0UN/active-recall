import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';
import { ILogger } from '../../../utils/ILogger';
import { inject } from 'tsyringe';
export class IdleState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.logger.info('Entering Idle State');
    this.orchestrator.startWindowPolling();
    this.orchestrator.startIdleRevalidationPolling();
  }
  onWindowChange(oldWindow: string, newWindow: string) {
    this.orchestrator.onCommonWindowChange(oldWindow, newWindow);
  }

  onTick() { 
    this.orchestrator.IdleRevalidation();
   }
  onExit() {
     this.orchestrator.logger.info('Exiting Idle State');
     this.orchestrator.stopIdleRevalidationPolling();
  }
}