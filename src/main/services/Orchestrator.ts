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
import { ErrorHandler } from "../utils/ErrorHandler";

@injectable()
export class Orchestrator {
  private state: IOrchestratorState;
  private readonly idleState: IdleState;
  private readonly studyingState: StudyingState;
  private readonly errorHandler: ErrorHandler;
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
    this.idleState = new IdleState(this);
    this.studyingState = new StudyingState(this);
    this.state = this.idleState;
    this.errorHandler = new ErrorHandler(this.logger);
    this.cache.startTTL();
    this.setupPollingCallbacks();
  }

  private setupPollingCallbacks(): void {
    this.idleRevalPoller.setOnTick(() => this.performIdleRevalidation());
    this.windowPoller.setOnChange((oldWindow: string, newWindow: string) => {
      this.handleWindowChange(oldWindow, newWindow);
    });
    this.studyingOcrPoller.setOnTick(() => this.processCurrentWindow());
  }

  private processCurrentWindow(): void {
    if (!this.currentWindow) {
      this.logger.warn('No current window available for OCR polling');
      return;
    }
    this.runFullPipeline(this.currentWindow);
  }

  async start() {
    await this.initializeServices();
    this.state.onEnter();
  }

  private async initializeServices(): Promise<void> {
    // Initialize classifier if it has an init method
    if ('init' in this.classifier && typeof this.classifier.init === 'function') {
      await this.classifier.init();
    }
  }
  stop() {
    this.state.onExit();
  }

  private transitionStateOnWindowChange(newWindow: string) {

    const entry = this.cache.get(newWindow);
    if (!entry) {
      throw new CacheError(`Cache entry not found for window: ${newWindow}`);
    }

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
    this.logger.info(`State changed to: ${this.state.constructor.name}`);
  }

  async runFullPipeline(newWindow: string) {
    if (!newWindow) {
      throw new Error('Window identifier is required');
    }
    
    this.logger.info(`Running full pipeline for window: ${newWindow}`);
    
    try {
      const currentMode = this.getCurrentWindowMode(newWindow);
      
      const { text, classificationResult } = await this.captureAndClassifyWindow();
      this.logger.info(`Classification result: ${classificationResult}`);
      this.handleModeTransition(newWindow, currentMode, classificationResult);
      await this.processStudyingContent(classificationResult, text);
    } catch (error) {
      if (error instanceof VisionServiceError || error instanceof ClassificationError || error instanceof CacheError) {
        throw error;
      }
      throw new VisionServiceError('Failed to run full pipeline', error as Error);
    }
  }

  private async captureAndClassifyWindow(): Promise<{ text: string; classificationResult: string }> {
    const text = await this.visionService.captureAndRecognizeText();
    const classificationResult = await this.classifier.classify(text);
    return { text, classificationResult };
  }

  private getCurrentWindowMode(windowId: string): string {
    const cacheEntry = this.cache.get(windowId);
    if (!cacheEntry) {
      throw new CacheError(`No cache entry found for window: ${windowId}`);
    }
    return cacheEntry.mode;
  }

  private handleModeTransition(windowId: string, currentMode: string, nextMode: string): void {
    if (this.shouldTransitionToStudying(currentMode, nextMode)) {
      this.updateCacheAndTransition(windowId, nextMode, this.studyingState);
    }

    if (this.shouldTransitionToIdle(currentMode, nextMode)) {
      this.updateCacheAndTransition(windowId, nextMode, this.idleState);
    }
  }

  private shouldTransitionToStudying(currentMode: string, nextMode: string): boolean {
    return currentMode === "Idle" && nextMode === "Studying";
  }

  private shouldTransitionToIdle(currentMode: string, nextMode: string): boolean {
    return currentMode === "Studying" && nextMode === "Idle";
  }

  private updateCacheAndTransition(windowId: string, mode: string, state: IOrchestratorState): void {
    this.cache.set(windowId, { mode, lastClassified: Date.now() });
    this.changeState(state);
  }

  private async processStudyingContent(mode: string, text: string): Promise<void> {
    if (mode === "Studying") {
      this.batcher.add(text);
      await this.batcher.flushIfNeeded();
    }
  }

  performIdleRevalidation() {
    if (!this.hasCurrentWindow()) {
      this.logger.warn('No current window available for idle revalidation');
      return;
    }
    
    if (this.shouldRevalidateWindow(this.currentWindow)) {
      this.runFullPipeline(this.currentWindow);
    } else {
      this.logWindowStillActive(this.currentWindow);
    }
  }

  private hasCurrentWindow(): boolean {
    return !!this.currentWindow;
  }

  private shouldRevalidateWindow(windowId: string): boolean {
    const state = this.cache.get(windowId);
    return !state || this.isIdleWindowStale(state);
  }

  private isIdleWindowStale(state: { mode: string; lastClassified: number }): boolean {
    const timeSinceLastClassification = Date.now() - state.lastClassified;
    return timeSinceLastClassification > this.config.idleRevalidationThresholdMs && state.mode === "Idle";
  }

  private logWindowStillActive(windowId: string): void {
    this.logger.info(`Window ${windowId} is still active, no reclassification needed.`);
  }

  // @LogExecution()
  updateOldWindowDate(oldWindow: string) {
    if (!oldWindow) {
      return;
    }
    
    if (this.hasWindowInCache(oldWindow)) {
      this.updateWindowTimestamp(oldWindow);
    } else {
      this.logWindowNotFound(oldWindow);
    }
  }

  private hasWindowInCache(windowId: string): boolean {
    return this.cache.has(windowId);
  }

  private updateWindowTimestamp(windowId: string): void {
    const entry = this.cache.get(windowId);
    if (entry) {
      entry.lastClassified = Date.now();
      this.cache.set(windowId, entry);
      this.logger.info(`Updated last seen for window: ${windowId}`);
    }
  }

  private logWindowNotFound(windowId: string): void {
    this.logger.warn(`No entry found for window: ${windowId}`);
  }

  async handleWindowChange(oldKey: string, newKey: string) {
    try {
     
      if (oldKey) {
        this.updateOldWindowDate(oldKey);
      }
      this.currentWindow = newKey;
      
      // For new windows, set initial state and run immediate classification
      if (!this.cache.has(newKey)) {
        this.updateCacheAndTransition(newKey, "Studying", this.studyingState);
        await this.runFullPipeline(newKey);
      } else {
        this.transitionStateOnWindowChange(newKey);
      }
    } catch (error) {
      // Log the full error chain with proper context
      this.errorHandler.logError(error as Error, {
        operation: 'onCommonWindowChange',
        metadata: { 
          oldWindow: oldKey,
          newWindow: newKey,
          wasNewWindow: !this.cache.has(newKey)
        }
      });
      
      // For window change errors, we want to continue running rather than crash
      // The app should remain functional even if vision pipeline fails
      this.logger.warn(`Window change handling failed for ${newKey}, continuing with cached state if available`);
      
      // Try to transition to a safe state if possible
      if (this.cache.has(newKey)) {
        try {
          this.transitionStateOnWindowChange(newKey);
        } catch (fallbackError) {
          this.logger.error('Failed to transition to cached state, remaining in current state', fallbackError as Error);
        }
      }
    }
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
