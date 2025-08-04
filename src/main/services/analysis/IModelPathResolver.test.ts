import { describe, it, expect } from 'vitest';
import { 
  QuantizedModelPathResolver, 
  FullModelPathResolver, 
  ModelVariant 
} from './IModelPathResolver';

describe('ModelPathResolvers', () => {
  describe('QuantizedModelPathResolver', () => {
    const resolver = new QuantizedModelPathResolver();

    it('should resolve quantized model paths correctly', () => {
      expect(resolver.resolvePath('distilbert-base-uncased-mnli')).toBe('./models/distilbert-mnli');
      expect(resolver.resolvePath('roberta-large-mnli')).toBe('./models/roberta-large-mnli');
      expect(resolver.resolvePath('facebook/bart-large-mnli')).toBe('./models/bart-large-mnli');
      expect(resolver.resolvePath('microsoft/deberta-v3-large')).toBe('./models/deberta-v3-large');
    });

    it('should return quantized variant', () => {
      expect(resolver.getVariant()).toBe(ModelVariant.QUANTIZED);
    });

    it('should handle unknown model names', () => {
      expect(resolver.resolvePath('unknown-model')).toBe('./models/unknown-model');
    });
  });

  describe('FullModelPathResolver', () => {
    const resolver = new FullModelPathResolver();

    it('should resolve full model paths correctly', () => {
      expect(resolver.resolvePath('distilbert-base-uncased-mnli')).toBe('./models-full/distilbert-mnli');
      expect(resolver.resolvePath('roberta-large-mnli')).toBe('./models-full/roberta-large-mnli');
      expect(resolver.resolvePath('facebook/bart-large-mnli')).toBe('./models-full/bart-large-mnli');
      expect(resolver.resolvePath('microsoft/deberta-v3-large')).toBe('./models-full/deberta-v3-large');
    });

    it('should return full variant', () => {
      expect(resolver.getVariant()).toBe(ModelVariant.FULL);
    });

    it('should handle unknown model names', () => {
      expect(resolver.resolvePath('unknown-model')).toBe('./models-full/unknown-model');
    });
  });
});