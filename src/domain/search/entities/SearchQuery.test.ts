/**
 * Test Suite for Search Query Domain Entity
 * 
 * These tests follow the Arrange-Act-Assert pattern with clear,
 * readable descriptions that serve as documentation.
 * 
 * @module Domain/Search/Entities/Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  SearchQuery, 
  SearchTerm, 
  SimilarityThreshold, 
  ResultLimit, 
  FolderFilter,
  SearchMode 
} from './SearchQuery';

describe('SearchTerm Value Object', () => {
  
  describe('When creating a search term', () => {
    
    it('should normalize the term to lowercase', () => {
      // Arrange
      const inputTerm = 'Neural Networks';
      
      // Act
      const searchTerm = new SearchTerm(inputTerm);
      
      // Assert
      expect(searchTerm.getValue()).toBe('neural networks');
    });

    it('should trim whitespace from the term', () => {
      // Arrange
      const termWithWhitespace = '  machine learning  ';
      
      // Act
      const searchTerm = new SearchTerm(termWithWhitespace);
      
      // Assert
      expect(searchTerm.getValue()).toBe('machine learning');
    });

    it('should reject empty terms', () => {
      // Arrange
      const emptyTerm = '';
      const whitespaceOnlyTerm = '   ';
      
      // Act & Assert
      expect(() => new SearchTerm(emptyTerm))
        .toThrow('Search term cannot be empty');
      
      expect(() => new SearchTerm(whitespaceOnlyTerm))
        .toThrow('Search term cannot be empty');
    });

    it('should reject terms longer than 500 characters', () => {
      // Arrange
      const veryLongTerm = 'a'.repeat(501);
      
      // Act & Assert
      expect(() => new SearchTerm(veryLongTerm))
        .toThrow('Search term too long (max 500 characters)');
    });
  });

  describe('When working with search term words', () => {
    
    it('should split term into individual words', () => {
      // Arrange
      const searchTerm = new SearchTerm('deep learning algorithms');
      
      // Act
      const words = searchTerm.getWords();
      
      // Assert
      expect(words).toEqual(['deep', 'learning', 'algorithms']);
    });

    it('should handle multiple spaces between words', () => {
      // Arrange
      const searchTerm = new SearchTerm('neural    networks');
      
      // Act
      const words = searchTerm.getWords();
      
      // Assert
      expect(words).toEqual(['neural', 'networks']);
    });

    it('should check if term contains a specific word', () => {
      // Arrange
      const searchTerm = new SearchTerm('gradient descent optimization');
      
      // Act & Assert
      expect(searchTerm.contains('gradient')).toBe(true);
      expect(searchTerm.contains('DESCENT')).toBe(true); // Case insensitive
      expect(searchTerm.contains('backprop')).toBe(false);
    });
  });

  describe('When comparing search terms', () => {
    
    it('should consider identical normalized terms as equal', () => {
      // Arrange
      const term1 = new SearchTerm('Machine Learning');
      const term2 = new SearchTerm('machine learning');
      
      // Act
      const areEqual = term1.equals(term2);
      
      // Assert
      expect(areEqual).toBe(true);
    });

    it('should consider different terms as not equal', () => {
      // Arrange
      const term1 = new SearchTerm('neural networks');
      const term2 = new SearchTerm('deep learning');
      
      // Act
      const areEqual = term1.equals(term2);
      
      // Assert
      expect(areEqual).toBe(false);
    });
  });
});

describe('SimilarityThreshold Value Object', () => {
  
  describe('When creating a similarity threshold', () => {
    
    it('should accept valid threshold values between 0 and 1', () => {
      // Arrange & Act
      const lowThreshold = new SimilarityThreshold(0.3);
      const mediumThreshold = new SimilarityThreshold(0.7);
      const highThreshold = new SimilarityThreshold(0.95);
      
      // Assert
      expect(lowThreshold.getValue()).toBe(0.3);
      expect(mediumThreshold.getValue()).toBe(0.7);
      expect(highThreshold.getValue()).toBe(0.95);
    });

    it('should use default value of 0.7 when not specified', () => {
      // Act
      const threshold = new SimilarityThreshold();
      
      // Assert
      expect(threshold.getValue()).toBe(0.7);
    });

    it('should reject values below 0', () => {
      // Act & Assert
      expect(() => new SimilarityThreshold(-0.1))
        .toThrow('Threshold must be between 0 and 1');
    });

    it('should reject values above 1', () => {
      // Act & Assert
      expect(() => new SimilarityThreshold(1.5))
        .toThrow('Threshold must be between 0 and 1');
    });
  });

  describe('When checking if scores meet threshold', () => {
    
    it('should correctly identify scores that meet the threshold', () => {
      // Arrange
      const threshold = new SimilarityThreshold(0.75);
      
      // Act & Assert
      expect(threshold.isMet(0.8)).toBe(true);   // Above threshold
      expect(threshold.isMet(0.75)).toBe(true);  // Exactly at threshold
      expect(threshold.isMet(0.7)).toBe(false);  // Below threshold
    });
  });
});

describe('ResultLimit Value Object', () => {
  
  describe('When creating a result limit', () => {
    
    it('should accept valid limit values', () => {
      // Arrange & Act
      const smallLimit = new ResultLimit(5);
      const mediumLimit = new ResultLimit(20);
      const largeLimit = new ResultLimit(50);
      
      // Assert
      expect(smallLimit.getValue()).toBe(5);
      expect(mediumLimit.getValue()).toBe(20);
      expect(largeLimit.getValue()).toBe(50);
    });

    it('should use default value of 10 when not specified', () => {
      // Act
      const limit = new ResultLimit();
      
      // Assert
      expect(limit.getValue()).toBe(10);
    });

    it('should reject values less than 1', () => {
      // Act & Assert
      expect(() => new ResultLimit(0))
        .toThrow('Limit must be at least 1');
      
      expect(() => new ResultLimit(-5))
        .toThrow('Limit must be at least 1');
    });

    it('should reject values greater than 100', () => {
      // Act & Assert
      expect(() => new ResultLimit(101))
        .toThrow('Limit cannot exceed 100');
    });
  });

  describe('When applying limit to results', () => {
    
    it('should correctly limit array to specified size', () => {
      // Arrange
      const limit = new ResultLimit(3);
      const items = ['a', 'b', 'c', 'd', 'e'];
      
      // Act
      const limited = limit.apply(items);
      
      // Assert
      expect(limited).toEqual(['a', 'b', 'c']);
    });

    it('should return all items when array is smaller than limit', () => {
      // Arrange
      const limit = new ResultLimit(10);
      const items = ['a', 'b', 'c'];
      
      // Act
      const limited = limit.apply(items);
      
      // Assert
      expect(limited).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('FolderFilter Value Object', () => {
  
  describe('When creating a folder filter', () => {
    
    it('should accept array of folder paths', () => {
      // Arrange
      const paths = ['/ai/deep-learning', '/ml/optimization'];
      
      // Act
      const filter = new FolderFilter(paths);
      
      // Assert
      expect(filter.getPaths()).toEqual(paths);
    });

    it('should handle empty filter (match all)', () => {
      // Arrange & Act
      const emptyFilter = new FolderFilter();
      const emptyArrayFilter = new FolderFilter([]);
      
      // Assert
      expect(emptyFilter.isEmpty()).toBe(true);
      expect(emptyArrayFilter.isEmpty()).toBe(true);
    });

    it('should filter out empty path strings', () => {
      // Arrange
      const pathsWithEmpties = ['/valid/path', '', '/another/path', ''];
      
      // Act
      const filter = new FolderFilter(pathsWithEmpties);
      
      // Assert
      expect(filter.getPaths()).toEqual(['/valid/path', '/another/path']);
    });
  });

  describe('When checking if paths match filter', () => {
    
    it('should match paths that start with filter paths', () => {
      // Arrange
      const filter = new FolderFilter(['/ai/deep-learning']);
      
      // Act & Assert
      expect(filter.matches('/ai/deep-learning/cnn')).toBe(true);
      expect(filter.matches('/ai/deep-learning')).toBe(true);
      expect(filter.matches('/ai/machine-learning')).toBe(false);
      expect(filter.matches('/ml/optimization')).toBe(false);
    });

    it('should match all paths when filter is empty', () => {
      // Arrange
      const filter = new FolderFilter();
      
      // Act & Assert
      expect(filter.matches('/any/path')).toBe(true);
      expect(filter.matches('/another/different/path')).toBe(true);
    });

    it('should check against any filter path', () => {
      // Arrange
      const filter = new FolderFilter(['/ai', '/ml']);
      
      // Act & Assert
      expect(filter.matches('/ai/deep-learning')).toBe(true);
      expect(filter.matches('/ml/clustering')).toBe(true);
      expect(filter.matches('/stats/probability')).toBe(false);
    });
  });
});

describe('SearchQuery Domain Entity', () => {
  
  describe('When creating a search query', () => {
    
    it('should create query with all specified parameters', () => {
      // Arrange
      const params = {
        query: 'neural networks',
        threshold: 0.8,
        limit: 20,
        folderFilter: ['/ai'],
        mode: SearchMode.HYBRID,
        includeRelated: true
      };
      
      // Act
      const searchQuery = new SearchQuery(params);
      
      // Assert
      expect(searchQuery.getTerm().getValue()).toBe('neural networks');
      expect(searchQuery.getThreshold().getValue()).toBe(0.8);
      expect(searchQuery.getLimit().getValue()).toBe(20);
      expect(searchQuery.getFolderFilter().getPaths()).toEqual(['/ai']);
      expect(searchQuery.getMode()).toBe(SearchMode.HYBRID);
      expect(searchQuery.shouldIncludeRelated()).toBe(true);
    });

    it('should use defaults for unspecified parameters', () => {
      // Arrange
      const minimalParams = { query: 'machine learning' };
      
      // Act
      const searchQuery = new SearchQuery(minimalParams);
      
      // Assert
      expect(searchQuery.getTerm().getValue()).toBe('machine learning');
      expect(searchQuery.getThreshold().getValue()).toBe(0.7); // Default
      expect(searchQuery.getLimit().getValue()).toBe(10); // Default
      expect(searchQuery.getFolderFilter().isEmpty()).toBe(true);
      expect(searchQuery.getMode()).toBe(SearchMode.SEMANTIC); // Default
      expect(searchQuery.shouldIncludeRelated()).toBe(false); // Default
    });
  });

  describe('When checking search mode', () => {
    
    it('should correctly identify semantic search', () => {
      // Arrange
      const semanticQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.SEMANTIC 
      });
      const hybridQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.HYBRID 
      });
      const keywordQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.KEYWORD 
      });
      
      // Act & Assert
      expect(semanticQuery.isSemanticSearch()).toBe(true);
      expect(hybridQuery.isSemanticSearch()).toBe(true);
      expect(keywordQuery.isSemanticSearch()).toBe(false);
    });

    it('should correctly identify keyword search', () => {
      // Arrange
      const keywordQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.KEYWORD 
      });
      const hybridQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.HYBRID 
      });
      const semanticQuery = new SearchQuery({ 
        query: 'test',
        mode: SearchMode.SEMANTIC 
      });
      
      // Act & Assert
      expect(keywordQuery.isKeywordSearch()).toBe(true);
      expect(hybridQuery.isKeywordSearch()).toBe(true);
      expect(semanticQuery.isKeywordSearch()).toBe(false);
    });
  });

  describe('When modifying a search query', () => {
    
    it('should create a new query with modifications', () => {
      // Arrange
      const original = new SearchQuery({
        query: 'original query',
        threshold: 0.7,
        limit: 10
      });
      
      // Act
      const modified = original.withModifications({
        query: 'modified query',
        limit: 20
      });
      
      // Assert
      expect(modified.getTerm().getValue()).toBe('modified query');
      expect(modified.getLimit().getValue()).toBe(20);
      expect(modified.getThreshold().getValue()).toBe(0.7); // Unchanged
      
      // Ensure original is unchanged (immutability)
      expect(original.getTerm().getValue()).toBe('original query');
      expect(original.getLimit().getValue()).toBe(10);
    });
  });

  describe('When generating cache keys', () => {
    
    it('should generate consistent cache keys for identical queries', () => {
      // Arrange
      const query1 = new SearchQuery({
        query: 'neural networks',
        threshold: 0.8,
        limit: 15,
        folderFilter: ['/ai', '/ml'],
        mode: SearchMode.SEMANTIC,
        includeRelated: true
      });
      
      const query2 = new SearchQuery({
        query: 'neural networks',
        threshold: 0.8,
        limit: 15,
        folderFilter: ['/ml', '/ai'], // Different order
        mode: SearchMode.SEMANTIC,
        includeRelated: true
      });
      
      // Act
      const key1 = query1.getCacheKey();
      const key2 = query2.getCacheKey();
      
      // Assert
      expect(key1).toBe(key2); // Should be same despite folder order
    });

    it('should generate different cache keys for different queries', () => {
      // Arrange
      const query1 = new SearchQuery({ query: 'neural networks' });
      const query2 = new SearchQuery({ query: 'deep learning' });
      
      // Act
      const key1 = query1.getCacheKey();
      const key2 = query2.getCacheKey();
      
      // Assert
      expect(key1).not.toBe(key2);
    });
  });
});