import { describe, it, expect } from 'vitest';
import { TextSegmenter } from './TextSegmenter';

describe('TextSegmenter', () => {
  describe('sentence segmentation', () => {
    it('should segment text by sentences with period delimiter', () => {
      const segmenter = new TextSegmenter();
      const text = 'This is the first sentence. This is the second sentence. And this is the third.';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe('This is the first sentence.');
      expect(segments[0].type).toBe('sentence');
      expect(segments[0].startIndex).toBe(0);
      expect(segments[0].endIndex).toBe(26);
      
      expect(segments[1].text).toBe('This is the second sentence.');
      expect(segments[1].type).toBe('sentence');
      expect(segments[1].startIndex).toBe(28);
      expect(segments[1].endIndex).toBe(55);
    });
    
    it('should handle multiple sentence endings (. ! ?)', () => {
      const segmenter = new TextSegmenter();
      const text = 'First sentence. Second one! Third one? Fourth.';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(4);
      expect(segments[0].text).toBe('First sentence.');
      expect(segments[1].text).toBe('Second one!');
      expect(segments[2].text).toBe('Third one?');
      expect(segments[3].text).toBe('Fourth.');
    });
    
    it('should handle sentences with abbreviations', () => {
      const segmenter = new TextSegmenter();
      const text = 'Dr. Smith works at the U.S. headquarters. He studies A.I. and machine learning.';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('Dr. Smith works at the U.S. headquarters.');
      expect(segments[1].text).toBe('He studies A.I. and machine learning.');
    });
  });
  
  describe('line-based fallback', () => {
    it('should fall back to line-based segmentation when no sentence boundaries exist', () => {
      const segmenter = new TextSegmenter();
      const text = 'JavaScript async/await patterns\nPython data structures\nRust memory management';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe('JavaScript async/await patterns');
      expect(segments[0].type).toBe('line');
      expect(segments[1].text).toBe('Python data structures');
      expect(segments[2].text).toBe('Rust memory management');
    });
    
    it('should handle mixed line endings', () => {
      const segmenter = new TextSegmenter();
      const text = 'Line one\nLine two\r\nLine three\rLine four';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(4);
      expect(segments[0].text).toBe('Line one');
      expect(segments[1].text).toBe('Line two');
      expect(segments[2].text).toBe('Line three');
      expect(segments[3].text).toBe('Line four');
    });
  });
  
  describe('minimum length constraints', () => {
    it('should filter out segments below minimum length', () => {
      const segmenter = new TextSegmenter();
      const text = 'Hi. This is a longer sentence. Ok. Another good sentence here.';
      
      const segments = segmenter.segment(text, { minLength: 10 });
      
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('This is a longer sentence.');
      expect(segments[1].text).toBe('Another good sentence here.');
    });
    
    it('should return empty array if all segments are below minimum', () => {
      const segmenter = new TextSegmenter();
      const text = 'Hi. Ok. Yes.';
      
      const segments = segmenter.segment(text, { minLength: 10 });
      
      expect(segments).toHaveLength(0);
    });
    
    it('should pass through short text that is not segmentable', () => {
      const segmenter = new TextSegmenter();
      const text = 'Short text';
      
      const segments = segmenter.segment(text, { minLength: 5 });
      
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Short text');
      expect(segments[0].type).toBe('chunk');
    });
  });
  
  describe('maximum length constraints', () => {
    it('should split long segments that exceed maximum length', () => {
      const segmenter = new TextSegmenter();
      const longText = 'This is a very long sentence that exceeds the maximum allowed length and should be split into smaller chunks for better processing. his is a very long sentence that exceeds the maximum allowed length and should be split into smaller chunks for better processing. his is a very long sentence that exceeds the maximum allowed length and should be split into smaller chunks for better processing. his is a very long sentence that exceeds the maximum allowed length and should be split into smaller chunks for better processing.';
      
      const segments = segmenter.segment(longText, { maxLength: 50 });
      
      expect(segments.length).toBeGreaterThan(1);
      segments.forEach(segment => {
        expect(segment.text.length).toBeLessThanOrEqual(50);
      });
    });
  });
  
  describe('edge cases', () => {
    it('should handle empty text', () => {
      const segmenter = new TextSegmenter();
      
      const segments = segmenter.segment('');
      
      expect(segments).toHaveLength(0);
    });
    
    it('should handle text with only whitespace', () => {
      const segmenter = new TextSegmenter();
      
      const segments = segmenter.segment('   \n\t  ');
      
      expect(segments).toHaveLength(0);
    });
    
    it('should handle text without any delimiters', () => {
      const segmenter = new TextSegmenter();
      const text = 'This is just one long text without any sentence endings or line breaks';
      
      const segments = segmenter.segment(text);
      
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe(text);
      expect(segments[0].type).toBe('chunk');
    });
  });
  
  describe('segmentation options', () => {
    it('should prefer line-based segmentation when specified', () => {
      const segmenter = new TextSegmenter();
      const text = 'First sentence. Second sentence.\nThird line\nFourth line';
      
      const segments = segmenter.segment(text, { preferredMethod: 'line' });
      
      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe('First sentence. Second sentence.');
      expect(segments[0].type).toBe('line');
      expect(segments[1].text).toBe('Third line');
      expect(segments[1].type).toBe('line');
      expect(segments[2].text).toBe('Fourth line');
      expect(segments[2].type).toBe('line'); 
    });
  });
});