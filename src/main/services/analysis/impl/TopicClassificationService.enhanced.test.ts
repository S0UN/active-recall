import { describe, it, expect, beforeEach } from 'vitest';
import { TopicClassificationService } from './TopicClassificationService';

describe('TopicClassificationService - Enhanced Topic Label Returns', () => {
  let service: TopicClassificationService;

  beforeEach(async () => {
    service = new TopicClassificationService('distilbert-base-uncased-mnli');
    await service.init();
  });

  describe('classification result format', () => {
    it('should return the actual topic name when confidence is above threshold', async () => {
      service.setTopicConfig('computer science', 0.3);
      
      // Mock the classifier to return high confidence
      const originalPerformZeroShot = (service as any).performZeroShotClassification;
      (service as any).performZeroShotClassification = async () => 0.8; // High confidence
      
      const result = await service.classifyWithConfidence('JavaScript programming tutorial');
      
      expect(result.classification).toBe('computer science');
      expect(result.confidence).toBe(0.8);
      
      // Restore original method
      (service as any).performZeroShotClassification = originalPerformZeroShot;
    });

    it('should return idle when confidence is below threshold', async () => {
      service.setTopicConfig('biology', 0.7);
      
      // Mock the classifier to return low confidence
      const originalPerformZeroShot = (service as any).performZeroShotClassification;
      (service as any).performZeroShotClassification = async () => 0.4; // Low confidence
      
      const result = await service.classifyWithConfidence('Random social media content');
      
      expect(result.classification).toBe('idle');
      expect(result.confidence).toBe(0.4);
      
      // Restore original method
      (service as any).performZeroShotClassification = originalPerformZeroShot;
    });

    it('should return the best matching topic when multiple topics are configured', async () => {
      await service.addLabel('computer science');
      await service.addLabel('biology');
      
      // Mock the classifier to return different scores for different topics
      const originalScoreAgainstAllTopics = (service as any).scoreAgainstAllTopics;
      (service as any).scoreAgainstAllTopics = async () => {
        const scores = new Map();
        scores.set('computer science', 0.9);
        scores.set('biology', 0.3);
        return scores;
      };
      
      const result = await service.classifyWithConfidence('JavaScript functions and arrays');
      
      expect(result.classification).toBe('computer science');
      expect(result.confidence).toBe(0.9);
      
      // Restore original method
      (service as any).scoreAgainstAllTopics = originalScoreAgainstAllTopics;
    });

    it('should use classify method and return topic string directly', async () => {
      service.setTopicConfig('mathematics', 0.4);
      
      // Mock the classifier
      const originalPerformZeroShot = (service as any).performZeroShotClassification;
      (service as any).performZeroShotClassification = async () => 0.8;
      
      const result = await service.classify('Calculus derivatives and integrals');
      
      expect(result).toBe('mathematics');
      
      // Restore original method
      (service as any).performZeroShotClassification = originalPerformZeroShot;
    });

    it('should return idle from classify method when confidence is below threshold', async () => {
      service.setTopicConfig('physics', 0.6);
      
      // Mock the classifier to return low confidence
      const originalPerformZeroShot = (service as any).performZeroShotClassification;
      (service as any).performZeroShotClassification = async () => 0.3;
      
      const result = await service.classify('Entertainment news');
      
      expect(result).toBe('idle');
      
      // Restore original method
      (service as any).performZeroShotClassification = originalPerformZeroShot;
    });
  });
});