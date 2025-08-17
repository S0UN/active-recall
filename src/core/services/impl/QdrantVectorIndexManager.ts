/**
 * QdrantVectorIndexManager - Qdrant-based vector storage implementation
 * 
 * Provides vector storage and search using Qdrant vector database.
 * Manages three collections:
 * - concepts_title: For deduplication searches
 * - concepts_context: For routing and clustering
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
  UpsertConceptOptions
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
    readonly title: string;
    readonly context: string;
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
      title: 'concepts_title',
      context: 'concepts_context',
      centroids: 'folder_centroids'
    };

    if (!prefix) {
      return base;
    }

    return {
      title: `${prefix}_${base.title}`,
      context: `${prefix}_${base.context}`,
      centroids: `${prefix}_${base.centroids}`
    };
  }

  async upsert(options: UpsertConceptOptions): Promise<void> {
    const { conceptId, embeddings, folderId } = options;
    
    this.validateVectorDimensions(embeddings);

    const payload = this.createPayload(conceptId, embeddings, folderId);

    try {
      await this.upsertVectorPoints(conceptId, embeddings, payload);
    } catch (error) {
      throw new VectorIndexError(
        `Failed to upsert concept ${conceptId}: ${error}`,
        this.normalizeError(error)
      );
    }
  }

  private createPayload(conceptId: string, embeddings: VectorEmbeddings, folderId?: string): Record<string, unknown> {
    return {
      concept_id: conceptId,
      folder_id: folderId || null,
      content_hash: embeddings.contentHash,
      model: embeddings.model,
      embedded_at: embeddings.embeddedAt?.toISOString()
    };
  }

  private async upsertVectorPoints(conceptId: string, embeddings: VectorEmbeddings, payload: Record<string, unknown>): Promise<void> {
    await Promise.all([
      this.upsertToCollection(this.collections.title, conceptId, embeddings.titleVector, payload),
      this.upsertToCollection(this.collections.context, conceptId, embeddings.contextVector, payload)
    ]);
  }

  private async upsertToCollection(collection: string, id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.client.upsert(collection, {
      wait: true,
      points: [{
        id,
        vector,
        payload
      }]
    });
  }

  async searchByTitle(options: VectorSearchOptions): Promise<SimilarConcept[]> {
    const { vector, threshold, limit = 50 } = options;
    return this.searchVectors(this.collections.title, vector, threshold, limit, 'Title search failed');
  }

  async searchByContext(options: VectorSearchOptions): Promise<SimilarConcept[]> {
    const { vector, threshold, limit = 50 } = options;
    return this.searchVectors(this.collections.context, vector, threshold, limit, 'Context search failed');
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
      conceptId: String(hit.id),
      similarity: hit.score,
      folderId: this.extractFolderId(payload),
      metadata: payload || {}
    };
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

  async getFolderMembers(folderId: string): Promise<{ conceptId: string; contextVector: number[] }[]> {
    try {
      const result = await this.client.scroll(this.collections.context, {
        filter: this.createFolderFilter(folderId),
        limit: this.config.maxFolderMembers,
        with_payload: false,
        with_vector: true
      });

      return result.points.map(point => ({
        conceptId: String(point.id),
        contextVector: point.vector as number[]
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
      await Promise.all([
        this.client.delete(this.collections.title, {
          wait: true,
          points: [conceptId]
        }),
        this.client.delete(this.collections.context, {
          wait: true,
          points: [conceptId]
        })
      ]);
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
    this.validateVectorDimension(embeddings.titleVector);
    this.validateVectorDimension(embeddings.contextVector);
  }

  private validateVectorDimension(vector: number[]): void {
    if (vector.length !== this.config.dimensions) {
      throw new VectorDimensionError(this.config.dimensions, vector.length);
    }
  }

  private async getFolderMemberCount(folderId: string): Promise<number> {
    try {
      const result = await this.client.count(this.collections.context, {
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
}