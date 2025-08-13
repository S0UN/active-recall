import { describe, it, expect } from 'vitest';
import { FolderPath } from './FolderPath';

describe('FolderPath', () => {
  describe('construction', () => {
    it('should create a folder path from valid path string', () => {
      const path = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      expect(path.toString()).toBe('/Technology/Programming/JavaScript');
      expect(path.depth).toBe(3);
      expect(path.segments).toEqual(['Technology', 'Programming', 'JavaScript']);
    });

    it('should create a folder path from segments array', () => {
      const segments = ['Science', 'Physics', 'QuantumMechanics'];
      const path = FolderPath.fromSegments(segments);
      
      expect(path.toString()).toBe('/Science/Physics/QuantumMechanics');
      expect(path.depth).toBe(3);
      expect(path.segments).toEqual(segments);
    });

    it('should create root path', () => {
      const path = FolderPath.root();
      
      expect(path.toString()).toBe('/');
      expect(path.depth).toBe(0);
      expect(path.segments).toEqual([]);
      expect(path.isRoot()).toBe(true);
    });

    it('should handle single-level paths', () => {
      const path = FolderPath.fromString('/Technology');
      
      expect(path.toString()).toBe('/Technology');
      expect(path.depth).toBe(1);
      expect(path.segments).toEqual(['Technology']);
    });
  });

  describe('validation', () => {
    it('should reject paths exceeding maximum depth', () => {
      const deepSegments = ['Level1', 'Level2', 'Level3', 'Level4', 'Level5']; // 5 levels
      
      expect(() => {
        FolderPath.fromSegments(deepSegments);
      }).toThrow('Folder path exceeds maximum depth of 4');
    });

    it('should reject empty segment names', () => {
      expect(() => {
        FolderPath.fromSegments(['Technology', '', 'JavaScript']);
      }).toThrow('Folder segment cannot be empty');
    });

    it('should reject segments with invalid characters', () => {
      expect(() => {
        FolderPath.fromSegments(['Technology', 'Web/Development']);
      }).toThrow('Folder segment contains invalid characters');
    });

    it('should reject segments that are too long', () => {
      const longSegment = 'A'.repeat(51); // 51 characters
      
      expect(() => {
        FolderPath.fromSegments(['Technology', longSegment]);
      }).toThrow('Folder segment exceeds maximum length of 50');
    });

    it('should reject reserved folder names', () => {
      expect(() => {
        FolderPath.fromSegments(['Technology', 'CON']); // Windows reserved name
      }).toThrow('Folder segment uses reserved name');
    });

    it('should reject malformed path strings', () => {
      expect(() => {
        FolderPath.fromString('Technology/Programming'); // Missing leading slash
      }).toThrow('Path must start with /');
    });

    it('should reject paths with double slashes', () => {
      expect(() => {
        FolderPath.fromString('/Technology//Programming');
      }).toThrow('Path contains empty segments');
    });
  });

  describe('path operations', () => {
    it('should get parent path correctly', () => {
      const path = FolderPath.fromString('/Technology/Programming/JavaScript');
      const parent = path.parent;
      
      expect(parent?.toString()).toBe('/Technology/Programming');
      expect(parent?.depth).toBe(2);
    });

    it('should return null for root parent', () => {
      const root = FolderPath.root();
      
      expect(root.parent).toBeNull();
    });

    it('should append child segments', () => {
      const basePath = FolderPath.fromString('/Technology');
      const childPath = basePath.child('Programming');
      
      expect(childPath.toString()).toBe('/Technology/Programming');
      expect(childPath.depth).toBe(2);
    });

    it('should append multiple child segments', () => {
      const basePath = FolderPath.fromString('/Technology');
      const childPath = basePath.child('Programming').child('JavaScript');
      
      expect(childPath.toString()).toBe('/Technology/Programming/JavaScript');
    });

    it('should reject child creation that would exceed max depth', () => {
      const deepPath = FolderPath.fromSegments(['A', 'B', 'C', 'D']); // Depth 4 (max)
      
      expect(() => {
        deepPath.child('E');
      }).toThrow('Adding child would exceed maximum depth of 4');
    });

    it('should get all ancestors', () => {
      const path = FolderPath.fromString('/Technology/Programming/JavaScript');
      const ancestors = path.ancestors;
      
      expect(ancestors).toHaveLength(3);
      expect(ancestors[0].toString()).toBe('/');
      expect(ancestors[1].toString()).toBe('/Technology');
      expect(ancestors[2].toString()).toBe('/Technology/Programming');
    });

    it('should return empty ancestors for root', () => {
      const root = FolderPath.root();
      
      expect(root.ancestors).toEqual([]);
    });
  });

  describe('path relationships', () => {
    it('should detect if one path is ancestor of another', () => {
      const parent = FolderPath.fromString('/Technology');
      const child = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      expect(parent.isAncestorOf(child)).toBe(true);
      expect(child.isAncestorOf(parent)).toBe(false);
    });

    it('should detect if one path is descendant of another', () => {
      const parent = FolderPath.fromString('/Technology');
      const child = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      expect(child.isDescendantOf(parent)).toBe(true);
      expect(parent.isDescendantOf(child)).toBe(false);
    });

    it('should detect sibling paths', () => {
      const path1 = FolderPath.fromString('/Technology/Programming');
      const path2 = FolderPath.fromString('/Technology/Design');
      const different = FolderPath.fromString('/Science/Physics');
      
      expect(path1.isSiblingOf(path2)).toBe(true);
      expect(path1.isSiblingOf(different)).toBe(false);
    });

    it('should calculate relative path between paths', () => {
      const basePath = FolderPath.fromString('/Technology');
      const targetPath = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      const relativePath = basePath.relativePath(targetPath);
      expect(relativePath).toBe('Programming/JavaScript');
    });

    it('should return null for relative path when no relationship exists', () => {
      const path1 = FolderPath.fromString('/Technology');
      const path2 = FolderPath.fromString('/Science/Physics');
      
      expect(path1.relativePath(path2)).toBeNull();
    });
  });

  describe('equality and comparison', () => {
    it('should correctly compare equal paths', () => {
      const path1 = FolderPath.fromString('/Technology/Programming');
      const path2 = FolderPath.fromString('/Technology/Programming');
      
      expect(path1.equals(path2)).toBe(true);
      expect(path1.toString()).toBe(path2.toString());
    });

    it('should correctly compare different paths', () => {
      const path1 = FolderPath.fromString('/Technology/Programming');
      const path2 = FolderPath.fromString('/Technology/Design');
      
      expect(path1.equals(path2)).toBe(false);
    });

    it('should be case sensitive', () => {
      const path1 = FolderPath.fromString('/Technology/Programming');
      const path2 = FolderPath.fromString('/technology/programming');
      
      expect(path1.equals(path2)).toBe(false);
    });

    it('should sort paths lexicographically', () => {
      const paths = [
        FolderPath.fromString('/Technology/Programming'),
        FolderPath.fromString('/Science/Physics'),
        FolderPath.fromString('/Technology/Design'),
      ];
      
      const sorted = paths.sort((a, b) => a.compareTo(b));
      
      expect(sorted[0].toString()).toBe('/Science/Physics');
      expect(sorted[1].toString()).toBe('/Technology/Design');
      expect(sorted[2].toString()).toBe('/Technology/Programming');
    });
  });

  describe('normalization and formatting', () => {
    it('should normalize segment names', () => {
      const path = FolderPath.fromSegments(['  Technology  ', 'Programming   ']);
      
      expect(path.segments).toEqual(['Technology', 'Programming']);
      expect(path.toString()).toBe('/Technology/Programming');
    });

    it('should get the leaf (last) segment name', () => {
      const path = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      expect(path.leaf).toBe('JavaScript');
    });

    it('should return empty string for root leaf', () => {
      const root = FolderPath.root();
      
      expect(root.leaf).toBe('');
    });

    it('should convert to file system safe path', () => {
      const path = FolderPath.fromString('/Technology/Programming/JavaScript');
      
      expect(path.toFileSystemPath()).toBe('Technology/Programming/JavaScript');
    });

    it('should handle special characters in display name', () => {
      const path = FolderPath.fromString('/Technology/Programming');
      
      expect(path.toDisplayString()).toBe('Technology > Programming');
    });
  });

  describe('immutability', () => {
    it('should not allow modification of segments array', () => {
      const path = FolderPath.fromString('/Technology/Programming');
      const segments = path.segments;
      
      segments.push('Modified');
      
      expect(path.segments).toEqual(['Technology', 'Programming']);
      expect(path.toString()).toBe('/Technology/Programming');
    });

    it('should create new instances for path operations', () => {
      const originalPath = FolderPath.fromString('/Technology');
      const childPath = originalPath.child('Programming');
      
      expect(originalPath.toString()).toBe('/Technology');
      expect(childPath.toString()).toBe('/Technology/Programming');
      expect(originalPath).not.toBe(childPath);
    });
  });

  describe('special folder paths', () => {
    it('should create unsorted folder path', () => {
      const unsorted = FolderPath.unsorted();
      
      expect(unsorted.toString()).toBe('/Unsorted');
      expect(unsorted.depth).toBe(1);
    });

    it('should create provisional folder path', () => {
      const provisional = FolderPath.provisional('TempFolder123');
      
      expect(provisional.toString()).toBe('/Provisional/TempFolder123');
      expect(provisional.depth).toBe(2);
    });

    it('should detect provisional paths', () => {
      const provisional = FolderPath.provisional('TempFolder');
      const regular = FolderPath.fromString('/Technology/Programming');
      
      expect(provisional.isProvisional()).toBe(true);
      expect(regular.isProvisional()).toBe(false);
    });

    it('should detect unsorted paths', () => {
      const unsorted = FolderPath.unsorted();
      const unsortedChild = FolderPath.fromString('/Unsorted/TempTopic');
      const regular = FolderPath.fromString('/Technology/Programming');
      
      expect(unsorted.isUnsorted()).toBe(true);
      expect(unsortedChild.isUnsorted()).toBe(true);
      expect(regular.isUnsorted()).toBe(false);
    });
  });
});