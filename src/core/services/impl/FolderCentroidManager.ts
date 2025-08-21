/**
 * FolderCentroidManager - Production Implementation
 * 
 * Manages folder centroids and exemplars for intelligent context filtering.
 * Provides efficient vector operations for the intelligent folder system.
 */

import {
  IFolderCentroidManager,
  FolderCentroid,
  CentroidQuality,
  FolderSimilarity,
  FilteredFolderContext,
  FolderContextInfo,
  ConceptSample,
  CentroidUpdateRequest,
  BatchCentroidUpdate,
  ExemplarStrategy,
  CentroidStatistics,
  CentroidManagerConfig,
  CentroidError,
  InsufficientDataError,
  CentroidCalculationError,
  ContextFilteringError
} from '../IFolderCentroidManager';
import { IVectorIndexManager, FolderVectorData } from '../IVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CentroidManagerConfig = {
  defaultExemplarCount: 5,
  exemplarStrategy: 'hybrid',
  minimumCohesion: 0.3,
  minimumSeparation: 0.2,
  staleThresholdDays: 7,
  batchSize: 10,
  parallelUpdates: 3,
  incrementalUpdateThreshold: 10,
  maxContextFolders: 10,
  minFolderSimilarity: 0.5,
  tokenEstimatePerFolder: 50,
  similarityMetric: 'cosine',
  exemplarWeight: 0.3
};

/**
 * Production implementation of folder centroid management
 */
export class FolderCentroidManager implements IFolderCentroidManager {
  private readonly config: CentroidManagerConfig;
  private readonly centroidCache = new Map<string, FolderCentroid>();
  private readonly similarityCache = new Map<string, number>();
  private lastCacheUpdate = new Date();

