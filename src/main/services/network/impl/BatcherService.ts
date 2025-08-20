import { injectable, inject } from 'tsyringe';
import { IBatcherService, Batch, BatchEntry } from '../IBatcherService';
import Logger from 'electron-log';
import { getModelConfig } from '../../../../core/config/providers/llm-providers.config';
import { IPollingConfig } from '../../../configs/IPollingConfig';

/**
 * BatcherService manages the collection and batching of text data from different windows and topics.
 * 
 * The service groups text entries by window title and topic label, automatically creating new batches
 * when either changes. It includes automatic flushing when the total character count exceeds a 
 * configurable threshold that is provider and model aware.
 * 
 * JSON Output Format:
 * {
 *   "batches": [
 *     {
 *       "window": "Google Chrome - example.com",
 *       "topic": "programming",
 *       "entries": [
 *         { "text": "First captured text content" },
 *         { "text": "Second captured text content" }
 *       ]
 *     },
 *     {
 *       "window": "VS Code - main.ts",
 *       "topic": "coding",
 *       "entries": [
 *         { "text": "Code content from editor" }
 *       ]
 *     }
 *   ]
 * }
 * 
 * Environment Configuration:
 * - LLM_PROVIDER: The LLM provider to use (openai, gemini, anthropic)
 * - LLM_MODEL: The specific model within the provider
 * - BATCH_FLUSH_THRESHOLD: Override character count threshold (default: provider-specific)
 */
@injectable()
export class BatcherService implements IBatcherService {
  private static readonly DEFAULT_FLUSH_THRESHOLD = 60000; // Optimal for multi-concept extraction
  private static readonly DEFAULT_IDLE_FLUSH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  private batches: Batch[] = [];
  private currentWindow: string | null = null;
  private currentTopic: string | null = null;
  private flushThreshold: number;
  private readonly currentProvider: string;
  private readonly currentModel: string;
  
  // Idle flush functionality
  private readonly idleFlushTimeoutMs: number;
  private idleTimer: NodeJS.Timeout | null = null;
  private isInStudyingMode: boolean = true; // Default to studying mode

  constructor(
    @inject('PollingConfig') private readonly config?: IPollingConfig
  ) {
    this.currentProvider = this.getCurrentProvider();
    this.currentModel = this.getCurrentModel();
    this.flushThreshold = this.getFlushThresholdFromEnv();
    this.idleFlushTimeoutMs = this.config?.batchIdleFlushTimeoutMs ?? BatcherService.DEFAULT_IDLE_FLUSH_TIMEOUT;
    this.logConfiguration();
  }

  private getCurrentProvider(): string {
    return (process.env.LLM_PROVIDER || 'openai').toUpperCase();
  }

  private getCurrentModel(): string {
    const provider = this.currentProvider;
    
    if (provider === 'GEMINI') {
      const model = process.env.GEMINI_MODEL || 'flash-lite';
      return model.toUpperCase().replace(/-/g, '_');
    } else if (provider === 'OPENAI') {
      const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
      return model.toUpperCase().replace(/-/g, '_').replace(/\./g, '_');
    } else if (provider === 'ANTHROPIC') {
      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet';
      return model.toUpperCase().replace(/-/g, '_').replace(/\./g, '_');
    }
    
    return 'DEFAULT';
  }

  private getFlushThresholdFromEnv(): number {
    // First check for explicit override
    const explicitThreshold = process.env.BATCH_FLUSH_THRESHOLD;
    if (explicitThreshold) {
      const parsed = parseInt(explicitThreshold, 10);
      if (!isNaN(parsed) && parsed > 0) {
        Logger.info(`Using explicit BATCH_FLUSH_THRESHOLD: ${parsed} characters`);
        return parsed;
      }
    }

    // Check for provider-specific threshold
    const provider = this.currentProvider;
    const model = this.currentModel;
    
    // Try to get provider and model specific threshold
    const modelConfig = getModelConfig(provider, model);
    if (modelConfig) {
      Logger.info(`Using ${provider} ${model} threshold: ${modelConfig.flushThreshold} characters`);
      return modelConfig.flushThreshold;
    }

    // Check for provider-specific environment variable
    const providerThresholdKey = `${provider}_${model}_THRESHOLD`;
    const providerThreshold = process.env[providerThresholdKey];
    if (providerThreshold) {
      const parsed = parseInt(providerThreshold, 10);
      if (!isNaN(parsed) && parsed > 0) {
        Logger.info(`Using ${providerThresholdKey}: ${parsed} characters`);
        return parsed;
      }
    }

    // Fall back to default
    Logger.info(`Using default flush threshold: ${BatcherService.DEFAULT_FLUSH_THRESHOLD} characters`);
    return BatcherService.DEFAULT_FLUSH_THRESHOLD;
  }

  private logConfiguration(): void {
    Logger.info('BatcherService Configuration:', {
      provider: this.currentProvider,
      model: this.currentModel,
      flushThreshold: this.flushThreshold,
      estimatedTokens: Math.ceil(this.flushThreshold / 4)
    });
  }

  public setFlushThreshold(threshold: number): void {
    this.flushThreshold = threshold;
  }

  public add(windowTitle: string, topicLabel: string, text: string): void {
    if (this.shouldCreateNewBatch(windowTitle, topicLabel)) {
      this.createNewBatch(windowTitle, topicLabel);
    }
    
    this.addEntryToCurrentBatch(text);
    this.updateCurrentContext(windowTitle, topicLabel);
    
    // Auto-flush if character threshold exceeded
    if (this.shouldAutoFlush()) {
      this.flushIfNeeded();
    }
  }

