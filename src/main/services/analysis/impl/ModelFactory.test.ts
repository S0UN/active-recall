import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelFactory } from './ModelFactory';
import { SupportedModel } from '../IClassificationModelConfig';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('./UniversalClassificationService');

describe('ModelFactory', () => {
  let factory: ModelFactory;
  
  beforeEach(() => {
    factory = new ModelFactory();
  });
  
  describe('createClassifier', () => {
    it('should create classifier for supported model', async () => {
      const { UniversalClassificationService } = await import('./UniversalClassificationService');
      const mockService = {
        init: vi.fn().mockResolvedValue(undefined),
        classify: vi.fn(),
        classifyWithConfidence: vi.fn(),
        getModelInfo: vi.fn()
      };
      
      vi.mocked(UniversalClassificationService).mockImplementation(() => mockService as any);
      
      const classifier = await factory.createClassifier('facebook/bart-large-mnli');
      
      expect(UniversalClassificationService).toHaveBeenCalledWith(
        'facebook/bart-large-mnli'
      );
      expect(mockService.init).toHaveBeenCalled();
      expect(classifier).toBe(mockService);
    });
    
    it('should reject unsupported model', async () => {
      await expect(
        factory.createClassifier('unsupported-model' as SupportedModel)
      ).rejects.toThrow('Unsupported model: unsupported-model');
    });
  });
  
  describe('getSupportedModels', () => {
    it('should return all supported models', () => {
      const models = factory.getSupportedModels();
      
      expect(models).toContain('distilbert-base-uncased-mnli');
      expect(models).toContain('roberta-large-mnli');
      expect(models).toContain('microsoft/deberta-v3-large');
      expect(models).toContain('facebook/bart-large-mnli');
      expect(models).toHaveLength(4);
    });
  });
  
  describe('getModelInfo', () => {
    it('should return model information for supported model', () => {
      const info = factory.getModelInfo('facebook/bart-large-mnli');
      
      expect(info).toEqual({
        memoryRequirement: '2GB',
        initializationTime: '10-15s',
        accuracy: 'highest',
        localModelPath: './models/bart-large-mnli',
        modelSize: '1.63GB'
      });
    });
    
    it('should reject unsupported model', () => {
      expect(() => {
        factory.getModelInfo('unsupported-model' as SupportedModel);
      }).toThrow('Unsupported model: unsupported-model');
    });
  });
  
  describe('isModelAvailable', () => {
    it('should return true when all required files exist', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('config.json') || pathStr.includes('tokenizer.json')) {
          return true;
        }
        if (pathStr.endsWith('onnx')) {
          return true;
        }
        return false;
      });
      
      vi.mocked(fs.readdirSync).mockReturnValue(['model.onnx', 'model_q4.onnx'] as any);
      
      const isAvailable = await factory.isModelAvailable('distilbert-base-uncased-mnli');
      
      expect(isAvailable).toBe(true);
    });
    
    it('should return false when config.json is missing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('config.json')) {
          return false;
        }
        return true;
      });
      
      const isAvailable = await factory.isModelAvailable('distilbert-base-uncased-mnli');
      
      expect(isAvailable).toBe(false);
    });
    
    it('should return false when onnx directory is missing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('onnx')) {
          return false;
        }
        return true;
      });
      
      const isAvailable = await factory.isModelAvailable('distilbert-base-uncased-mnli');
      
      expect(isAvailable).toBe(false);
    });
    
    it('should return false when no onnx model files exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['config.json', 'other.txt'] as any);
      
      const isAvailable = await factory.isModelAvailable('distilbert-base-uncased-mnli');
      
      expect(isAvailable).toBe(false);
    });
    
    it('should handle file system errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });
      
      const isAvailable = await factory.isModelAvailable('distilbert-base-uncased-mnli');
      
      expect(isAvailable).toBe(false);
    });
  });
});