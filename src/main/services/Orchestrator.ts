import { injectable } from 'tsyringe';
import { IOrchestratorState } from './orchestrator/IOrchestratorState';
import { IdleState } from './orchestrator/impl/IdleState';
import { StudyingState } from './orchestrator/impl/StudyingState';
import { WindowChangePoller } from './polling/impl/WindowChangePoller';
import { StudyingOCRPoller } from './polling/impl/StudyingOCRPoller';
import { IdleRevalidationPoller } from './polling/impl/IdleRevalidationPoller';
import { IScreenCaptureService } from './capture/IScreenCaptureService';
import { IOcrService } from './analysis/IOcrService';
import { IClassificationService } from './analysis/IClassificationService';
import { IBatcherService } from './network/IBatcherService';
import container from '../container'; // Assuming container is needed for resolving PollingSystem

@injectable()
export class Orchestrator {
  private cache = new Map<string, { mode: string, lastClassified: number }>();
  private state: IOrchestratorState;
  public currentKey: string|null = null;

  constructor(
    private windowPoller: WindowChangePoller,
    private studyingOcrPoller: StudyingOCRPoller,
    private idleRevalPoller: IdleRevalidationPoller,
    private capture: IScreenCaptureService,
    private ocr: IOcrService,
    private classifier: IClassificationService,
    private batcher: IBatcherService
  ) {
    this.state = new IdleState(this);
    // Placeholder for constructor implementation
    this.windowPoller = new WindowChangePoller(container.resolve('PollingSystem'), key => {
      this.currentKey = key;
      // this.state.onWindowChange(key);
      // this.transitionStateIfNeeded(key);
    });
    this.studyingOcrPoller = new StudyingOCRPoller(container.resolve('PollingSystem'), () => {
      // this.state.onOcrTick();
    });
  }

  start() {
    // Placeholder
  }
  stop() {
    // Placeholder
  }

  private transitionStateIfNeeded(key: string) {
    // Placeholder
  }

  async runFullPipeline(key: string) {
    // Placeholder
  }

  updateLastSeen(key: string) {
    // Placeholder
  }
}
