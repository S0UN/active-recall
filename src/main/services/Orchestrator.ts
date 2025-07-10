import { injectable, inject } from 'tsyringe';
import { IOrchestratorState } from './orchestrator/IOrchestratorState';
import { IdleState } from './orchestrator/impl/IdleState';
import { WindowChangePoller } from './polling/impl/WindowChangePoller';
import { StudyingOCRPoller } from './polling/impl/StudyingOCRPoller';
import { IdleRevalidationPoller } from './polling/impl/IdleRevalidationPoller';
import { IScreenCaptureService } from './capture/IScreenCaptureService';
import { IOcrService } from './analysis/IOcrService';
import { IClassificationService } from './analysis/IClassificationService';
import { IBatcherService } from './network/IBatcherService';

@injectable()
export class Orchestrator {
  private cache = new Map<string, { mode: string, lastClassified: number }>();
  private state: IOrchestratorState;
  public currentKey: string|null = null;
  private readonly windowPoller: WindowChangePoller;
  private readonly studyingOcrPoller: StudyingOCRPoller;
  private readonly idleRevalPoller: IdleRevalidationPoller;

  constructor(
    @inject('WindowChangePollerFactory') 
    private readonly createWindowPoller: (callback: (key: string) => void) => WindowChangePoller,
    @inject('StudyingOCRPollerFactory')
    private readonly createStudyingOcrPoller: (callback: () => void) => StudyingOCRPoller,
    @inject('IdleRevalidationPollerFactory')
    private readonly createIdleRevalPoller: (callback: () => void) => IdleRevalidationPoller,
    @inject('ScreenCaptureService') private readonly capture: IScreenCaptureService,
    @inject('OcrService') private readonly ocr: IOcrService,
    @inject('ClassificationService') private readonly classifier: IClassificationService,
    @inject('BatcherService') private readonly batcher: IBatcherService
  ) {
    this.state = new IdleState(this);
    
    // Create pollers with their callbacks
    this.windowPoller = this.createWindowPoller((key: string) => {
      this.currentKey = key;
      this.transitionStateIfNeeded(key);
    });
    
    this.studyingOcrPoller = this.createStudyingOcrPoller(() => {
      // TODO: Implement OCR tick handling
    });

    this.idleRevalPoller = this.createIdleRevalPoller(() => {
      // TODO: Implement idle revalidation handling
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
