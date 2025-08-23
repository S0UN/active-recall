/**
 * FileSystem Implementation of IReviewScheduleRepository
 * 
 * Stores review schedules as JSON files in a directory structure for
 * development and small-scale deployments. Follows the same patterns
 * as FileSystemArtifactRepository.
 * 
 * Features:
 * - Atomic file operations
 * - Index files for efficient queries
 * - Concurrent operation safety
 * - Backup and recovery
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';

// Simple semaphore for concurrency control
class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}
import { 
  IReviewScheduleRepository, 
  DueReviewsQuery, 
  ScheduleQuery,
  ReviewCalendarEntry,
  ScheduleStatistics
} from '../contracts/IReviewScheduleRepository';
import { ReviewSchedule, ReviewStatus } from '../domain/ReviewSchedule';

/**
 * Index structure for efficient queries
 */
interface ScheduleIndex {
  // Basic lookups
  byId: Map<string, string>; // scheduleId -> filePath
  byConceptId: Map<string, string>; // conceptId -> scheduleId
  
  // Status indexes
  byStatus: Map<ReviewStatus, Set<string>>; // status -> scheduleIds
  
  // Date indexes for due schedules
  dueSchedules: Set<string>; // scheduleIds due for review
  overdueSchedules: Map<number, Set<string>>; // daysOverdue -> scheduleIds
  
  // Interval-based indexes
  byInterval: Map<string, Set<string>>; // intervalRange -> scheduleIds
  byEaseFactor: Map<string, Set<string>>; // easeFactorRange -> scheduleIds
  
  // Maintenance tracking
  lastUpdated: Date;
  version: number;
}

/**
 * FileSystem repository implementation
 */
export class FileSystemReviewScheduleRepository implements IReviewScheduleRepository {
  private readonly basePath: string;
  private readonly indexPath: string;
  private readonly backupPath: string;
  private index: ScheduleIndex;
  private indexLoaded = false;
  private readonly indexSemaphore = new Semaphore(1); // Only allow one index save at a time

  constructor(basePath: string) {
    this.basePath = basePath;
    this.indexPath = join(basePath, '.schedule-index.json');
    this.backupPath = join(basePath, '.backups');
    
    this.index = this.createEmptyIndex();
  }

