import { describe, it, expect, vi, beforeEach } from "vitest";
import { DistilBARTService } from "./DistilBARTService";
import { ClassificationError } from "../../../errors/CustomErrors";

// Mock the transformers pipeline and environment
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    allowRemoteModels: true,
    localModelPath: ''
  },
}));

// Test Helpers
const createMockClassifier = () => vi.fn();

describe("DistilBARTService", () => {
  let service: DistilBARTService;
  let mockClassifier: any;

  beforeEach(async () => {
    mockClassifier = createMockClassifier();
    
    // Setup the mock pipeline
    const { pipeline } = await import('@xenova/transformers');
    vi.mocked(pipeline).mockResolvedValue(mockClassifier);
    
    service = new DistilBARTService();
  });

  describe("dynamic label management", () => {
    it("should allow adding custom labels", async () => {
      await service.init();
      
      service.addLabel("Mathematics");
      service.addLabel("Physics");
      
      // Should fail initially since addLabel method doesn't exist yet
      expect(service.getLabels()).toContain("Mathematics");
      expect(service.getLabels()).toContain("Physics");
    });

    it("should allow removing labels", async () => {
      await service.init();
      
      service.addLabel("Mathematics");
      service.addLabel("Physics");
      service.removeLabel("Mathematics");
      
      // Should fail initially since removeLabel method doesn't exist yet
      expect(service.getLabels()).not.toContain("Mathematics");
      expect(service.getLabels()).toContain("Physics");
    });

    it("should start with default Computer Science label", async () => {
      await service.init();
      
      // Should fail initially since getLabels method doesn't exist yet
      expect(service.getLabels()).toContain("Computer Science");
    });

    it("should not add duplicate labels", async () => {
      await service.init();
      
      service.addLabel("Mathematics");
      service.addLabel("Mathematics");
      
      const mathLabels = service.getLabels().filter(label => label === "Mathematics");
      expect(mathLabels).toHaveLength(1);
    });

    it("should handle removing non-existent labels gracefully", async () => {
      await service.init();
      
      expect(() => service.removeLabel("NonExistent")).not.toThrow();
    });
  });

  describe("classification with confidence scores", () => {
    it("should return classification result with confidence score for Studying", async () => {
      await service.init();
      
      const mockResult = {
        scores: [0.85, 0.15],
        labels: ["Computer Science", "Other"]
      };
      mockClassifier.mockResolvedValue(mockResult);
      
      const result = await service.classifyWithConfidence("studying computer algorithms");
      
      // Should fail initially since classifyWithConfidence method doesn't exist yet
      expect(result).toEqual({
        classification: "Studying",
        confidence: 0.85
      });
    });

    it("should return classification result with confidence score for Idle", async () => {
      await service.init();
      
      const mockResult = {
        scores: [0.10],
        labels: ["Computer Science"]
      };
      mockClassifier.mockResolvedValue(mockResult);
      
      const result = await service.classifyWithConfidence("watching cat videos");
      
      expect(result).toEqual({
        classification: "Idle",
        confidence: 0.10
      });
    });

    it("should return Undetermined classification for medium confidence", async () => {
      await service.init();
      
      const mockResult = {
        scores: [0.50, 0.50],
        labels: ["Computer Science", "Other"]
      };
      mockClassifier.mockResolvedValue(mockResult);
      
      const result = await service.classifyWithConfidence("reading general news");
      
      expect(result).toEqual({
        classification: "Undetermined",
        confidence: 0.50
      });
    });

    it("should work with multiple custom labels", async () => {
      await service.init();
      service.addLabel("Mathematics");
      service.addLabel("Physics");
      
      const mockResult = {
        scores: [0.30, 0.85, 0.10],
        labels: ["Computer Science", "Mathematics", "Physics"]
      };
      mockClassifier.mockResolvedValue(mockResult);
      
      const result = await service.classifyWithConfidence("solving calculus problems");
      
      // Should classify as Studying since Mathematics score (0.85) meets threshold
      expect(result).toEqual({
        classification: "Studying",
        confidence: 0.85
      });
    });
  });

  describe("backward compatibility", () => {
    it("should maintain existing classify method behavior", async () => {
      await service.init();
      
      const mockResult = {
        scores: [0.85],
        labels: ["Computer Science"]
      };
      mockClassifier.mockResolvedValue(mockResult);
      
      const result = await service.classify("studying algorithms");
      
      expect(result).toBe("Studying");
    });
  });

  describe("error handling", () => {
    it("should throw ClassificationError when not initialized", async () => {
      await expect(service.classifyWithConfidence("test"))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should throw ClassificationError for empty text", async () => {
      await service.init();
      
      await expect(service.classifyWithConfidence(""))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should throw ClassificationError for whitespace-only text", async () => {
      await service.init();
      
      await expect(service.classifyWithConfidence("   \t\n   "))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should throw ClassificationError for non-string input", async () => {
      await service.init();
      
      await expect(service.classifyWithConfidence(null as any))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should throw ClassificationError for undefined input", async () => {
      await service.init();
      
      await expect(service.classifyWithConfidence(undefined as any))
        .rejects
        .toThrow(ClassificationError);
    });

    it("should throw ClassificationError for number input", async () => {
      await service.init();
      
      await expect(service.classifyWithConfidence(123 as any))
        .rejects
        .toThrow(ClassificationError);
    });
  });

  describe("label validation", () => {
    it("should throw error when adding empty label", async () => {
      await service.init();
      
      expect(() => service.addLabel(""))
        .toThrow(ClassificationError);
    });

    it("should throw error when adding whitespace-only label", async () => {
      await service.init();
      
      expect(() => service.addLabel("   \t\n   "))
        .toThrow(ClassificationError);
    });

    it("should throw error when adding non-string label", async () => {
      await service.init();
      
      expect(() => service.addLabel(null as any))
        .toThrow(ClassificationError);
    });

    it("should throw error when removing empty label", async () => {
      await service.init();
      
      expect(() => service.removeLabel(""))
        .toThrow(ClassificationError);
    });

    it("should throw error when removing non-string label", async () => {
      await service.init();
      
      expect(() => service.removeLabel(123 as any))
        .toThrow(ClassificationError);
    });
  });

});