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
import { PollingConfigService } from "../configs/PollingConfigService";
import { ILogger } from "../utils/ILogger";
import { UniversalModelFactory } from "./analysis/impl/UniversalModelFactory";
import { VisionServiceError, ClassificationError, CacheError, ModelInitializationError, ModelNotFoundError, ModelInferenceError, ScreenCaptureError } from "../errors/CustomErrors";
import { ErrorHandler } from "../utils/ErrorHandler";

@injectable()
export class Orchestrator {
  private state!: IOrchestratorState;
  private idleState!: IdleState;
  private studyingState!: StudyingState;
  private errorHandler!: ErrorHandler;
  public currentWindow = "";
  private pendingPipelineTimer: NodeJS.Timeout | null = null;

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
    private readonly config: PollingConfigService,

    @inject("ModelFactory")
    private readonly modelFactory: UniversalModelFactory
  ) {
    this.initializeOrchestrator();
  }

  private initializeOrchestrator(): void {
    this.createStateInstances();
    this.setInitialState();
    this.configureErrorHandling();
    this.startCacheManagement();
    this.setupPollingCallbacks();
  }

  private createStateInstances(): void {
    (this as any).idleState = new IdleState(this);
    (this as any).studyingState = new StudyingState(this);
  }

  private setInitialState(): void {
    this.state = this.idleState;
  }

  private configureErrorHandling(): void {
    (this as any).errorHandler = new ErrorHandler(this.logger);
  }

  private startCacheManagement(): void {
    this.cache.startTTL();
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
    await this.initializeClassificationSystem();
    await this.optimizeStrategyConfiguration();
    this.startPollingSystem();
    await this.enterIdleState();
  }

  private async initializeClassificationSystem(): Promise<void> {
    await this.ensureClassifierIsReady();
    await this.configureOptimalStrategy();
    this.logSystemInitialization();
  }

  private async ensureClassifierIsReady(): Promise<void> {
    // Classification service is already initialized through factory
    // No need to call init() as it's handled during creation
  }


  private async configureOptimalStrategy(): Promise<void> {
    // Using default zero-shot strategy with BART large MNLI
    this.logger.info('Using default classification strategy', {
      strategy: 'zero-shot',
      model: 'facebook/bart-large-mnli'
    });
  }

  private async optimizeStrategyConfiguration(): Promise<void> {
    const availableStrategies = await this.modelFactory.getAvailableStrategies();
    this.logAvailableStrategies(availableStrategies);
  }

  private logAvailableStrategies(strategies: any[]): void {
    this.logger.info('Available classification strategies:', {
      count: strategies.length,
      strategies: strategies.map(s => ({ type: s.type, models: s.models.length }))
    });
  }

  private startPollingSystem(): void {
    // Polling will be started by the state
  }

  private async enterIdleState(): Promise<void> {
    this.state.onEnter();
  }

  private logSystemInitialization(): void {
    this.logger.info('Classification system initialized successfully');
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
    } catch (error: unknown) {
      // Handle different error types with appropriate strategies
      if (error instanceof CacheError) {
        // Cache errors are critical - fail fast
        throw error;
      }
      
      if (error instanceof ModelNotFoundError) {
        // Model not found - log warning but continue (graceful degradation)
        this.logger.warn(`Model not available for window ${newWindow}: ${error.message}`);
        this.logger.info('Continuing with degraded functionality');
        return;
      }
      
      if (error instanceof ModelInitializationError || error instanceof ModelInferenceError) {
        // Model errors - rethrow with context for debugging
        throw new ClassificationError(
          `Classification pipeline failed for window ${newWindow}: ${error.message}`,
          error
        );
      }
      
      if (error instanceof VisionServiceError || error instanceof ScreenCaptureError) {
        // Vision/Screen capture errors - rethrow with context
        const errorMessage = error instanceof Error ? error.message : 'Unknown vision error';
        throw new VisionServiceError(
          `Vision pipeline failed for window ${newWindow}: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );
      }
      
      if (error instanceof ClassificationError) {
        // Already a classification error - rethrow with additional context
        throw new ClassificationError(
          `Pipeline failed for window ${newWindow}: ${error.message}`,
          error
        );
      }
      
      // Unknown error - wrap and rethrow for debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new VisionServiceError(
        `Unexpected error in pipeline for window ${newWindow}: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async captureAndClassifyWindow(): Promise<{ text: string; classificationResult: string }> {
    this.logger.info('Capturing screen...');
    
    try {
      const text = await this.visionService.captureAndRecognizeText();
      const classificationResult = await this.classifier.classify(text);
      return { text, classificationResult };
    } catch (error: unknown) {
      // Capture specific error context and rethrow
      if (error instanceof Error) {
        if (error.message.includes('captureAndRecognizeText') || error.message.includes('screenshot')) {
          throw new VisionServiceError(
            'Screen capture failed. This may be due to missing OCR dependencies or permissions.',
            error
          );
        }
      }
      
      // Model-related errors should bubble up as-is for proper handling
      if (error instanceof ModelNotFoundError || 
          error instanceof ModelInitializationError || 
          error instanceof ModelInferenceError ||
          error instanceof ClassificationError) {
        throw error;
      }
      
      // Unknown error - wrap with context
      const errorMessage = error instanceof Error ? error.message : 'Unknown capture/classification error';
      throw new VisionServiceError(
        `Failed to capture and classify window content: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
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
    if (mode !== "idle") {
      this.batcher.add(this.currentWindow, mode, text);
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
      
      // Cancel any pending pipeline execution from previous window
      this.cancelPendingPipeline();
      
      // For new windows, set initial state and schedule delayed classification
      if (!this.cache.has(newKey)) {
        this.updateCacheAndTransition(newKey, "Studying", this.studyingState);
        this.schedulePipelineExecution(newKey);
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

  private cancelPendingPipeline(): void {
    if (this.pendingPipelineTimer) {
      clearTimeout(this.pendingPipelineTimer);
      this.pendingPipelineTimer = null;
      this.logger.info('Cancelled pending pipeline execution due to window change');
    }
  }

  private schedulePipelineExecution(windowKey: string): void {
    this.pendingPipelineTimer = setTimeout(async () => {
      // Verify the window is still the current one before executing
      if (this.currentWindow === windowKey) {
        this.logger.info(`Executing delayed pipeline for window: ${windowKey}`);
        await this.runFullPipeline(windowKey);
      } else {
        this.logger.info(`Skipping pipeline execution for ${windowKey} - window changed`);
      }
      this.pendingPipelineTimer = null;
    }, this.config.newWindowPipelineDelayMs);
    
    this.logger.info(`Scheduled pipeline execution for ${windowKey} in ${this.config.newWindowPipelineDelayMs}ms`);
  }
}