  // ==================== INITIALIZATION ====================

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(this.backupPath, { recursive: true });
  }

  private async ensureIndexLoaded(): Promise<void> {
    if (this.indexLoaded) return;
    
    await this.ensureDirectories();
    await this.loadIndex();
    this.indexLoaded = true;
  }

  private createEmptyIndex(): ScheduleIndex {
    return {
      byId: new Map(),
      byConceptId: new Map(),
      byStatus: new Map(Object.values(ReviewStatus).map(status => [status, new Set()])),
      dueSchedules: new Set(),
      overdueSchedules: new Map(),
      byInterval: new Map(),
      byEaseFactor: new Map(),
      lastUpdated: new Date(),
      version: 1
    };
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(indexData);
      
      // Reconstruct Maps and Sets from serialized data
      this.index = {
        byId: new Map(parsed.byId || []),
        byConceptId: new Map(parsed.byConceptId || []),
        byStatus: new Map(
          Object.entries(parsed.byStatus || {}).map(
            ([status, ids]) => [status as ReviewStatus, new Set(ids as string[])]
          )
        ),
        dueSchedules: new Set(parsed.dueSchedules || []),
        overdueSchedules: new Map(
          Object.entries(parsed.overdueSchedules || {}).map(
            ([days, ids]) => [parseInt(days), new Set(ids as string[])]
          )
        ),
        byInterval: new Map(
          Object.entries(parsed.byInterval || {}).map(
            ([range, ids]) => [range, new Set(ids as string[])]
          )
        ),
        byEaseFactor: new Map(
          Object.entries(parsed.byEaseFactor || {}).map(
            ([range, ids]) => [range, new Set(ids as string[])]
          )
        ),
        lastUpdated: new Date(parsed.lastUpdated || Date.now()),
        version: parsed.version || 1
      };
    } catch (error) {
      // Index doesn't exist or is corrupted - rebuild it
      await this.rebuildIndex();
    }
  }

  private async saveIndex(): Promise<void> {
    await this.indexSemaphore.acquire();
    try {
      const serializable = {
        byId: Array.from(this.index.byId.entries()),
        byConceptId: Array.from(this.index.byConceptId.entries()),
        byStatus: Object.fromEntries(
          Array.from(this.index.byStatus.entries()).map(
            ([status, ids]) => [status, Array.from(ids)]
          )
        ),
        dueSchedules: Array.from(this.index.dueSchedules),
        overdueSchedules: Object.fromEntries(
          Array.from(this.index.overdueSchedules.entries()).map(
            ([days, ids]) => [days.toString(), Array.from(ids)]
          )
        ),
        byInterval: Object.fromEntries(
          Array.from(this.index.byInterval.entries()).map(
            ([range, ids]) => [range, Array.from(ids)]
          )
        ),
        byEaseFactor: Object.fromEntries(
          Array.from(this.index.byEaseFactor.entries()).map(
            ([range, ids]) => [range, Array.from(ids)]
          )
        ),
        lastUpdated: this.index.lastUpdated.toISOString(),
        version: this.index.version
      };

      // Use timestamp to avoid conflicts
      const timestamp = Date.now();
      const tempPath = `${this.indexPath}.${timestamp}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(serializable, null, 2));
      await fs.rename(tempPath, this.indexPath);
    } finally {
      this.indexSemaphore.release();
    }
  }

  // ==================== BASIC CRUD OPERATIONS ====================

  async save(schedule: ReviewSchedule): Promise<void> {
    await this.ensureIndexLoaded();
    
    const filePath = this.getScheduleFilePath(schedule.id);
    const dirPath = dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    
    // Serialize schedule
    const data = JSON.stringify(schedule.toPlainObject(), null, 2);
    
    // Atomic write
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);
    
    // Update index
    this.updateIndexForSchedule(schedule, filePath);
    await this.saveIndex();
  }

  async saveMany(schedules: ReviewSchedule[]): Promise<void> {
    for (const schedule of schedules) {
      await this.save(schedule);
    }
  }

  async findById(id: string): Promise<ReviewSchedule | null> {
    await this.ensureIndexLoaded();
    
    const filePath = this.index.byId.get(id);
    if (!filePath) return null;
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return ReviewSchedule.fromPlainObject(parsed);
    } catch (error) {
      // File corrupted or deleted - remove from index
      this.removeFromIndex(id);
      await this.saveIndex();
      return null;
    }
  }

  async findByConceptId(conceptId: string): Promise<ReviewSchedule | null> {
    await this.ensureIndexLoaded();
    
    const scheduleId = this.index.byConceptId.get(conceptId);
    if (!scheduleId) return null;
    
    return await this.findById(scheduleId);
  }

  async exists(id: string): Promise<boolean> {
    await this.ensureIndexLoaded();
    return this.index.byId.has(id);
  }

  async delete(scheduleId: string): Promise<void> {
    await this.ensureIndexLoaded();
    
    const filePath = this.index.byId.get(scheduleId);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File already deleted - not an error
      }
    }
    
    this.removeFromIndex(scheduleId);
    await this.saveIndex();
  }

  async deleteByConceptId(conceptId: string): Promise<void> {
    const scheduleId = this.index.byConceptId.get(conceptId);
    if (scheduleId) {
      await this.delete(scheduleId);
    }
  }

  // ==================== QUERY OPERATIONS ====================

  async findDueReviews(query: DueReviewsQuery = {}): Promise<ReviewSchedule[]> {
    await this.ensureIndexLoaded();
    
    const {
      limit = 20,
      conceptIds,
      folderIds,
      includeOverdue = true,
      maxOverdueDays
    } = query;
    
    let candidateIds = new Set(this.index.dueSchedules);
    
    if (includeOverdue) {
      // Add overdue schedules
      for (const [days, scheduleIds] of this.index.overdueSchedules.entries()) {
        if (!maxOverdueDays || days <= maxOverdueDays) {
          scheduleIds.forEach(id => candidateIds.add(id));
        }
      }
    }
    
    // Filter by concept IDs if specified
    if (conceptIds) {
      const conceptIdSet = new Set(conceptIds);
      candidateIds = new Set(
        Array.from(candidateIds).filter(id => {
          const schedule = this.getScheduleFromMemory(id);
          return schedule && conceptIdSet.has(schedule.conceptId);
        })
      );
    }
    
    // TODO: Filter by folder IDs (requires concept -> folder mapping)
    
    // Load and return schedules
    const results: ReviewSchedule[] = [];
    const ids = Array.from(candidateIds).slice(0, limit);
    
    for (const id of ids) {
      const schedule = await this.findById(id);
      if (schedule && schedule.isDue()) {
        results.push(schedule);
      }
    }
    
    // Sort by priority (learning cards first, then by due date)
    return results.sort((a, b) => {
      if (a.status === ReviewStatus.LEARNING && b.status !== ReviewStatus.LEARNING) return -1;
      if (b.status === ReviewStatus.LEARNING && a.status !== ReviewStatus.LEARNING) return 1;
      
      return a.timing.nextReviewDate.getTime() - b.timing.nextReviewDate.getTime();
    });
  }

  async findByQuery(query: ScheduleQuery): Promise<ReviewSchedule[]> {
    await this.ensureIndexLoaded();
    
    const {
      status,
      folderId,
      minRepetitions,
      maxRepetitions,
      minInterval,
      maxInterval,
      limit = 100,
      offset = 0
    } = query;
    
    let candidateIds: Set<string>;
    
    // Start with status filter if provided
    if (status) {
      candidateIds = new Set(this.index.byStatus.get(status) || []);
    } else {
      candidateIds = new Set(this.index.byId.keys());
    }
    
    // Apply additional filters
    const filteredIds = Array.from(candidateIds).filter(id => {
      const schedule = this.getScheduleFromMemory(id);
      if (!schedule) return false;
      
      if (minRepetitions !== undefined && schedule.parameters.repetitions < minRepetitions) return false;
      if (maxRepetitions !== undefined && schedule.parameters.repetitions > maxRepetitions) return false;
      if (minInterval !== undefined && schedule.parameters.interval < minInterval) return false;
      if (maxInterval !== undefined && schedule.parameters.interval > maxInterval) return false;
      
      return true;
    });
    
    // Apply pagination
    const paginatedIds = filteredIds.slice(offset, offset + limit);
    
    // Load schedules
    const results: ReviewSchedule[] = [];
    for (const id of paginatedIds) {
      const schedule = await this.findById(id);
      if (schedule) {
        results.push(schedule);
      }
    }
    
    return results;
  }

  async findByFolderId(folderId: string): Promise<ReviewSchedule[]> {
    // TODO: Implement folder ID mapping
    // This would require tracking which concepts belong to which folders
    return [];
  }

  async findByStatus(status: ReviewStatus, limit?: number): Promise<ReviewSchedule[]> {
    await this.ensureIndexLoaded();
    
    const scheduleIds = Array.from(this.index.byStatus.get(status) || []);
    const limitedIds = limit ? scheduleIds.slice(0, limit) : scheduleIds;
    
    const results: ReviewSchedule[] = [];
    for (const id of limitedIds) {
      const schedule = await this.findById(id);
      if (schedule) {
        results.push(schedule);
      }
    }
    
    return results;
  }

  async findOverdue(daysOverdue: number, limit?: number): Promise<ReviewSchedule[]> {
    await this.ensureIndexLoaded();
    
    const overdueIds = new Set<string>();
    
    // Collect IDs from all overdue buckets >= daysOverdue
    for (const [days, scheduleIds] of this.index.overdueSchedules.entries()) {
      if (days >= daysOverdue) {
        scheduleIds.forEach(id => overdueIds.add(id));
      }
    }
    
    const limitedIds = limit ? Array.from(overdueIds).slice(0, limit) : Array.from(overdueIds);
    
    const results: ReviewSchedule[] = [];
    for (const id of limitedIds) {
      const schedule = await this.findById(id);
      if (schedule && schedule.isOverdue(daysOverdue)) {
        results.push(schedule);
      }
    }
    
    return results;
  }

  async findLeeches(limit?: number): Promise<ReviewSchedule[]> {
    return await this.findByStatus(ReviewStatus.LEECH, limit);
  }

  async findMature(limit?: number): Promise<ReviewSchedule[]> {
    return await this.findByStatus(ReviewStatus.MATURE, limit);
  }

  // ==================== COUNTING AND STATISTICS ====================

  async count(): Promise<number> {
    await this.ensureIndexLoaded();
    return this.index.byId.size;
  }

  async countDueReviews(): Promise<number> {
    await this.ensureIndexLoaded();
    
    let count = this.index.dueSchedules.size;
    
    // Add overdue counts
    for (const scheduleIds of this.index.overdueSchedules.values()) {
      count += scheduleIds.size;
    }
    
    return count;
  }

  async countByStatus(status: ReviewStatus): Promise<number> {
    await this.ensureIndexLoaded();
    return this.index.byStatus.get(status)?.size || 0;
  }

  async countByFolderId(folderId: string): Promise<number> {
    // TODO: Implement folder counting
    return 0;
  }

  async getStatistics(): Promise<ScheduleStatistics> {
    await this.ensureIndexLoaded();
    
    const stats: ScheduleStatistics = {
      totalSchedules: await this.count(),
      newCount: await this.countByStatus(ReviewStatus.NEW),
      learningCount: await this.countByStatus(ReviewStatus.LEARNING),
      reviewingCount: await this.countByStatus(ReviewStatus.REVIEWING),
      matureCount: await this.countByStatus(ReviewStatus.MATURE),
      suspendedCount: await this.countByStatus(ReviewStatus.SUSPENDED),
      leechCount: await this.countByStatus(ReviewStatus.LEECH),
      dueCount: await this.countDueReviews(),
      overdueCount: 0,
      averageEaseFactor: 0,
      averageInterval: 0
    };
    
    // Calculate overdue count
    for (const scheduleIds of this.index.overdueSchedules.values()) {
      stats.overdueCount += scheduleIds.size;
    }
    
    // Calculate averages
    let totalEase = 0;
    let totalInterval = 0;
    let count = 0;
    
    for (const scheduleId of this.index.byId.keys()) {
      const schedule = this.getScheduleFromMemory(scheduleId);
      if (schedule) {
        totalEase += schedule.parameters.easinessFactor;
        totalInterval += schedule.parameters.interval;
        count++;
      }
    }
    
    if (count > 0) {
      stats.averageEaseFactor = totalEase / count;
      stats.averageInterval = totalInterval / count;
    }
    
    return stats;
  }

  // ==================== CALENDAR AND PLANNING ====================

  async getReviewCalendar(days: number): Promise<ReviewCalendarEntry[]> {
    const calendar: ReviewCalendarEntry[] = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const entry: ReviewCalendarEntry = {
        date,
        dueCount: 0,
        newCount: 0,
        learningCount: 0,
        reviewingCount: 0,
        matureCount: 0
      };
      
      const schedulesForDate = await this.getSchedulesForDate(date);
      
      for (const schedule of schedulesForDate) {
        entry.dueCount++;
        
        switch (schedule.status) {
          case ReviewStatus.NEW:
            entry.newCount++;
            break;
          case ReviewStatus.LEARNING:
            entry.learningCount++;
            break;
          case ReviewStatus.REVIEWING:
            entry.reviewingCount++;
            break;
          case ReviewStatus.MATURE:
            entry.matureCount++;
            break;
        }
      }
      
      calendar.push(entry);
    }
    
    return calendar;
  }

  async getSchedulesForDate(date: Date): Promise<ReviewSchedule[]> {
    await this.ensureIndexLoaded();
    
    const results: ReviewSchedule[] = [];
    const targetDate = new Date(date);
    targetDate.setHours(23, 59, 59, 999); // End of day
    
    for (const scheduleId of this.index.byId.keys()) {
      const schedule = await this.findById(scheduleId);
      if (schedule) {
        const nextReview = schedule.timing.nextReviewDate;
        if (nextReview <= targetDate) {
          results.push(schedule);
        }
      }
    }
    
    return results;
  }

  async estimateDailyWorkload(days: number): Promise<number> {
    const calendar = await this.getReviewCalendar(days);
    const totalReviews = calendar.reduce((sum, entry) => sum + entry.dueCount, 0);
    return Math.round(totalReviews / days);
  }

  // ==================== MAINTENANCE OPERATIONS ====================

  async updateMany(schedules: ReviewSchedule[]): Promise<void> {
    for (const schedule of schedules) {
      await this.save(schedule);
    }
  }

  async suspendByConceptId(conceptId: string): Promise<void> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      schedule.suspend();
      await this.save(schedule);
    }
  }

  async resumeByConceptId(conceptId: string): Promise<void> {
    const schedule = await this.findByConceptId(conceptId);
    if (schedule) {
      schedule.resume();
      await this.save(schedule);
    }
  }

  async suspendByFolderId(folderId: string): Promise<void> {
    const schedules = await this.findByFolderId(folderId);
    for (const schedule of schedules) {
      schedule.suspend();
      await this.save(schedule);
    }
  }

  async resumeByFolderId(folderId: string): Promise<void> {
    const schedules = await this.findByFolderId(folderId);
    for (const schedule of schedules) {
      schedule.resume();
      await this.save(schedule);
    }
  }

  async resetAbandoned(daysSinceLastReview: number): Promise<number> {
    await this.ensureIndexLoaded();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastReview);
    
    let resetCount = 0;
    
    for (const scheduleId of this.index.byId.keys()) {
      const schedule = await this.findById(scheduleId);
      if (schedule && schedule.timing.lastReviewDate) {
        if (schedule.timing.lastReviewDate < cutoffDate) {
          // Reset to new state
          const newSchedule = ReviewSchedule.createNew(schedule.conceptId);
          await this.save(newSchedule);
          resetCount++;
        }
      }
    }
    
    return resetCount;
  }

  async cleanupOrphaned(validConceptIds: string[]): Promise<number> {
    await this.ensureIndexLoaded();
    
    const validSet = new Set(validConceptIds);
    let cleanedCount = 0;
    
    const scheduleIds = Array.from(this.index.byId.keys());
    
    for (const scheduleId of scheduleIds) {
      const schedule = await this.findById(scheduleId);
      if (schedule && !validSet.has(schedule.conceptId)) {
        await this.delete(scheduleId);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  // ==================== BULK OPERATIONS ====================

  async createInitialSchedules(conceptIds: string[]): Promise<void> {
    const schedules = conceptIds.map(conceptId => ReviewSchedule.createNew(conceptId));
    await this.saveMany(schedules);
  }

  async exportSchedules(conceptIds?: string[]): Promise<Record<string, any>[]> {
    await this.ensureIndexLoaded();
    
    const scheduleIds = conceptIds 
      ? conceptIds.map(id => this.index.byConceptId.get(id)).filter(Boolean) as string[]
      : Array.from(this.index.byId.keys());
    
    const exported: Record<string, any>[] = [];
    
    for (const scheduleId of scheduleIds) {
      const schedule = await this.findById(scheduleId);
      if (schedule) {
        exported.push(schedule.toPlainObject());
      }
    }
    
    return exported;
  }

  async importSchedules(data: Record<string, any>[]): Promise<void> {
    const schedules = data.map(obj => ReviewSchedule.fromPlainObject(obj));
    await this.saveMany(schedules);
  }

  // ==================== ANALYTICS QUERIES ====================

  async getEaseFactorDistribution(): Promise<{ easeFactor: number; count: number }[]> {
    const distribution = new Map<number, number>();
    
    for (const [range, scheduleIds] of this.index.byEaseFactor.entries()) {
      const easeFactor = parseFloat(range);
      distribution.set(easeFactor, scheduleIds.size);
    }
    
    return Array.from(distribution.entries()).map(([easeFactor, count]) => ({
      easeFactor,
      count
    }));
  }

  async getIntervalDistribution(): Promise<{ intervalRange: string; count: number }[]> {
    return Array.from(this.index.byInterval.entries()).map(([intervalRange, scheduleIds]) => ({
      intervalRange,
      count: scheduleIds.size
    }));
  }

  async getSuccessRatesByFolder(): Promise<{ folderId: string; successRate: number }[]> {
    // TODO: Implement folder-based success rates
    return [];
  }

  async findProblematicConcepts(limit: number = 10): Promise<{
    conceptId: string;
    easeFactor: number;
    consecutiveIncorrect: number;
    lastReviewDate: Date | null;
  }[]> {
    await this.ensureIndexLoaded();
    
    const problematic: Array<{
      conceptId: string;
      easeFactor: number;
      consecutiveIncorrect: number;
      lastReviewDate: Date | null;
    }> = [];
    
    for (const scheduleId of this.index.byId.keys()) {
      const schedule = await this.findById(scheduleId);
      if (schedule) {
        const hasLowEase = schedule.parameters.easinessFactor < 2.0;
        const hasFailures = schedule.consecutiveIncorrect > 0;
        
        if (hasLowEase || hasFailures) {
          problematic.push({
            conceptId: schedule.conceptId,
            easeFactor: schedule.parameters.easinessFactor,
            consecutiveIncorrect: schedule.consecutiveIncorrect,
            lastReviewDate: schedule.timing.lastReviewDate
          });
        }
      }
    }
    
    // Sort by severity (low ease + failures)
    problematic.sort((a, b) => {
      const severityA = (2.5 - a.easeFactor) + (a.consecutiveIncorrect * 0.1);
      const severityB = (2.5 - b.easeFactor) + (b.consecutiveIncorrect * 0.1);
      return severityB - severityA;
    });
    
    return problematic.slice(0, limit);
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private getScheduleFilePath(scheduleId: string): string {
    // Organize files in subdirectories to avoid too many files in one directory
    const prefix = scheduleId.substring(0, 2);
    return join(this.basePath, 'schedules', prefix, `${scheduleId}.json`);
  }

  private updateIndexForSchedule(schedule: ReviewSchedule, filePath: string): void {
    const scheduleId = schedule.id;
    
    // Remove old entries
    this.removeFromIndex(scheduleId);
    
    // Add new entries
    this.index.byId.set(scheduleId, filePath);
    this.index.byConceptId.set(schedule.conceptId, scheduleId);
    
    // Update status index
    this.index.byStatus.get(schedule.status)?.add(scheduleId);
    
    // Update due/overdue indexes
    if (schedule.isDue()) {
      if (schedule.isOverdue()) {
        const daysOverdue = schedule.timing.getDaysOverdue();
        if (!this.index.overdueSchedules.has(daysOverdue)) {
          this.index.overdueSchedules.set(daysOverdue, new Set());
        }
        this.index.overdueSchedules.get(daysOverdue)!.add(scheduleId);
      } else {
        this.index.dueSchedules.add(scheduleId);
      }
    }
    
    // Update ease factor index
    const easeRange = this.getEaseFactorRange(schedule.parameters.easinessFactor);
    if (!this.index.byEaseFactor.has(easeRange)) {
      this.index.byEaseFactor.set(easeRange, new Set());
    }
    this.index.byEaseFactor.get(easeRange)!.add(scheduleId);
    
    // Update interval index
    const intervalRange = this.getIntervalRange(schedule.parameters.interval);
    if (!this.index.byInterval.has(intervalRange)) {
      this.index.byInterval.set(intervalRange, new Set());
    }
    this.index.byInterval.get(intervalRange)!.add(scheduleId);
    
    this.index.lastUpdated = new Date();
    this.index.version++;
  }

  private removeFromIndex(scheduleId: string): void {
    const filePath = this.index.byId.get(scheduleId);
    if (!filePath) return;
    
    // Find concept ID
    let conceptId: string | undefined;
    for (const [cId, sId] of this.index.byConceptId.entries()) {
      if (sId === scheduleId) {
        conceptId = cId;
        break;
      }
    }
    
    // Remove from all indexes
    this.index.byId.delete(scheduleId);
    if (conceptId) {
      this.index.byConceptId.delete(conceptId);
    }
    
    // Remove from status indexes
    for (const scheduleSet of this.index.byStatus.values()) {
      scheduleSet.delete(scheduleId);
    }
    
    // Remove from due/overdue indexes
    this.index.dueSchedules.delete(scheduleId);
    for (const scheduleSet of this.index.overdueSchedules.values()) {
      scheduleSet.delete(scheduleId);
    }
    
    // Remove from other indexes
    for (const scheduleSet of this.index.byEaseFactor.values()) {
      scheduleSet.delete(scheduleId);
    }
    for (const scheduleSet of this.index.byInterval.values()) {
      scheduleSet.delete(scheduleId);
    }
  }

  private getEaseFactorRange(easeFactor: number): string {
    if (easeFactor < 1.5) return '1.3-1.5';
    if (easeFactor < 2.0) return '1.5-2.0';
    if (easeFactor < 2.5) return '2.0-2.5';
    return '2.5+';
  }

  private getIntervalRange(interval: number): string {
    if (interval <= 1) return '1-day';
    if (interval <= 7) return '2-7-days';
    if (interval <= 21) return '1-3-weeks';
    if (interval <= 90) return '1-3-months';
    return '3+ months';
  }

  private getScheduleFromMemory(scheduleId: string): ReviewSchedule | null {
    // TODO: Implement in-memory cache for better performance
    return null;
  }

  private async rebuildIndex(): Promise<void> {
    this.index = this.createEmptyIndex();
    
    try {
      const schedulesDir = join(this.basePath, 'schedules');
      await this.indexDirectory(schedulesDir);
    } catch (error) {
      // Directory doesn't exist yet - that's okay
    }
    
    await this.saveIndex();
  }

  private async indexDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.indexDirectory(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const data = await fs.readFile(fullPath, 'utf-8');
            const parsed = JSON.parse(data);
            const schedule = ReviewSchedule.fromPlainObject(parsed);
            this.updateIndexForSchedule(schedule, fullPath);
          } catch (error) {
            // Skip corrupted files
            console.warn(`Skipping corrupted schedule file: ${fullPath}`);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist - skip
    }
  }
}