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
import { LogExecution } from "../utils/LogExecution";
import { ICache } from "../utils/ICache";
import { StudyingState } from "./orchestrator/impl/StudyingState";
@injectable()
export class Orchestrator {
  private cache: ICache<string, any>;
  private state: IOrchestratorState;
  private idleState: IdleState;
  private studyingState: StudyingState;
  public currentKey: string | null = null;
  private readonly windowPoller: WindowChangePoller;
  private readonly studyingOcrPoller: StudyingOCRPoller;
  private readonly idleRevalPoller: IdleRevalidationPoller;
  private readonly visionService: VisionService;

  //turn this in to a builder pattern
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
    this.idleState = new IdleState(this);
    this.studyingState = new StudyingState(this);

    this.state = this.idleState;

    this.visionService = new VisionService(this.capture, this.ocr, this.logger);

    // Create pollers with their callbacks
    this.windowPoller = this.createWindowPoller((key: string) => {
      this.currentKey = key;
      this.state.onWindowChange(key);
      this.transitionStateIfNeeded(key);
    });

    this.studyingOcrPoller = this.createStudyingOcrPoller(() => {
      this.state.onTick();
    });

    this.idleRevalPoller = this.createIdleRevalPoller(() => {
      this.state.onTick();
    });
  }

  start() {
    this.state.onEnter();
  }
  stop() {
    this.state.onExit();
  }

  @LogExecution()
  private transitionStateIfNeeded(key: string) {
    const entry = this.cache.get(key);
    let desiredState: IOrchestratorState;
    if (entry && entry.mode === "Studying") {
      desiredState = this.studyingState;
    } else {
      desiredState = this.idleState;
    }
    if (this.state.constructor !== desiredState.constructor) {
      this.state.onExit();
      this.state = desiredState;
      this.state.onEnter();
    }
  }

  @LogExecution()
  async runFullPipeline(key: string) {
    const currentKey = this.cache.get(key);
    this.logger.info(`Running full pipeline for key: ${key}`);
    const text = await this.visionService.captureAndRecognizeText();
    this.logger.info(`Captured text: ${text}`);
    const nextMode = await this.classifier.classify(text);
    this.logger.info(`Classified text: ${nextMode}`);

    if (currentKey === "Idle" && nextMode === "Studying") {
      this.cache.delete(key); 
      this.transitionStateIfNeeded(key);
    }

    if (currentKey === "Studying" && nextMode === "Idle") {
      this.cache.set(key, Date.now());
      this.transitionStateIfNeeded(key);
    }

    if (nextMode === 'Studying') {
      this.batcher.add(text);
      await this.batcher.flushIfNeeded();
    }
    // Placeholder
  }

  @LogExecution()
  IdleRevalidation() {
    const state = this.cache.get(this.currentKey!);
    if (!state || Date.now() - state.lastClassified > 15 * 60_000) {
      this.runFullPipeline(this.currentKey!);
    } else {
      this.logger.info(`Window ${this.currentKey} is still active, no reclassification needed.`);
    }
  }


  @LogExecution()
  updateLastSeen(key: string) {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastClassified = Date.now();
      this.cache.set(key, entry);
      this.logger.info(`Updated last seen for key: ${key}`);
    } else {
      this.logger.warn(`No entry found for key: ${key}`);
    }
    // Placeholder
  }

  public getWindowCache(): ICache<string, any> {
    return this.cache;
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