  public async flushIfNeeded(): Promise<void> {
    // Placeholder implementation for future flush logic
    Logger.debug('BatcherService: flushIfNeeded called');
    return Promise.resolve();
  }

  public getBatches(): Batch[] {
    return [...this.batches];
  }

  public getBatchesAsJson(): string {
    Logger.info('BatcherService: Converting batches to JSON' + JSON.stringify(this.batches));
    return JSON.stringify({ batches: this.batches });
  }

  public clearBatches(): void {
    this.cancelIdleTimer(); // Clean up timer when clearing batches
    this.batches = [];
    this.currentWindow = null;
    this.currentTopic = null;
  }

  private shouldCreateNewBatch(windowTitle: string, topicLabel: string): boolean {
    return this.isFirstBatch() || 
           this.hasWindowChanged(windowTitle) || 
           this.hasTopicChanged(topicLabel);
  }

  private isFirstBatch(): boolean {
    return this.batches.length === 0;
  }

  private hasWindowChanged(windowTitle: string): boolean {
    return this.currentWindow !== windowTitle;
  }

  private hasTopicChanged(topicLabel: string): boolean {
    return this.currentTopic !== topicLabel;
  }

  private createNewBatch(windowTitle: string, topicLabel: string): void {
    const newBatch: Batch = {
      window: windowTitle,
      topic: topicLabel,
      entries: []
    };
    this.batches.push(newBatch);
  }

  private addEntryToCurrentBatch(text: string): void {
    const currentBatch = this.getCurrentBatch();
    const entry: BatchEntry = { text };
    currentBatch.entries.push(entry);
  }

  private getCurrentBatch(): Batch {
    if (this.batches.length === 0) {
      throw new Error('No current batch available');
    }
    return this.batches[this.batches.length - 1];
  }

  private updateCurrentContext(windowTitle: string, topicLabel: string): void {
    this.currentWindow = windowTitle;
    this.currentTopic = topicLabel;
  }

  private shouldAutoFlush(): boolean {
    const totalCharacters = this.calculateTotalCharacters();
    return totalCharacters >= this.flushThreshold;
  }

  private calculateTotalCharacters(): number {
    return this.batches.reduce((total, batch) => {
      const batchCharacters = batch.entries.reduce((batchTotal, entry) => {
        return batchTotal + entry.text.length;
      }, 0);
      return total + batchCharacters + batch.window.length + batch.topic.length;
    }, 0);
  }

  /**
   * Notify that studying mode has started
   * Cancels any active idle timer and resets state
   */
  public notifyStudyingStarted(): void {
    Logger.info('BatcherService: Transition to studying mode');
    this.isInStudyingMode = true;
    this.cancelIdleTimer();
  }

  /**
   * Notify that idle mode has started
   * Starts idle timer if batches contain meaningful content
   */
  public notifyIdleStarted(): void {
    Logger.info('BatcherService: Transition to idle mode');
    this.isInStudyingMode = false;
    this.startIdleTimerIfNeeded();
  }

  /**
   * Cancels any active idle timer
   */
  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
      Logger.debug('BatcherService: Idle timer cancelled');
    }
    // Note: Only call clearTimeout when we have a timer reference to avoid double counting
  }

  /**
   * Starts idle timer if batches contain meaningful content
   */
  private startIdleTimerIfNeeded(): void {
    this.cancelIdleTimer(); // Cancel any existing timer first
    
    if (!this.hasMeaningfulContent()) {
      Logger.debug('BatcherService: No meaningful content, idle timer not started');
      return;
    }

    // Validate timeout value
    if (this.idleFlushTimeoutMs <= 0) {
      Logger.debug(`BatcherService: Invalid timeout value (${this.idleFlushTimeoutMs}ms), idle timer not started`);
      return;
    }

    Logger.info(`BatcherService: Starting idle timer (${this.idleFlushTimeoutMs}ms)`);
    try {
      this.idleTimer = setTimeout(async () => {
        await this.handleIdleTimerExpiration();
      }, this.idleFlushTimeoutMs);
    } catch (error) {
      Logger.debug('BatcherService: Failed to create timer', error);
    }
  }

  /**
   * Handles idle timer expiration by flushing and clearing batches
   */
  private async handleIdleTimerExpiration(): Promise<void> {
    Logger.info('BatcherService: Idle timer expired, flushing batches');
    
    try {
      await this.flushIfNeeded();
      // Clear batches manually instead of calling clearBatches() to avoid timer cleanup recursion
      this.batches = [];
      this.currentWindow = null;
      this.currentTopic = null;
      Logger.info('BatcherService: Idle flush completed successfully');
    } catch (error) {
      Logger.error('Failed to flush batches on idle timeout', error as Error);
    } finally {
      this.idleTimer = null; // Clean up timer reference
    }
  }

  /**
   * Checks if batches contain meaningful content (non-empty text)
   */
  private hasMeaningfulContent(): boolean {
    return this.batches.some(batch => 
      batch.entries.some(entry => 
        entry.text && entry.text.trim().length > 0
      )
    );
  }

  /**
   * Gets the current studying mode state (for testing and debugging)
   */
  public getIsInStudyingMode(): boolean {
    return this.isInStudyingMode;
  }

}
