import { injectable } from 'tsyringe';
import { IBatcherService, Batch, BatchEntry } from '../IBatcherService';
import Logger from 'electron-log';

@injectable()
export class BatcherService implements IBatcherService {
  private static readonly DEFAULT_FLUSH_THRESHOLD = 10000; // 10KB threshold
  
  private batches: Batch[] = [];
  private currentWindow: string | null = null;
  private currentTopic: string | null = null;
  private flushThreshold: number;

  constructor() {
    this.flushThreshold = BatcherService.DEFAULT_FLUSH_THRESHOLD;
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
    console.log('BatcherService: flushIfNeeded called');
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
}
