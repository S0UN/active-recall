/**
 * RoutingMetricsCollector - Centralized metrics collection for routing operations
 * 
 * This service follows the Single Responsibility Principle by focusing solely on
 * metrics collection and reporting. It removes the scattered statistics tracking
 * from the main routing logic, reducing cognitive load and improving testability.
 */

import { RoutingDecision } from '../ISmartRouter';

export interface RoutingMetrics {
  totalRouted: number;
  duplicatesFound: number;
  foldersCreated: number;
  unsortedCount: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  totalConfidence: number;
  averageProcessingTime: number;
}

export interface MetricsSummary extends RoutingMetrics {
  averageConfidence: number;
  duplicateRate: number;
  unsortedRate: number;
  highConfidenceRate: number;
}

export class RoutingMetricsCollector {
  private metrics: RoutingMetrics = {
    totalRouted: 0,
    duplicatesFound: 0,
    foldersCreated: 0,
    unsortedCount: 0,
    highConfidenceCount: 0,
    lowConfidenceCount: 0,
    totalConfidence: 0,
    averageProcessingTime: 0
  };

  private processingTimes: number[] = [];

  recordRoutingDecision(decision: RoutingDecision, processingTime?: number): void {
    this.incrementTotalRouted();
    this.updateConfidenceMetrics(decision.confidence);
    this.categorizeDecision(decision);
    
    if (processingTime !== undefined) {
      this.recordProcessingTime(processingTime);
    }
  }

  recordDuplicateFound(similarity: number): void {
    // This method is called separately from recordRoutingDecision
    // Use only when tracking duplicates outside of normal routing flow
    this.metrics.duplicatesFound++;
    this.metrics.totalRouted++;
    this.metrics.totalConfidence += similarity;
  }

  recordFolderCreation(): void {
    this.metrics.foldersCreated++;
  }

  recordUnsortedPlacement(): void {
    this.metrics.unsortedCount++;
  }

  getMetricsSummary(): MetricsSummary {
    return {
      ...this.metrics,
      averageConfidence: this.calculateAverageConfidence(),
      duplicateRate: this.calculateDuplicateRate(),
      unsortedRate: this.calculateUnsortedRate(),
      highConfidenceRate: this.calculateHighConfidenceRate()
    };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRouted: 0,
      duplicatesFound: 0,
      foldersCreated: 0,
      unsortedCount: 0,
      highConfidenceCount: 0,
      lowConfidenceCount: 0,
      totalConfidence: 0,
      averageProcessingTime: 0
    };
    this.processingTimes = [];
  }

  private incrementTotalRouted(): void {
    this.metrics.totalRouted++;
  }

  private updateConfidenceMetrics(confidence: number): void {
    this.metrics.totalConfidence += confidence;
    
    if (confidence >= 0.82) {
      this.metrics.highConfidenceCount++;
    } else if (confidence <= 0.65) {
      this.metrics.lowConfidenceCount++;
    }
  }

  private categorizeDecision(decision: RoutingDecision): void {
    switch (decision.action) {
      case 'duplicate':
        this.metrics.duplicatesFound++;
        break;
      case 'unsorted':
        this.metrics.unsortedCount++;
        break;
      case 'create_folder':
        this.metrics.foldersCreated++;
        break;
    }
  }

  private recordProcessingTime(time: number): void {
    this.processingTimes.push(time);
    this.metrics.averageProcessingTime = this.calculateAverageProcessingTime();
  }

  private calculateAverageConfidence(): number {
    if (this.metrics.totalRouted === 0) {
      return 0;
    }
    return this.metrics.totalConfidence / this.metrics.totalRouted;
  }

  private calculateDuplicateRate(): number {
    if (this.metrics.totalRouted === 0) {
      return 0;
    }
    return this.metrics.duplicatesFound / this.metrics.totalRouted;
  }

  private calculateUnsortedRate(): number {
    if (this.metrics.totalRouted === 0) {
      return 0;
    }
    return this.metrics.unsortedCount / this.metrics.totalRouted;
  }

  private calculateHighConfidenceRate(): number {
    if (this.metrics.totalRouted === 0) {
      return 0;
    }
    return this.metrics.highConfidenceCount / this.metrics.totalRouted;
  }

  private calculateAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) {
      return 0;
    }
    const sum = this.processingTimes.reduce((acc, time) => acc + time, 0);
    return sum / this.processingTimes.length;
  }
}