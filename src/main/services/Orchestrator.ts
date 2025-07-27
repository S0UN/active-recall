import { injectable, inject } from "tsyringe";
import { IOrchestratorState } from "./orchestrator/IOrchestratorState";
import { IdleState } from "./orchestrator/impl/IdleState";
import { WindowChangePoller } from "./polling/impl/WindowChangePoller";
import { StudyingOCRPoller } from "./polling/impl/StudyingOCRPoller";
import { IdleRevalidationPoller } from "./polling/impl/IdleRevalidationPoller";
import { IClassificationService } from "./analysis/IClassificationService";
import { IBatcherService } from "./network/IBatcherService";
import { VisionService } from "./processing/impl/VisionService";
import { ICache } from "../utils/ICache";
import { StudyingState } from "./orchestrator/impl/StudyingState";
import { ConfigService } from "../configs/ConfigService";
import { ILogger } from "../utils/ILogger";
import { VisionServiceError, ClassificationError, CacheError } from "../errors/CustomErrors";

// MUST UNDERSTAND TWO THINGS, WHY DO I NEED TO DO :
/*
this.pollingSystem.register(this.name, this.intervalMs, () =>
Promise.resolve(callback()).catch(err => this.logger.error(err))
);

AND WHY DO I NEED TO DO THIS TO SET PROPERLY:

  
  public setOnTick(cb: () => void): void {
    this.onTickCallback = cb;
  }
*/

@injectable()
export class Orchestrator {
  private state: IOrchestratorState;
  private readonly idleState: IdleState;
  private readonly studyingState: StudyingState;
  public currentWindow = "";

  constructor(
    @inject("WindowCache")
    private readonly cache: ICache<
      string,
      { mode: string; lastClassified: number }
    >,

    @inject("VisionService")
    private readonly visionService: VisionService,

    @inject("WindowChangePoller")
    private readonly windowPoller: WindowChangePoller,

    @inject("StudyingOCRPoller")
    private readonly studyingOcrPoller: StudyingOCRPoller,

    @inject("IdleRevalidationPoller")
    private readonly idleRevalPoller: IdleRevalidationPoller,

    @inject("ClassificationService")
    private readonly classifier: IClassificationService,

    @inject("BatcherService")
    private readonly batcher: IBatcherService,

    @inject("LoggerService")
    public readonly logger: ILogger,

    @inject("PollingConfig")
    private readonly config: ConfigService
  ) {
    // state setup
    this.idleState = new IdleState(this);
    this.studyingState = new StudyingState(this);
    this.state = this.idleState;
    this.cache.startTTL();
    this.idleRevalPoller.setOnTick(() => this.IdleRevalidation());
    this.windowPoller.setOnChange(
      (oldWindow: string, newWindow: string) => {
        this.onCommonWindowChange(oldWindow, newWindow);
      }
    );
    this.studyingOcrPoller.setOnTick(() => {
      if (!this.currentWindow) {
        this.logger.warn('No current window available for OCR polling');
        return;
      }
      this.runFullPipeline(this.currentWindow);
    });
  }

  start() {
    this.state.onEnter();
  }
  stop() {
    this.state.onExit();
  }

  //@LogExecution()
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
    if (!newWindow) {
      throw new Error('Window identifier is required');
    }
    
    try {
      const text = await this.visionService.captureAndRecognizeText();
      const nextMode = await this.classifier.classify(text);
      return nextMode;
    } catch (error) {
      if (error instanceof VisionServiceError) {
        throw error;
      }
      if (error instanceof ClassificationError) {
        throw error;
      }
      throw new VisionServiceError('Failed to capture and classify text', error as Error);
    }
  }

  //@LogExecution()
  async runFullPipeline(newWindow: string) {
    if (!newWindow) {
      throw new Error('Window identifier is required');
    }
    
    this.logger.info(`Running full pipeline for window: ${newWindow}`);
    
    try {
      const cacheEntry = this.cache.get(newWindow);
      if (!cacheEntry) {
        throw new CacheError(`No cache entry found for window: ${newWindow}`);
      }
      
      const currentMode = cacheEntry.mode;
      const text = await this.visionService.captureAndRecognizeText();
      const nextMode = await this.classifier.classify(text);

      // Update state only if mode changed
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
    } catch (error) {
      if (error instanceof VisionServiceError || error instanceof ClassificationError || error instanceof CacheError) {
        throw error;
      }
      throw new VisionServiceError('Failed to run full pipeline', error as Error);
    }
  }

  // @LogExecution()
  IdleRevalidation() {
    if (!this.currentWindow) {
      this.logger.warn('No current window available for idle revalidation');
      return;
    }
    
    const state = this.cache.get(this.currentWindow);
    if (
      !state ||
      (Date.now() - state.lastClassified >
        this.config.idleRevalidationIntervalMs &&
        state.mode === "Idle")
    ) {
      this.runFullPipeline(this.currentWindow);
    } else {
      this.logger.info(
        `Window ${this.currentWindow} is still active, no reclassification needed.`
      );
    }
  }

  // @LogExecution()
  updateOldWindowDate(oldWindow: string) {
    if (!oldWindow) {
      return;
    }
    
    if (this.cache.has(oldWindow)) {
      const entry = this.cache.get(oldWindow);
      if (entry) {
        entry.lastClassified = Date.now();
        this.cache.set(oldWindow, entry);
        this.logger.info(`Updated last seen for window: ${oldWindow}`);
      }
    } else {
      this.logger.warn(`No entry found for window: ${oldWindow}`);
    }
  }

  async onCommonWindowChange(oldKey: string, newKey: string) {
    if (oldKey) {
      this.updateOldWindowDate(oldKey);
    }
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

  public stopIdleRevalidationPolling(): void {
    this.idleRevalPoller.stop();
  }

  public startIdleRevalidationPolling(): void {
    this.idleRevalPoller.start();
  }
}
