import { IOrchestratorState } from '../IOrchestratorState';
import { Orchestrator } from '../../Orchestrator';
import { ILogger } from '../../../utils/ILogger';
import { inject } from 'tsyringe';
export class IdleState implements IOrchestratorState {
  constructor(private readonly orchestrator: Orchestrator) {}
  onEnter() {
    this.orchestrator.startWindowPolling();
    this.orchestrator.logger.info('Entered Idle State');
  }
  onWindowChange(key: string) {
    this.orchestrator.logger.info(`Window changed to: ${key}`);
  }
  onOcrTick() { /* noop in Idle */
    this.orchestrator.logger.error('should never be called in Idle state');
   }
  onExit() {
    this.orchestrator.stopWindowPolling();
  }
}