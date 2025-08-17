/**
 * FileSystemArtifactRepository
 * 
 * File system implementation of IConceptArtifactRepository.
 * Stores artifacts as JSON files in a hierarchical folder structure.
 * 
 * Key features:
 * - Atomic writes using temp file + rename pattern
 * - Idempotent operations (save/delete)
 * - Deterministic file paths based on artifact routing
 * - Efficient indexing using in-memory cache
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { 
  IConceptArtifactRepository,
  NotFoundError 
} from '../contracts/repositories';
import { ConceptArtifact, ConceptArtifactSchema } from '../contracts/schemas';
import { FolderPath } from '../domain/FolderPath';

export class FileSystemArtifactRepository implements IConceptArtifactRepository {
  private readonly basePath: string;
  private artifactIndex: Map<string, string> = new Map(); // artifactId -> file path
  private candidateIndex: Map<string, string> = new Map(); // candidateId -> artifactId
  private contentHashIndex: Map<string, Set<string>> = new Map(); // contentHash -> Set<artifactId>
  private initialized = false;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Parse JSON and convert date strings to Date objects
   */
  private parseJsonWithDates(jsonString: string): any {
    return JSON.parse(jsonString, (key, value) => {
      // Check if value is a date string
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
      }
      return value;
    });
  }

  /**
   * Initialize the repository by scanning existing files
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await this.scanDirectory(this.basePath);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize repository: ${error}`);
    }
  }

  /**
   * Recursively scan directory for existing artifacts
   */
  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const parsed = this.parseJsonWithDates(content);
            const artifact = ConceptArtifactSchema.parse(parsed);
            this.updateIndices(artifact, fullPath);
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist yet, that's ok
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Update in-memory indices
   */
  private updateIndices(artifact: ConceptArtifact, filePath: string): void {
    this.artifactIndex.set(artifact.artifactId, filePath);
    this.candidateIndex.set(artifact.candidateId, artifact.artifactId);
    
    // Always compute hash from normalized content for consistency
    const contentHash = this.computeContentHash(artifact.content.normalized);
    if (contentHash) {
      if (!this.contentHashIndex.has(contentHash)) {
        this.contentHashIndex.set(contentHash, new Set());
      }
      this.contentHashIndex.get(contentHash)!.add(artifact.artifactId);
    }
  }

  /**
   * Compute SHA-256 hash of content
   */
  private computeContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Remove from in-memory indices
   */
  private removeFromIndices(artifact: ConceptArtifact): void {
    this.artifactIndex.delete(artifact.artifactId);
    this.candidateIndex.delete(artifact.candidateId);
    
    // Always compute hash from normalized content for consistency
    const contentHash = this.computeContentHash(artifact.content.normalized);
    if (contentHash) {
      const hashSet = this.contentHashIndex.get(contentHash);
      if (hashSet) {
        hashSet.delete(artifact.artifactId);
        if (hashSet.size === 0) {
          this.contentHashIndex.delete(contentHash);
        }
      }
    }
  }

  /**
   * Get file path for an artifact
   */
  private getFilePath(artifact: ConceptArtifact): string {
    const pathSegments = artifact.routing.path.split('/').filter(s => s.length > 0);
    return join(this.basePath, ...pathSegments, `${artifact.artifactId}.json`);
  }

  /**
   * Atomic write operation
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    
    try {
      // Write to temp file
      await fs.writeFile(tempPath, content, 'utf-8');
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async save(artifact: ConceptArtifact): Promise<void> {
    await this.initialize();
    
    // Validate artifact
    const validatedArtifact = ConceptArtifactSchema.parse(artifact);
    
    const filePath = this.getFilePath(validatedArtifact);
    const content = JSON.stringify(validatedArtifact, null, 2);
    
    await this.atomicWrite(filePath, content);
    this.updateIndices(validatedArtifact, filePath);
  }

  async findById(id: string): Promise<ConceptArtifact | null> {
    await this.initialize();
    
    const filePath = this.artifactIndex.get(id);
    if (!filePath) {
      // Try to find by scanning (in case index is out of sync)
      const foundPath = await this.findFileById(id);
      if (!foundPath) return null;
      
      try {
        const content = await fs.readFile(foundPath, 'utf-8');
        const parsed = this.parseJsonWithDates(content);
        const artifact = ConceptArtifactSchema.parse(parsed);
        this.updateIndices(artifact, foundPath);
        return artifact;
      } catch {
        return null;
      }
    }
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parseJsonWithDates(content);
      return ConceptArtifactSchema.parse(parsed);
    } catch {
      // File might have been deleted, remove from index
      this.artifactIndex.delete(id);
      return null;
    }
  }

  /**
   * Find file by artifact ID (fallback when index miss)
   */
  private async findFileById(id: string, dir: string = this.basePath): Promise<string | null> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const found = await this.findFileById(id, fullPath);
          if (found) return found;
        } else if (entry.name === `${id}.json`) {
          return fullPath;
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return null;
  }

  async findByPath(path: FolderPath): Promise<ConceptArtifact[]> {
    await this.initialize();
    
    const dirPath = join(this.basePath, ...path.toString().split('/').filter(s => s.length > 0));
    const artifacts: ConceptArtifact[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const filePath = join(dirPath, entry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = this.parseJsonWithDates(content);
            const artifact = ConceptArtifactSchema.parse(parsed);
            artifacts.push(artifact);
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory doesn't exist, return empty array
    }
    
    return artifacts;
  }

  async exists(id: string): Promise<boolean> {
    await this.initialize();
    
    if (this.artifactIndex.has(id)) {
      // Verify file actually exists
      const filePath = this.artifactIndex.get(id)!;
      try {
        await fs.stat(filePath);
        return true;
      } catch {
        // File doesn't exist, remove from index
        this.artifactIndex.delete(id);
        return false;
      }
    }
    
    // Try to find file
    const foundPath = await this.findFileById(id);
    return foundPath !== null;
  }

  async findByCandidateId(candidateId: string): Promise<ConceptArtifact | null> {
    await this.initialize();
    
    const artifactId = this.candidateIndex.get(candidateId);
    if (!artifactId) {
      // Scan all artifacts to find it (expensive, but handles index misses)
      await this.scanDirectory(this.basePath);
      const foundId = this.candidateIndex.get(candidateId);
      if (!foundId) return null;
      return this.findById(foundId);
    }
    
    return this.findById(artifactId);
  }

  async findByContentHash(contentHash: string): Promise<ConceptArtifact[]> {
    await this.initialize();
    
    const artifactIds = this.contentHashIndex.get(contentHash);
    if (!artifactIds || artifactIds.size === 0) {
      return [];
    }
    
    const artifacts: ConceptArtifact[] = [];
    for (const id of artifactIds) {
      const artifact = await this.findById(id);
      if (artifact) {
        artifacts.push(artifact);
      }
    }
    
    return artifacts;
  }

  async updatePath(artifactId: string, newPath: FolderPath): Promise<void> {
    await this.initialize();
    
    const artifact = await this.findById(artifactId);
    if (!artifact) {
      // Nothing to update
      return;
    }
    
    const oldFilePath = this.artifactIndex.get(artifactId)!;
    
    // Update artifact routing
    artifact.routing.path = newPath.toString();
    artifact.audit.lastModified = new Date();
    
    // Save to new location
    const newFilePath = this.getFilePath(artifact);
    const content = JSON.stringify(artifact, null, 2);
    await this.atomicWrite(newFilePath, content);
    
    // Delete old file
    try {
      await fs.unlink(oldFilePath);
    } catch {
      // File might not exist
    }
    
    // Update index
    this.artifactIndex.set(artifactId, newFilePath);
  }

  async delete(artifactId: string): Promise<void> {
    await this.initialize();
    
    const filePath = this.artifactIndex.get(artifactId);
    if (!filePath) {
      // Already deleted or doesn't exist
      return;
    }
    
    // Get artifact for index cleanup
    const artifact = await this.findById(artifactId);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's ok
    }
    
    // Clean up indices
    if (artifact) {
      this.removeFromIndices(artifact);
    } else {
      this.artifactIndex.delete(artifactId);
    }
  }

  async count(): Promise<number> {
    await this.initialize();
    return this.artifactIndex.size;
  }

  async countByPath(path: FolderPath): Promise<number> {
    const artifacts = await this.findByPath(path);
    return artifacts.length;
  }
}