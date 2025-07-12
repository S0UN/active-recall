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
import { ConfigService } from "../configs/ConfigService";

// Need to also store the studying tabs in the cache
// When we switch to a studying tab, we should run the full pipeline right away
// WWhen we switch to an idle tab, we should run the pipeline depending on the last classified time
// If the last classified time is more than 15 minutes ago, we should run the pipeline
// If the last classified time is less than 15 minutes ago, we should not run the pipeline
// make these changes in the Orchestrator class
// also make the orchestrator class more modular by separating the concerns of polling, capturing, OCR, classification, and batching


// add a TTL for the cache

@injectable()
export class Orchestrator {
  private configService: ConfigService = new ConfigService();
  private cache: ICache<string, { mode: string; lastClassified: number }>;
  private state: IOrchestratorState;
  private idleState: IdleState;
  private studyingState: StudyingState;
  public currentWindow: string | null = null;
  private readonly windowPoller: WindowChangePoller;
  private readonly studyingOcrPoller: StudyingOCRPoller;
  private readonly idleRevalPoller: IdleRevalidationPoller;
  private readonly visionService: VisionService;

  //turn this in to a builder pattern
  constructor(
    @inject("WindowCache")
    cache: ICache<string, { mode: string; lastClassified: number }>,
    @inject("VisionService") private readonly vision: VisionService,
    @inject("WindowChangePollerFactory")
    private readonly createWindowPoller: (
      callback: (oldWindow: string, newWindow: string) => void
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
    this.windowPoller = this.createWindowPoller(
      (oldWindow: string, newWindow: string) => {
        this.currentWindow = newWindow;
        this.state.onWindowChange(oldWindow, newWindow);
      }
    );

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
  private transitionStateOnWindowChange(newWindow: string) {
    // nothing is in the cache yet, assume it is studying to classify once and if it is idle, the classification will handle it
    if (!this.cache.has(newWindow)) {
      this.cache.set(newWindow, {
        mode: "Studying",
        lastClassified: Date.now(),
      });
    }
    const entry = this.cache.get(newWindow);

    let desiredState: IOrchestratorState;
    
    if (entry.mode === "Studying") {
      desiredState = this.studyingState;
    } else {
      desiredState = this.idleState;
    }
    if (this.state.constructor !== desiredState.constructor) {
      this.changeState(desiredState);
    }
  }


  changeState(desiredState: IOrchestratorState) {
    
      this.state.onExit();
      this.state = desiredState;
      this.state.onEnter();
    
  }

  async captureAndClassifyText(newWindow: string): Promise<string> {
    const text = await this.visionService.captureAndRecognizeText();
    const nextMode = await this.classifier.classify(text);
    return nextMode;
  }

  @LogExecution()
  async runFullPipeline(newWindow: string) {

    const currentMode = this.cache.get(newWindow).mode;

    const text = await this.visionService.captureAndRecognizeText();

    const nextMode = await this.classifier.classify(text);
    
    //maybe check if its different first, we dont want to keep setting the same mode
    if (currentMode === "Idle" && nextMode === "Studying") {
      this.cache.set(newWindow, { mode: nextMode, lastClassified: Date.now() });
      this.changeState(this.studyingState);
    }

    if (currentMode === "Studying" && nextMode === "Idle") {
      this.cache.set(newWindow, { mode: nextMode, lastClassified: Date.now() });
      this.changeState(this.idleState);
    }

    if (nextMode === "Studying") {
      this.batcher.add(text);
      await this.batcher.flushIfNeeded();
    }
    // Placeholder
  }

  @LogExecution()
  IdleRevalidation() {
    const state = this.cache.get(this.currentWindow!);
    if (!state || Date.now() - state.lastClassified > this.configService.idleRevalidationIntervalMs && state.mode === "Idle") {
      this.runFullPipeline(this.currentWindow!);
    } else {
      this.logger.info(
        `Window ${this.currentWindow} is still active, no reclassification needed.`
      );
    }
  }

  @LogExecution()
  updateOldWindowDate(oldWindow: string | null) {
    if (oldWindow && this.cache.has(oldWindow)) {
      const entry = this.cache.get(oldWindow);
      entry.lastClassified = Date.now();
      this.cache.set(oldWindow, entry);
      this.logger.info(`Updated last seen for window: ${oldWindow}`);
    } else {
      this.logger.warn(`No entry found for window: ${oldWindow}`);
    }
    // Placeholder
  }


  async onCommonWindowChange(
    oldKey: string | null,
    newKey: string
  ) {
      this.updateOldWindowDate(oldKey);
      this.transitionStateOnWindowChange(newKey);

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
