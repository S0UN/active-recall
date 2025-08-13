/**
 * FolderPath Value Object
 * 
 * Represents an immutable hierarchical folder path in the concept organization system.
 * Enforces naming rules, depth limits, and provides path manipulation operations.
 */

interface PathConstraints {
  maxDepth: number;
  maxSegmentLength: number;
  reservedNames: string[];
  invalidCharacters: RegExp;
}

export class FolderPath {
  private static readonly CONSTRAINTS: PathConstraints = {
    maxDepth: 4,
    maxSegmentLength: 50,
    reservedNames: ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'],
    invalidCharacters: /[<>:"|?*\\\/]/,
  };

  private static readonly SPECIAL_FOLDERS = {
    provisional: 'Provisional',
    unsorted: 'Unsorted',
  };

  private readonly pathSegments: readonly string[];

  private constructor(segments: readonly string[]) {
    this.pathSegments = Object.freeze([...segments]);
  }

  static fromString(pathString: string): FolderPath {
    const normalizedPath = pathString.trim();
    
    if (!normalizedPath.startsWith('/')) {
      throw new Error('Path must start with /');
    }

    if (normalizedPath === '/') {
      return new FolderPath([]);
    }

    const rawSegments = normalizedPath.slice(1).split('/');
    
    if (rawSegments.some(segment => segment === '')) {
      throw new Error('Path contains empty segments');
    }

    const cleanedSegments = rawSegments.map(segment => segment.trim());
    
    return FolderPath.fromSegments(cleanedSegments);
  }

  static fromSegments(segments: string[]): FolderPath {
    const validatedSegments = segments.map(segment => FolderPath.validateAndNormalizeSegment(segment));
    
    FolderPath.validatePathDepth(validatedSegments);
    
    return new FolderPath(validatedSegments);
  }

  static root(): FolderPath {
    return new FolderPath([]);
  }

  static unsorted(): FolderPath {
    return new FolderPath([FolderPath.SPECIAL_FOLDERS.unsorted]);
  }

  static provisional(name: string): FolderPath {
    const validatedName = FolderPath.validateAndNormalizeSegment(name);
    return new FolderPath([FolderPath.SPECIAL_FOLDERS.provisional, validatedName]);
  }

  get segments(): readonly string[] {
    return [...this.pathSegments];
  }

  get depth(): number {
    return this.pathSegments.length;
  }

  get leaf(): string {
    return this.pathSegments[this.pathSegments.length - 1] || '';
  }

  get parent(): FolderPath | null {
    if (this.isRoot()) {
      return null;
    }

    const parentSegments = this.pathSegments.slice(0, -1);
    return new FolderPath(parentSegments);
  }

  get ancestors(): FolderPath[] {
    if (this.isRoot()) {
      return [];
    }

    const ancestorPaths: FolderPath[] = [];
    
    for (let i = 0; i < this.pathSegments.length; i++) {
      const ancestorSegments = this.pathSegments.slice(0, i);
      ancestorPaths.push(new FolderPath(ancestorSegments));
    }

    return ancestorPaths;
  }

  child(segmentName: string): FolderPath {
    const validatedSegment = FolderPath.validateAndNormalizeSegment(segmentName);
    const newSegments = [...this.pathSegments, validatedSegment];
    
    if (newSegments.length > FolderPath.CONSTRAINTS.maxDepth) {
      throw new Error(`Adding child would exceed maximum depth of ${FolderPath.CONSTRAINTS.maxDepth}`);
    }
    
    return new FolderPath(newSegments);
  }

  isRoot(): boolean {
    return this.pathSegments.length === 0;
  }

  isProvisional(): boolean {
    return this.pathSegments[0] === FolderPath.SPECIAL_FOLDERS.provisional;
  }

  isUnsorted(): boolean {
    return this.pathSegments[0] === FolderPath.SPECIAL_FOLDERS.unsorted;
  }

  isAncestorOf(otherPath: FolderPath): boolean {
    if (this.depth >= otherPath.depth) {
      return false;
    }

    return this.pathSegments.every((segment, index) => 
      segment === otherPath.pathSegments[index]
    );
  }

  isDescendantOf(otherPath: FolderPath): boolean {
    return otherPath.isAncestorOf(this);
  }

  isSiblingOf(otherPath: FolderPath): boolean {
    if (this.depth !== otherPath.depth || this.depth === 0) {
      return false;
    }

    const thisParent = this.parent;
    const otherParent = otherPath.parent;
    
    return thisParent !== null && otherParent !== null && thisParent.equals(otherParent);
  }

  relativePath(targetPath: FolderPath): string | null {
    if (!this.isAncestorOf(targetPath)) {
      return null;
    }

    const relativeSegments = targetPath.pathSegments.slice(this.depth);
    return relativeSegments.join('/');
  }

  equals(otherPath: FolderPath): boolean {
    return this.toString() === otherPath.toString();
  }

  compareTo(otherPath: FolderPath): number {
    return this.toString().localeCompare(otherPath.toString());
  }

  toString(): string {
    if (this.isRoot()) {
      return '/';
    }

    return '/' + this.pathSegments.join('/');
  }

  toFileSystemPath(): string {
    return this.pathSegments.join('/');
  }

  toDisplayString(): string {
    if (this.isRoot()) {
      return 'Root';
    }

    return this.pathSegments.join(' > ');
  }

  private static validateAndNormalizeSegment(segment: string): string {
    const trimmedSegment = segment.trim();
    
    if (trimmedSegment === '') {
      throw new Error('Folder segment cannot be empty');
    }

    if (trimmedSegment.length > FolderPath.CONSTRAINTS.maxSegmentLength) {
      throw new Error(`Folder segment exceeds maximum length of ${FolderPath.CONSTRAINTS.maxSegmentLength}`);
    }

    if (FolderPath.CONSTRAINTS.invalidCharacters.test(trimmedSegment)) {
      throw new Error('Folder segment contains invalid characters');
    }

    if (FolderPath.isReservedName(trimmedSegment)) {
      throw new Error('Folder segment uses reserved name');
    }

    return trimmedSegment;
  }

  private static validatePathDepth(segments: string[]): void {
    if (segments.length > FolderPath.CONSTRAINTS.maxDepth) {
      throw new Error(`Folder path exceeds maximum depth of ${FolderPath.CONSTRAINTS.maxDepth}`);
    }
  }

  private static isReservedName(name: string): boolean {
    return FolderPath.CONSTRAINTS.reservedNames.includes(name.toUpperCase());
  }
}