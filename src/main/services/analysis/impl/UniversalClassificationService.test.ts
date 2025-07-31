import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UniversalClassificationService } from './UniversalClassificationService';

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    allowRemoteModels: true,
    localModelPath: ''
  },
}));

describe('UniversalClassificationService', () => {
  describe('model instantiation', () => {
    it('should fail to create service without initialization', async () => {
      const service = new UniversalClassificationService(
        'distilbert-base-uncased-mnli'
      );
      
      await expect(service.classify('test text')).rejects.toThrow(
        'UniversalClassificationService must be initialized first'
      );
    });
    
    it('should initialize with DistilBERT model', async () => {
      const { pipeline } = await import('@xenova/transformers');
      const mockClassifier = vi.fn() as any;
      
      vi.mocked(pipeline).mockResolvedValue(mockClassifier);
      
      const service = new UniversalClassificationService(
        'distilbert-base-uncased-mnli'
      );
      
      await service.init();
      
      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-classification',
        'distilbert-mnli'
      );
    });
    
    it('should initialize with BART model', async () => {
      const { pipeline } = await import('@xenova/transformers');
      const mockClassifier = vi.fn() as any;
      
      vi.mocked(pipeline).mockResolvedValue(mockClassifier);
      
      const service = new UniversalClassificationService(
        'facebook/bart-large-mnli'
      );
      
      await service.init();
      
      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-classification',
        'bart-large-mnli'
      );
    });
    
    it('should initialize with RoBERTa model', async () => {
      const { pipeline } = await import('@xenova/transformers');
      const mockClassifier = vi.fn() as any;
      
      vi.mocked(pipeline).mockResolvedValue(mockClassifier);
      
      const service = new UniversalClassificationService(
        'roberta-large-mnli'
      );
      
      await service.init();
      
      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-classification',
        'roberta-large-mnli'
      );
    });
    
    it('should initialize with DeBERTa model', async () => {
      const { pipeline } = await import('@xenova/transformers');
      const mockClassifier = vi.fn() as any;
      
      vi.mocked(pipeline).mockResolvedValue(mockClassifier);
      
      const service = new UniversalClassificationService(
        'microsoft/deberta-v3-large'
      );
      
      await service.init();
      
      expect(pipeline).toHaveBeenCalledWith(
        'zero-shot-classification',
        'deberta-v3-large'
      );
    });
  });
  
  describe('classification', () => {
    it('should classify text using initialized model', async () => {
      const { pipeline } = await import('@xenova/transformers');
      const mockClassifier = vi.fn().mockResolvedValue({
        scores: [0.85, 0.15],
        labels: ['studying technical or educational content', 'other']
      });
      
      (vi.mocked(pipeline) as any).mockResolvedValue(mockClassifier);
      
      const service = new UniversalClassificationService(
        'facebook/bart-large-mnli'
      );
      
      await service.init();
      const result = await service.classifyWithConfidence('test text');
      
      expect(mockClassifier).toHaveBeenCalledWith(
        'test text',
        expect.arrayContaining(['studying technical or educational content']),
        expect.objectContaining({
          hypothesis_template: 'This text is about {}'
        })
      );
      expect(result.classification).toBe('studying');
      expect(result.confidence).toBe(0.85);
    });
    
    it('should return model information', () => {
      const service = new UniversalClassificationService(
        'facebook/bart-large-mnli'
      );
      
      const modelInfo = service.getModelInfo();
      
      expect(modelInfo.modelName).toBe('facebook/bart-large-mnli');
      expect(modelInfo.accuracy).toBe('highest');
      expect(modelInfo.memoryRequirement).toBe('2GB');
    });
    
    it('should handle empty text gracefully', async () => {
      const service = new UniversalClassificationService(
        'distilbert-base-uncased-mnli'
      );
      
      await expect(service.classify('')).rejects.toThrow(
        'Text is required for classification'
      );
    });
  });
  
  describe('model configuration', () => {
    it('should configure offline mode for local models', async () => {
      const { env } = await import('@xenova/transformers');
      
      const service = new UniversalClassificationService(
        'distilbert-base-uncased-mnli'
      );
      
      await service.init();
      
      expect(env.allowRemoteModels).toBe(false);
      expect(env.localModelPath).toBe('./models/');
    });
  });
});