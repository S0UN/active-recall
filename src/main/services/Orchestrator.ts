import { injectable, inject } from "tsyringe";
import { IOrchestratorState } from "./orchestrator/IOrchestratorState";
import { IdleState } from "./orchestrator/impl/IdleState";
import { WindowChangePoller } from "./polling/impl/WindowChangePoller";
import { StudyingOCRPoller } from "./polling/impl/StudyingOCRPoller";
import { IdleRevalidationPoller } from "./polling/impl/IdleRevalidationPoller";
import { IScreenCaptureService } from "./capture/IScreenCaptureService";
import { IOcrService } from "./analysis/IOcrService";
import { IClassificationService } from "./analysis/IClassificationService";
import { IBatcherService } from "./network/IBatcherService";
import { VisionService } from "./processing/impl/VisionService";
import { LogExecution } from '../utils/LogExecution';
import { ICache } from '../utils/ICache';
import { WindowCache } from '../utils/WindowCache';
@injectable()
export class Orchestrator {
  private cache: ICache<string, any>;
  private state: IOrchestratorState;
  public currentKey: string | null = null;
  private readonly windowPoller: WindowChangePoller;
  private readonly studyingOcrPoller: StudyingOCRPoller;
  private readonly idleRevalPoller: IdleRevalidationPoller;
  private readonly visionService: VisionService;

  constructor(
    @inject("WindowCache") cache: ICache<string, any>,
    @inject("VisionService") private readonly vision: VisionService,
    @inject("WindowChangePollerFactory")
    private readonly createWindowPoller: (
      callback: (key: string) => void
    ) => WindowChangePoller,
    @inject("StudyingOCRPollerFactory")
    private readonly createStudyingOcrPoller: (
      callback: () => void
    ) => StudyingOCRPoller,
    @inject("IdleRevalidationPollerFactory")
    private readonly createIdleRevalPoller: (
      callback: () => void
    ) => IdleRevalidationPoller,
    @inject("ScreenCaptureService")
    private readonly capture: IScreenCaptureService,
    @inject("OcrService") private readonly ocr: IOcrService,
    @inject("ClassificationService")
    private readonly classifier: IClassificationService,
    @inject("BatcherService") private readonly batcher: IBatcherService,
    @inject("LoggerService") public readonly logger: any
  ) {
    this.cache = cache;
    this.state = new IdleState(this);

    this.visionService = new VisionService(
      this.capture,
      this.ocr,
      this.logger
    );

    // Create pollers with their callbacks
    this.windowPoller = this.createWindowPoller((key: string) => {
      this.currentKey = key;
      this.transitionStateIfNeeded(key);
    });

    this.studyingOcrPoller = this.createStudyingOcrPoller(() => {
      this.state.onOcrTick();
    });

    this.idleRevalPoller = this.createIdleRevalPoller(() => {
      
    });
  }

  start() {
    this.state.onEnter();
  }
  stop() {
    this.state.onExit();
  }

//  need to write logic for checking if something is studying 
// if it is idle and the window changes, and it one shots and says its studying, we need to transition to studying state

  private transitionStateIfNeeded(key: string) {
    this.runFullPipeline
    this.cache.set(key, {
      mode: "idle",
      lastClassified: Date.now(),
    });

    // Placeholder
  }


// need to take in a callback to where if it classifies as not studying, it calls the callback to switch states to idle state. The state should say something like
// if it is in study mode and is idle, it should transition to idle state. The revitialization poller should check if the window is idle and if it is, 
  @LogExecution()
  async runFullPipeline(key: string) {
    this.logger.info(`Running full pipeline for key: ${key}`);
      const text = await this.visionService.captureAndRecognizeText();
      this.logger.info(`Captured text: ${text}`);
      const classified = await this.classifier.classify(text);
      this.logger.info(`Classified text: ${classified}`);
      this.batcher.add(text);   
    // Placeholder
  }

  updateLastSeen(key: string) {
    // Placeholder
  }

  public startWindowPolling(): void {
    this.windowPoller.start();
  }

  public stopWindowPolling(): void {
    this.windowPoller.stop();
  }

  public startStudyingOcrPolling(): void {
    this.studyingOcrPoller.start();
  }
  public stopStudyingOcrPolling(): void {
    this.studyingOcrPoller.stop();
  }
  public startIdleRevalidationPolling(): void {
    this.idleRevalPoller.start();
  }
}
