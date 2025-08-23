/**
 * QdrantVectorIndexManager - Qdrant-based vector storage implementation
 * 
 * Provides vector storage and search using Qdrant vector database.
 * Manages two collections:
 * - concepts: For both deduplication and routing searches
 * - folder_centroids: For folder representations
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { 
  IVectorIndexManager, 
  SimilarConcept, 
  FolderVectorData, 
  VectorIndexConfig,
  VectorIndexError,
  VectorDimensionError,
  VectorIndexConnectionError,
  VectorSearchOptions,
  UpsertConceptOptions,
  MultiFolderPlacement
} from '../IVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';

interface InternalConfig extends VectorIndexConfig {
  collectionPrefix: string;
  maxFolderMembers: number;
  maxExemplars: number;
}

export class QdrantVectorIndexManager implements IVectorIndexManager {
  private readonly client: QdrantClient;
  private readonly config: InternalConfig;
  private readonly collections: Readonly<{
    readonly concepts: string;
    readonly centroids: string;
  }>;

  constructor(config: VectorIndexConfig) {
    this.config = {
      collectionPrefix: '',
      maxFolderMembers: 1000,
      maxExemplars: 100,
      ...config
    };

    this.collections = this.buildCollectionNames(this.config.collectionPrefix);

    this.client = new QdrantClient({
      host: config.host || 'localhost',
      port: config.port || 6333,
      apiKey: config.apiKey
    });
  }

  /**
   * Build collection names with optional prefix
   */
  private buildCollectionNames(prefix: string): typeof this.collections {
    const base = {
      concepts: 'concepts',
      centroids: 'folder_centroids'
    };

    if (!prefix) {
      return base;
    }

    return {
      concepts: `${prefix}_${base.concepts}`,
      centroids: `${prefix}_${base.centroids}`
    };
  }

  async upsert(options: UpsertConceptOptions): Promise<void> {
    const { conceptId, embeddings, folderId, placements } = options;
    
    this.validateVectorDimensions(embeddings);

    const payload = this.createPayload(conceptId, embeddings, folderId, placements);

    try {
      await this.upsertVectorPoints(conceptId, embeddings, payload);
    } catch (error) {
      throw new VectorIndexError(
        `Failed to upsert concept ${conceptId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  /**
   * Create payload for vector storage with multi-folder support
   * Maintains backward compatibility while supporting new placement structure
   */
  private createPayload(
    conceptId: string, 
    embeddings: VectorEmbeddings, 
    folderId?: string,
    placements?: MultiFolderPlacement
  ): Record<string, unknown> {
    const basePayload = this.createBasePayload(conceptId, embeddings);
    const folderPayload = this.createFolderPayload(folderId, placements);
    
    return {
      ...basePayload,
      ...folderPayload
    };
  }

  /**
   * Create core payload fields that are always present
   */
  private createBasePayload(conceptId: string, embeddings: VectorEmbeddings): Record<string, unknown> {
    return {
      concept_id: conceptId,
      content_hash: embeddings.contentHash,
      model: embeddings.model,
      embedded_at: embeddings.embeddedAt?.toISOString()
    };
  }

  /**
   * Create folder-related payload fields with backward compatibility
   */
  private createFolderPayload(
    legacyFolderId?: string,
    placements?: MultiFolderPlacement
  ): Record<string, unknown> {
    if (placements) {
      return this.createMultiFolderPayload(placements);
    }
    
    return this.createLegacyFolderPayload(legacyFolderId);
  }

  /**
   * Create payload for new multi-folder structure
   */
  private createMultiFolderPayload(placements: MultiFolderPlacement): Record<string, unknown> {
    return {
      // Backward compatibility: primary folder also stored as folder_id
      folder_id: placements.primary,
      
      // New multi-folder structure
      primary_folder: placements.primary,
      reference_folders: placements.references,
      placement_confidences: placements.confidences
    };
  }

  /**
   * Create payload for legacy single-folder structure
   */
  private createLegacyFolderPayload(folderId?: string): Record<string, unknown> {
    return {
      // Legacy single folder support
      folder_id: folderId || null,
      
      // Initialize multi-folder fields as empty for consistency
      primary_folder: null,
      reference_folders: []
    };
  }

  private async upsertVectorPoints(conceptId: string, embeddings: VectorEmbeddings, payload: Record<string, unknown>): Promise<void> {
    await this.upsertToCollection(this.collections.concepts, conceptId, embeddings.vector, payload);
  }

  /**
   * Upsert point to Qdrant collection with proper ID conversion
   * Converts string IDs to UUIDs as required by Qdrant
   */
  private async upsertToCollection(collection: string, id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    const qdrantId = this.convertToQdrantId(id);
    
    await this.client.upsert(collection, {
      wait: true,
      points: [{
        id: qdrantId,
        vector,
        payload: {
          ...payload,
          original_id: id // Store original ID for reverse lookup
        }
      }]
    });
  }

  /**
   * Convert string ID to UUID for Qdrant compatibility
   * Uses deterministic UUID generation based on string content
   */
  private convertToQdrantId(id: string): string {
    // For now, use a simple hash-to-UUID conversion
    // In production, might want to use a proper UUID library
    const hash = this.simpleHash(id);
    const uuid = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
    return uuid;
  }

  /**
   * Simple deterministic hash function for ID conversion
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }

  async searchByTitle(options: VectorSearchOptions): Promise<SimilarConcept[]> {
    const { vector, threshold, limit = 50 } = options;
    return this.searchVectors(this.collections.concepts, vector, threshold, limit, 'Title search failed');
  }

  async searchByContext(options: VectorSearchOptions): Promise<SimilarConcept[]> {
    const { vector, threshold, limit = 50 } = options;
    return this.searchVectors(this.collections.concepts, vector, threshold, limit, 'Context search failed');
  }

  private async searchVectors(
    collection: string, 
    vector: number[], 
    threshold: number, 
    limit: number, 
    errorPrefix: string
  ): Promise<SimilarConcept[]> {
    this.validateVectorDimension(vector);

    try {
      const result = await this.client.search(collection, {
        vector,
        limit,
        score_threshold: threshold,
        with_payload: true
      });

      return result.map(hit => this.mapHitToSimilarConcept(hit));
    } catch (error) {
      throw new VectorIndexError(
        `${errorPrefix}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  private mapHitToSimilarConcept(hit: { id: unknown; score: number; payload?: unknown }): SimilarConcept {
    const payload = hit.payload as Record<string, unknown> | undefined;
    
    return {
      conceptId: this.extractOriginalId(payload) || String(hit.id),
      similarity: hit.score,
      folderId: this.extractFolderId(payload),
      metadata: payload || {}
    };
  }

  /**
   * Extract original concept ID from payload
   */
  private extractOriginalId(payload?: Record<string, unknown>): string | undefined {
    return payload?.original_id as string || payload?.concept_id as string;
  }

  private extractFolderId(payload: Record<string, unknown> | undefined): string | undefined {
    if (!payload || typeof payload.folder_id !== 'string') {
      return undefined;
    }
    return payload.folder_id;
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  async getFolderMembers(folderId: string): Promise<{ conceptId: string; vector: number[] }[]> {
    try {
      const result = await this.client.scroll(this.collections.concepts, {
        filter: this.createFolderFilter(folderId),
        limit: this.config.maxFolderMembers,
        with_payload: false,
        with_vector: true
      });

      return result.points.map(point => ({
        conceptId: String(point.id),
        vector: point.vector as number[]
      }));
    } catch (error) {
      throw new VectorIndexError(
        `Failed to get folder members for ${folderId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  private createFolderFilter(folderId: string) {
    return {
      must: [{
        key: 'folder_id',
        match: { value: folderId }
      }]
    };
  }

  async setFolderCentroid(folderId: string, centroid: number[]): Promise<void> {
    this.validateVectorDimension(centroid);

    try {
      await this.upsertToCollection(
        this.collections.centroids,
        `${folderId}_centroid`,
        centroid,
        this.createCentroidPayload(folderId)
      );
    } catch (error) {
      throw new VectorIndexError(
        `Failed to set centroid for folder ${folderId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  private createCentroidPayload(folderId: string): Record<string, unknown> {
    return {
      folder_id: folderId,
      type: 'centroid',
      updated_at: new Date().toISOString()
    };
  }

  async setFolderExemplars(folderId: string, exemplars: number[][]): Promise<void> {
    this.validateExemplarVectors(exemplars);

    try {
      await this.deleteFolderExemplars(folderId);
      
      if (exemplars.length > 0) {
        await this.insertExemplars(folderId, exemplars);
      }
    } catch (error) {
      throw new VectorIndexError(
        `Failed to set exemplars for folder ${folderId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  private validateExemplarVectors(exemplars: number[][]): void {
    exemplars.forEach(exemplar => this.validateVectorDimension(exemplar));
  }

  private async insertExemplars(folderId: string, exemplars: number[][]): Promise<void> {
    const points = exemplars.map((exemplar, index) => 
      this.createExemplarPoint(folderId, exemplar, index)
    );

    await this.client.upsert(this.collections.centroids, {
      wait: true,
      points
    });
  }

  private createExemplarPoint(folderId: string, vector: number[], index: number) {
    return {
      id: `${folderId}_exemplar_${index}`,
      vector,
      payload: this.createExemplarPayload(folderId, index)
    };
  }

  private createExemplarPayload(folderId: string, index: number): Record<string, unknown> {
    return {
      folder_id: folderId,
      type: 'exemplar',
      exemplar_index: index,
      updated_at: new Date().toISOString()
    };
  }

  async getFolderVectorData(folderId: string): Promise<FolderVectorData | null> {
    try {
      // Get centroid and exemplars for the folder
      const result = await this.client.scroll(this.collections.centroids, {
        filter: {
          must: [{
            key: 'folder_id',
            match: { value: folderId }
          }]
        },
        limit: 100, // Should be enough for centroid + exemplars
        with_payload: true,
        with_vector: true
      });

      let centroid: number[] | null = null;
      const exemplars: number[][] = [];
      let lastUpdated = new Date(0);

      for (const point of result.points) {
        const payload = point.payload as any;
        const updatedAt = new Date(payload.updated_at || 0);
        
        if (updatedAt > lastUpdated) {
          lastUpdated = updatedAt;
        }

        if (payload.type === 'centroid') {
          centroid = point.vector as number[];
        } else if (payload.type === 'exemplar') {
          exemplars[payload.exemplar_index] = point.vector as number[];
        }
      }

      if (!centroid) {
        return null;
      }

      // Get member count from context collection
      const memberCount = await this.getFolderMemberCount(folderId);

      return {
        folderId,
        centroid,
        exemplars: exemplars.filter(Boolean), // Remove empty slots
        memberCount,
        lastUpdated
      };
    } catch (error) {
      throw new VectorIndexError(
        `Failed to get folder vector data for ${folderId}: ${error}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async delete(conceptId: string): Promise<void> {
    try {
      await this.client.delete(this.collections.concepts, {
        wait: true,
        points: [conceptId]
      });
    } catch (error) {
      throw new VectorIndexError(
        `Failed to delete concept ${conceptId}: ${error}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  async isReady(): Promise<boolean> {
    try {
      // Check if all required collections exist
      const collections = await this.client.getCollections();
      const collectionNames = collections.collections.map(c => c.name);
      
      return Object.values(this.collections).every(name => 
        collectionNames.includes(name)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize collections if they don't exist
   * Call this during application startup
   */
  async initialize(): Promise<void> {
    try {
      for (const [_key, collectionName] of Object.entries(this.collections)) {
        try {
          await this.client.getCollection(collectionName);
        } catch {
          // Collection doesn't exist, create it
          await this.client.createCollection(collectionName, {
            vectors: {
              size: this.config.dimensions,
              distance: 'Cosine'
            },
            optimizers_config: {
              default_segment_number: 2
            },
            replication_factor: 1
          });
        }
      }
    } catch (error) {
      throw new VectorIndexConnectionError(
        `Failed to initialize collections: ${error}`
      );
    }
  }

  private validateVectorDimensions(embeddings: VectorEmbeddings): void {
    this.validateVectorDimension(embeddings.vector);
  }

  private validateVectorDimension(vector: number[]): void {
    if (vector.length !== this.config.dimensions) {
      throw new VectorDimensionError(this.config.dimensions, vector.length);
    }
  }

  private async getFolderMemberCount(folderId: string): Promise<number> {
    try {
      const result = await this.client.count(this.collections.concepts, {
        filter: {
          must: [{
            key: 'folder_id',
            match: { value: folderId }
          }]
        }
      });
      return result.count;
    } catch {
      return 0;
    }
  }

  private async deleteFolderExemplars(folderId: string): Promise<void> {
    try {
      const result = await this.client.scroll(this.collections.centroids, {
        filter: {
          must: [
            { key: 'folder_id', match: { value: folderId } },
            { key: 'type', match: { value: 'exemplar' } }
          ]
        },
        limit: 100,
        with_payload: false,
        with_vector: false
      });

      if (result.points.length > 0) {
        await this.client.delete(this.collections.centroids, {
          wait: true,
          points: result.points.map(p => String(p.id))
        });
      }
    } catch {
      // Ignore errors when deleting non-existent exemplars
    }
  }

  /**
   * Search for concepts by folder (including primary and reference placements)
   * Returns concepts where the folder is either primary or reference
   */
  async searchByFolder(folderId: string, includeReferences: boolean = true): Promise<SimilarConcept[]> {
    try {
      const filter = this.createFolderSearchFilter(folderId, includeReferences);
      
      // Use scroll instead of search when we only need filtering, not vector similarity
      const result = await this.client.scroll(this.collections.concepts, {
        filter,
        limit: 1000,
        with_payload: true
      });

      return result.points.map(hit => this.mapFolderScrollHitToSimilarConcept(hit, folderId));
    } catch (error) {
      throw new VectorIndexError(
        `Failed to search concepts by folder ${folderId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  /**
   * Get all unique folder IDs that have concepts (primary or reference)
   */
  async getAllFolderIds(): Promise<string[]> {
    try {
      const result = await this.client.scroll(this.collections.concepts, {
        filter: undefined,
        limit: 10000,
        with_payload: true
      });

      const folderIds = new Set<string>();
      
      for (const point of result.points) {
        this.extractFolderIdsFromPayload(point.payload, folderIds);
      }
      
      return Array.from(folderIds).filter(id => id !== null);
    } catch (error) {
      throw new VectorIndexError(
        `Failed to get all folder IDs: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  /**
   * Create Qdrant filter for searching by folder
   * Supports both primary and reference folder searches
   */
  private createFolderSearchFilter(folderId: string, includeReferences: boolean): any {
    if (!includeReferences) {
      // Only search primary folders
      return {
        must: [
          { key: 'primary_folder', match: { value: folderId } }
        ]
      };
    }

    // Search both primary and reference folders
    return {
      should: [
        { key: 'primary_folder', match: { value: folderId } },
        { key: 'reference_folders', match: { any: [folderId] } },
        // Backward compatibility with legacy folder_id
        { key: 'folder_id', match: { value: folderId } }
      ]
    };
  }


  /**
   * Map scroll hit to SimilarConcept with folder context (no similarity score)
   */
  private mapFolderScrollHitToSimilarConcept(hit: any, searchedFolderId: string): SimilarConcept {
    const payload = hit.payload || {};
    const isPrimary = this.determineIfPrimaryFolder(payload, searchedFolderId);
    
    return {
      conceptId: this.extractOriginalId(payload) || String(hit.id),
      similarity: 1.0, // No similarity score in scroll results
      folderId: searchedFolderId,
      isPrimary,
      metadata: payload
    };
  }

  /**
   * Determine if the searched folder is the primary folder for this concept
   */
  private determineIfPrimaryFolder(payload: any, searchedFolderId: string): boolean {
    // Check new multi-folder structure
    if (payload.primary_folder) {
      return payload.primary_folder === searchedFolderId;
    }
    
    // Fallback to legacy structure (assume primary if folder_id matches)
    return payload.folder_id === searchedFolderId;
  }

  /**
   * Extract all folder IDs from a concept's payload
   */
  private extractFolderIdsFromPayload(payload: any, folderIds: Set<string>): void {
    if (!payload) return;
    
    // Add primary folder
    if (payload.primary_folder) {
      folderIds.add(payload.primary_folder);
    }
    
    // Add reference folders
    if (Array.isArray(payload.reference_folders)) {
      payload.reference_folders.forEach((folderId: string) => {
        if (folderId) folderIds.add(folderId);
      });
    }
    
    // Backward compatibility: add legacy folder_id
    if (payload.folder_id && !payload.primary_folder) {
      folderIds.add(payload.folder_id);
    }
  }
}