  constructor(
    private readonly vectorIndex: IVectorIndexManager,
    config?: Partial<CentroidManagerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async updateFolderCentroid(request: CentroidUpdateRequest): Promise<FolderCentroid> {
    const { folderId, newConcepts, removedConcepts, forceRecalculation } = request;

    try {
      // Determine if we should use incremental update
      const useIncremental = !forceRecalculation && 
        ((newConcepts?.length || 0) + (removedConcepts?.length || 0)) < this.config.incrementalUpdateThreshold;

      let centroid: number[];
      let memberCount: number;

      if (useIncremental && !forceRecalculation) {
        // Incremental update
        const existing = await this.getFolderCentroid(folderId);
        if (!existing) {
          // No existing centroid, do full calculation
          return this.calculateFullCentroid(folderId);
        }

        centroid = await this.incrementalCentroidUpdate(
          existing.centroid,
          existing.memberCount,
          newConcepts,
          removedConcepts
        );
        memberCount = existing.memberCount + (newConcepts?.length || 0) - (removedConcepts?.length || 0);
      } else {
        // Full recalculation
        return this.calculateFullCentroid(folderId);
      }

      // Select exemplars
      const exemplars = await this.selectFolderExemplars(folderId, this.config.defaultExemplarCount);

      // Update in vector index
      await this.vectorIndex.setFolderCentroid(folderId, centroid);
      await this.vectorIndex.setFolderExemplars(folderId, exemplars.map(e => e.vector));

      // Calculate quality
      const quality = await this.calculateCentroidQuality(folderId);

      // Create result
      const result: FolderCentroid = {
        folderId,
        centroid,
        exemplars: exemplars.map(e => e.vector),
        memberCount,
        lastUpdated: new Date(),
        quality
      };

      // Update cache
      this.centroidCache.set(folderId, result);

      return result;
    } catch (error) {
      throw new CentroidCalculationError(
        folderId,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  async batchUpdateCentroids(
    folderIds: string[],
    forceRecalculation?: boolean
  ): Promise<BatchCentroidUpdate> {
    const startTime = Date.now();
    const updated: string[] = [];
    const failed: Array<{folderId: string; error: string}> = [];
    let totalQuality = 0;

    // Process in batches for efficiency
    for (let i = 0; i < folderIds.length; i += this.config.batchSize) {
      const batch = folderIds.slice(i, i + this.config.batchSize);
      
      // Process batch in parallel with concurrency limit
      const promises = batch.map(async (folderId) => {
        try {
          const centroid = await this.updateFolderCentroid({
            folderId,
            forceRecalculation
          });
          updated.push(folderId);
          totalQuality += centroid.quality.overall;
        } catch (error) {
          failed.push({
            folderId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.all(promises);
    }

    return {
      updated,
      failed,
      totalTime: Date.now() - startTime,
      averageQuality: updated.length > 0 ? totalQuality / updated.length : 0
    };
  }

  async getFolderCentroid(folderId: string): Promise<FolderCentroid | null> {
    // Check cache first
    if (this.centroidCache.has(folderId)) {
      return this.centroidCache.get(folderId)!;
    }

    // Load from vector index
    const vectorData = await this.vectorIndex.getFolderVectorData(folderId);
    if (!vectorData) {
      return null;
    }

    // Calculate quality
    const quality = await this.calculateCentroidQuality(folderId);

    const centroid: FolderCentroid = {
      folderId,
      centroid: vectorData.centroid,
      exemplars: vectorData.exemplars,
      memberCount: vectorData.memberCount,
      lastUpdated: vectorData.lastUpdated,
      quality
    };

    // Update cache
    this.centroidCache.set(folderId, centroid);

    return centroid;
  }

  async findSimilarFolders(
    vector: number[],
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<FolderSimilarity[]> {
    const similarities: FolderSimilarity[] = [];

    // Get all folder centroids
    // TODO: This should be optimized with vector search in production
    const allFolders = await this.getAllFolderIds();
    
    for (const folderId of allFolders) {
      const centroid = await this.getFolderCentroid(folderId);
      if (!centroid) continue;

      // Calculate centroid similarity
      const centroidSim = this.calculateSimilarity(vector, centroid.centroid);
      
      // Calculate exemplar similarity (max similarity to any exemplar)
      let exemplarSim = 0;
      for (const exemplar of centroid.exemplars) {
        const sim = this.calculateSimilarity(vector, exemplar);
        exemplarSim = Math.max(exemplarSim, sim);
      }

      // Weighted combination
      const combinedSim = (1 - this.config.exemplarWeight) * centroidSim + 
                          this.config.exemplarWeight * exemplarSim;

      if (combinedSim >= threshold) {
        similarities.push({
          folderId,
          similarity: combinedSim,
          centroidSimilarity: centroidSim,
          exemplarSimilarity: exemplarSim,
          memberCount: centroid.memberCount
        });
      }
    }

    // Sort by similarity and limit
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, limit);
  }

  async filterFolderContext(
    conceptVector: number[],
    maxTokens: number,
    systemState: 'bootstrap' | 'growing' | 'mature'
  ): Promise<FilteredFolderContext> {
    try {
      // Get similar folders
      const similarFolders = await this.findSimilarFolders(
        conceptVector,
        this.config.maxContextFolders * 2, // Get more than needed for filtering
        this.config.minFolderSimilarity
      );

      // Determine how many folders to include based on system state
      let targetFolderCount: number;
      switch (systemState) {
        case 'bootstrap':
          targetFolderCount = Math.min(5, similarFolders.length); // All folders in bootstrap
          break;
        case 'growing':
          targetFolderCount = Math.min(10, similarFolders.length); // Up to 10 in growing
          break;
        case 'mature':
          targetFolderCount = Math.min(this.config.maxContextFolders, similarFolders.length);
          break;
      }

      // Calculate token budget per folder
      const tokensPerFolder = Math.floor(maxTokens / targetFolderCount);
      const conceptsPerFolder = Math.floor(tokensPerFolder / 20); // Estimate 20 tokens per concept sample

      // Build context for selected folders
      const relevantFolders: FolderContextInfo[] = [];
      let estimatedTokens = 0;

      for (let i = 0; i < targetFolderCount && i < similarFolders.length; i++) {
        const folder = similarFolders[i];
        const centroid = await this.getFolderCentroid(folder.folderId);
        if (!centroid) continue;

        // Get sample concepts for this folder
        const sampleConcepts = await this.getSampleConcepts(
          folder.folderId,
          conceptsPerFolder,
          conceptVector
        );

        const folderInfo: FolderContextInfo = {
          folderId: folder.folderId,
          name: `Folder ${folder.folderId}`, // TODO: Get real folder name
          path: `/folder/${folder.folderId}`, // TODO: Get real path
          similarity: folder.similarity,
          conceptCount: centroid.memberCount,
          sampleConcepts,
          centroidQuality: centroid.quality
        };

        relevantFolders.push(folderInfo);
        estimatedTokens += this.estimateTokensForFolder(folderInfo);
      }

      return {
        relevantFolders,
        totalFolders: similarFolders.length,
        filteringMethod: systemState === 'bootstrap' ? 'similarity' : 'hybrid',
        estimatedTokens
      };
    } catch (error) {
      throw new ContextFilteringError(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  async selectFolderExemplars(
    folderId: string,
    count: number = 5,
    strategy: ExemplarStrategy = 'hybrid'
  ): Promise<Array<{conceptId: string; vector: number[]}>> {
    // Get all folder members
    const members = await this.vectorIndex.getFolderMembers(folderId);
    
    if (members.length === 0) {
      return [];
    }

    if (members.length <= count) {
      return members;
    }

    // Select exemplars based on strategy
    switch (strategy) {
      case 'diverse':
        return this.selectDiverseExemplars(members, count);
      case 'boundary':
        return this.selectBoundaryExemplars(members, count);
      case 'medoid':
        return this.selectMedoidExemplars(members, count);
      case 'hybrid':
      default:
        return this.selectHybridExemplars(members, count);
    }
  }

  async calculateCentroidQuality(folderId: string): Promise<CentroidQuality> {
    const centroidData = await this.vectorIndex.getFolderVectorData(folderId);
    if (!centroidData) {
      throw new CentroidError(`No centroid data for folder ${folderId}`);
    }

    const members = await this.vectorIndex.getFolderMembers(folderId);
    if (members.length < 2) {
      // Not enough members for meaningful quality metrics
      return {
        cohesion: 1.0,
        separation: 1.0,
        stability: 1.0,
        overall: 1.0
      };
    }

    // Calculate cohesion (average similarity within folder)
    let totalCohesion = 0;
    for (const member of members) {
      const sim = this.calculateSimilarity(member.vector, centroidData.centroid);
      totalCohesion += sim;
    }
    const cohesion = totalCohesion / members.length;

    // Calculate separation (simplified - would need other folder centroids)
    // For now, use a heuristic based on cohesion
    const separation = Math.max(0.2, 1.0 - cohesion);

    // Calculate stability (simplified - would need historical data)
    const daysSinceUpdate = (Date.now() - centroidData.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    const stability = Math.max(0.5, 1.0 - (daysSinceUpdate / this.config.staleThresholdDays));

    // Overall quality
    const overall = (cohesion * 0.5 + separation * 0.3 + stability * 0.2);

    return {
      cohesion,
      separation,
      stability,
      overall
    };
  }

  async findStalecentroids(
    staleDays: number = 7,
    qualityThreshold: number = 0.5
  ): Promise<string[]> {
    const staleFolders: string[] = [];
    const allFolders = await this.getAllFolderIds();
    const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    for (const folderId of allFolders) {
      const centroid = await this.getFolderCentroid(folderId);
      if (!centroid) {
        staleFolders.push(folderId);
        continue;
      }

      if (centroid.lastUpdated < cutoffDate || centroid.quality.overall < qualityThreshold) {
        staleFolders.push(folderId);
      }
    }

    return staleFolders;
  }

  async calculateFolderSimilarityMatrix(
    folderIds?: string[]
  ): Promise<Map<string, Map<string, number>>> {
    const folders = folderIds || await this.getAllFolderIds();
    const matrix = new Map<string, Map<string, number>>();

    for (const folder1 of folders) {
      const row = new Map<string, number>();
      const centroid1 = await this.getFolderCentroid(folder1);
      
      if (!centroid1) continue;

      for (const folder2 of folders) {
        if (folder1 === folder2) {
          row.set(folder2, 1.0);
          continue;
        }

        const centroid2 = await this.getFolderCentroid(folder2);
        if (!centroid2) {
          row.set(folder2, 0);
          continue;
        }

        const similarity = this.calculateSimilarity(centroid1.centroid, centroid2.centroid);
        row.set(folder2, similarity);
      }

      matrix.set(folder1, row);
    }

    return matrix;
  }

  async detectRedundantFolders(
    similarityThreshold: number = 0.85
  ): Promise<Array<{folder1: string; folder2: string; similarity: number}>> {
    const redundant: Array<{folder1: string; folder2: string; similarity: number}> = [];
    const matrix = await this.calculateFolderSimilarityMatrix();
    const processed = new Set<string>();

    for (const [folder1, similarities] of matrix) {
      for (const [folder2, similarity] of similarities) {
        if (folder1 === folder2) continue;
        
        // Avoid duplicate pairs
        const pair = [folder1, folder2].sort().join('-');
        if (processed.has(pair)) continue;
        processed.add(pair);

        if (similarity >= similarityThreshold) {
          redundant.push({ folder1, folder2, similarity });
        }
      }
    }

    return redundant.sort((a, b) => b.similarity - a.similarity);
  }

  async initializeCentroids(
    folders: Array<{folderId: string; conceptIds: string[]}>
  ): Promise<BatchCentroidUpdate> {
    const folderIds = folders.map(f => f.folderId);
    return this.batchUpdateCentroids(folderIds, true);
  }

  async getStatistics(): Promise<CentroidStatistics> {
    const allFolders = await this.getAllFolderIds();
    let totalQuality = 0;
    let totalCohesion = 0;
    let totalSeparation = 0;
    let foldersWithCentroids = 0;
    let lastUpdate = new Date(0);

    for (const folderId of allFolders) {
      const centroid = await this.getFolderCentroid(folderId);
      if (centroid) {
        foldersWithCentroids++;
        totalQuality += centroid.quality.overall;
        totalCohesion += centroid.quality.cohesion;
        totalSeparation += centroid.quality.separation;
        if (centroid.lastUpdated > lastUpdate) {
          lastUpdate = centroid.lastUpdated;
        }
      }
    }

    const staleFolders = await this.findStalecentroids();

    return {
      totalFolders: allFolders.length,
      foldersWithCentroids,
      averageQuality: foldersWithCentroids > 0 ? totalQuality / foldersWithCentroids : 0,
      averageCohesion: foldersWithCentroids > 0 ? totalCohesion / foldersWithCentroids : 0,
      averageSeparation: foldersWithCentroids > 0 ? totalSeparation / foldersWithCentroids : 0,
      lastUpdateTime: lastUpdate,
      staleCount: staleFolders.length
    };
  }

  // Private helper methods

  private async calculateFullCentroid(folderId: string): Promise<FolderCentroid> {
    const members = await this.vectorIndex.getFolderMembers(folderId);
    
    if (members.length === 0) {
      throw new InsufficientDataError(folderId, 0, 1);
    }

    // Calculate centroid as average of all vectors
    const dimensions = members[0].vector.length;
    const centroid = new Array(dimensions).fill(0);

    for (const member of members) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += member.vector[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= members.length;
    }

    // Normalize centroid
    const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] /= magnitude;
      }
    }

    // Select exemplars
    const exemplars = await this.selectFolderExemplars(folderId, this.config.defaultExemplarCount);

    // Update in vector index
    await this.vectorIndex.setFolderCentroid(folderId, centroid);
    await this.vectorIndex.setFolderExemplars(folderId, exemplars.map(e => e.vector));

    // Calculate quality
    const quality = await this.calculateCentroidQuality(folderId);

    return {
      folderId,
      centroid,
      exemplars: exemplars.map(e => e.vector),
      memberCount: members.length,
      lastUpdated: new Date(),
      quality
    };
  }

  private async incrementalCentroidUpdate(
    oldCentroid: number[],
    oldCount: number,
    newConcepts?: Array<{conceptId: string; embeddings: VectorEmbeddings}>,
    removedConcepts?: string[]
  ): Promise<number[]> {
    const dimensions = oldCentroid.length;
    const centroid = [...oldCentroid];
    let count = oldCount;

    // Scale back to sum
    for (let i = 0; i < dimensions; i++) {
      centroid[i] *= oldCount;
    }

    // Add new concepts
    if (newConcepts) {
      for (const concept of newConcepts) {
        for (let i = 0; i < dimensions; i++) {
          centroid[i] += concept.embeddings.vector[i];
        }
        count++;
      }
    }

    // Remove concepts (approximate - would need actual vectors)
    if (removedConcepts) {
      // For removed concepts, we'd need their vectors
      // This is a limitation of incremental update
      // For now, just adjust count
      count -= removedConcepts.length;
    }

    // Average and normalize
    if (count > 0) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] /= count;
      }

      const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < dimensions; i++) {
          centroid[i] /= magnitude;
        }
      }
    }

    return centroid;
  }

  private calculateSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vector dimension mismatch');
    }

    switch (this.config.similarityMetric) {
      case 'cosine':
        return this.cosineSimilarity(vector1, vector2);
      case 'euclidean':
        return this.euclideanSimilarity(vector1, vector2);
      case 'dot':
        return this.dotProduct(vector1, vector2);
      default:
        return this.cosineSimilarity(vector1, vector2);
    }
  }

  private cosineSimilarity(vector1: number[], vector2: number[]): number {
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  private euclideanSimilarity(vector1: number[], vector2: number[]): number {
    let sumSquares = 0;
    for (let i = 0; i < vector1.length; i++) {
      const diff = vector1[i] - vector2[i];
      sumSquares += diff * diff;
    }
    const distance = Math.sqrt(sumSquares);
    // Convert distance to similarity (0-1 range)
    return 1 / (1 + distance);
  }

  private dotProduct(vector1: number[], vector2: number[]): number {
    let product = 0;
    for (let i = 0; i < vector1.length; i++) {
      product += vector1[i] * vector2[i];
    }
    return Math.max(0, Math.min(1, product)); // Clamp to [0, 1]
  }

  private async getAllFolderIds(): Promise<string[]> {
    // TODO: This should be implemented properly with database query
    // For now, return empty array
    return [];
  }

  private async getSampleConcepts(
    folderId: string,
    count: number,
    referenceVector: number[]
  ): Promise<ConceptSample[]> {
    // TODO: Get actual concept samples from the folder
    // For now, return empty array
    return [];
  }

  private estimateTokensForFolder(folder: FolderContextInfo): number {
    // Estimate: folder name/path (10) + metadata (10) + samples (20 per sample)
    return 20 + folder.sampleConcepts.length * 20;
  }

  private selectDiverseExemplars(
    members: Array<{conceptId: string; vector: number[]}>,
    count: number
  ): Array<{conceptId: string; vector: number[]}> {
    // Greedy diverse selection: maximize minimum distance
    const selected: Array<{conceptId: string; vector: number[]}> = [];
    const remaining = [...members];

    // Start with random point
    const firstIndex = Math.floor(Math.random() * remaining.length);
    selected.push(remaining[firstIndex]);
    remaining.splice(firstIndex, 1);

    while (selected.length < count && remaining.length > 0) {
      let maxMinDist = -1;
      let bestIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        let minDist = Infinity;
        for (const s of selected) {
          const dist = 1 - this.calculateSimilarity(remaining[i].vector, s.vector);
          minDist = Math.min(minDist, dist);
        }
        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        selected.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
      }
    }

    return selected;
  }

  private selectBoundaryExemplars(
    members: Array<{conceptId: string; vector: number[]}>,
    count: number
  ): Array<{conceptId: string; vector: number[]}> {
    // Select points farthest from centroid
    const centroid = this.calculateCentroidVector(members.map(m => m.vector));
    const distances = members.map(m => ({
      ...m,
      distance: 1 - this.calculateSimilarity(m.vector, centroid)
    }));

    distances.sort((a, b) => b.distance - a.distance);
    return distances.slice(0, count).map(d => ({
      conceptId: d.conceptId,
      vector: d.vector
    }));
  }

  private selectMedoidExemplars(
    members: Array<{conceptId: string; vector: number[]}>,
    count: number
  ): Array<{conceptId: string; vector: number[]}> {
    // Select points closest to centroid
    const centroid = this.calculateCentroidVector(members.map(m => m.vector));
    const distances = members.map(m => ({
      ...m,
      distance: 1 - this.calculateSimilarity(m.vector, centroid)
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, count).map(d => ({
      conceptId: d.conceptId,
      vector: d.vector
    }));
  }

  private selectHybridExemplars(
    members: Array<{conceptId: string; vector: number[]}>,
    count: number
  ): Array<{conceptId: string; vector: number[]}> {
    // Combine strategies: some medoids, some boundary, some diverse
    const medoidCount = Math.floor(count * 0.4);
    const boundaryCount = Math.floor(count * 0.3);
    const diverseCount = count - medoidCount - boundaryCount;

    const medoids = this.selectMedoidExemplars(members, medoidCount);
    const boundary = this.selectBoundaryExemplars(members, boundaryCount);
    
    // Remove already selected
    const selectedIds = new Set([...medoids, ...boundary].map(e => e.conceptId));
    const remaining = members.filter(m => !selectedIds.has(m.conceptId));
    
    const diverse = this.selectDiverseExemplars(remaining, diverseCount);

    return [...medoids, ...boundary, ...diverse];
  }

  private calculateCentroidVector(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot calculate centroid of empty vector set');
    }

    const dimensions = vectors[0].length;
    const centroid = new Array(dimensions).fill(0);

    for (const vector of vectors) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += vector[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= vectors.length;
    }

    // Normalize
    const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] /= magnitude;
      }
    }

    return centroid;
  }
}