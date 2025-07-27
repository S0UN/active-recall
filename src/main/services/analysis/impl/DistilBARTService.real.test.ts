import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DistilBARTService } from "./DistilBARTService";

/**
 * Real AI Pipeline Tests - Actual DistilBERT Zero-Shot Classification
 * 
 * These tests use the actual DistilBERT model to classify real text,
 * just like the TesseractOCR tests use the actual Tesseract.js engine.
 * 
 * Note: First run may take longer as the model downloads and caches locally.
 */
describe("DistilBARTService - Real AI Pipeline Tests", () => {
  let service: DistilBARTService;

  beforeAll(async () => {
    console.log("Initializing real DistilBERT model...");
    service = new DistilBARTService();
    
    try {
      await service.init();
      console.log("DistilBERT model loaded successfully!");
    } catch (error) {
      console.error("Failed to load DistilBERT model:", error);
      throw error;
    }
  }, 120000); // 2 minute timeout for model loading

  afterAll(async () => {
    // Cleanup if needed
    console.log("Cleaning up DistilBERT resources...");
  });

  describe("real programming content classification", () => {
    it("should classify actual programming text with real AI", async () => {
      const programmingText = "Learning JavaScript async/await patterns and Promise chaining for better asynchronous code handling";
      
      console.log(`Testing: "${programmingText}"`);
      
      const result = await service.classifyWithConfidence(programmingText);
      
      console.log(`Real AI Result: ${result.classification} (confidence: ${result.confidence.toFixed(3)})`);
      
      // Verify we get valid results from real AI
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.confidence).toBe("number");
      expect(Number.isFinite(result.confidence)).toBe(true);
      
      // Programming content should likely have reasonable confidence
      // (Don't assume specific classification, let AI decide)
      if (result.classification === "Studying") {
        console.log("AI correctly identified programming content as studying");
      } else {
        console.log(`AI classified programming content as: ${result.classification}`);
      }
    }, 30000);

    it("should classify TypeScript/React content with real AI", async () => {
      const reactText = "Building React components with TypeScript, using hooks like useState and useEffect for state management";
      
      console.log(`Testing: "${reactText}"`);
      
      const result = await service.classifyWithConfidence(reactText);
      
      console.log(`Real AI Result: ${result.classification} (confidence: ${result.confidence.toFixed(3)})`);
      
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 30000);
  });

  describe("real entertainment content classification", () => {
    it("should classify actual entertainment text with real AI", async () => {
      const entertainmentText = "Watching funny cat videos on YouTube and browsing memes on social media";
      
      console.log(`Testing: "${entertainmentText}"`);
      
      const result = await service.classifyWithConfidence(entertainmentText);
      
      console.log(`Real AI Result: ${result.classification} (confidence: ${result.confidence.toFixed(3)})`);
      
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      
      if (result.classification === "Idle") {
        console.log("AI correctly identified entertainment content as idle");
      } else {
        console.log(`AI classified entertainment content as: ${result.classification}`);
      }
    }, 30000);

    it("should classify gaming content with real AI", async () => {
      const gamingText = "Playing video games, streaming on Twitch, and chatting with friends in Discord";
      
      console.log(`Testing: "${gamingText}"`);
      
      const result = await service.classifyWithConfidence(gamingText);
      
      console.log(`Real AI Result: ${result.classification} (confidence: ${result.confidence.toFixed(3)})`);
      
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 30000);
  });

  describe("real academic content with custom labels", () => {
    it("should work with custom Mathematics label and real AI", async () => {
      // Add custom academic subjects
      service.addLabel("Mathematics");
      service.addLabel("Physics");
      
      const mathText = "Solving differential equations and studying calculus for advanced mathematics course";
      
      console.log(`Testing with custom labels: ${service.getLabels().join(", ")}`);
      console.log(`Testing: "${mathText}"`);
      
      const result = await service.classifyWithConfidence(mathText);
      
      console.log(`Real AI Result: ${result.classification} (confidence: ${result.confidence.toFixed(3)})`);
      
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(service.getLabels()).toContain("Mathematics");
      expect(service.getLabels()).toContain("Physics");
      
      console.log(`Labels used: ${service.getLabels().join(", ")}`);
    }, 30000);
  });

  describe("real AI threshold behavior", () => {
    it("should demonstrate actual threshold logic with various content", async () => {
      const testTexts = [
        {
          text: "Advanced computer science algorithms and data structures implementation",
          category: "Technical"
        },
        {
          text: "Browsing social media and checking random news articles",
          category: "Casual"
        },
        {
          text: "Reading about general technology trends and industry news",
          category: "Mixed"
        }
      ];

      console.log(`Testing threshold behavior with real AI:`);
      console.log(`   Studying threshold: ≥0.80`);
      console.log(`   Idle threshold: ≤0.15`);
      console.log(`   Undetermined: 0.15 < confidence < 0.80`);
      console.log("");

      for (const test of testTexts) {
        const result = await service.classifyWithConfidence(test.text);
        
        console.log(`${test.category}: "${test.text}"`);
        console.log(`   -> ${result.classification} (${result.confidence.toFixed(3)})`);
        
        // Verify threshold logic is working correctly
        if (result.confidence >= 0.80) {
          expect(result.classification).toBe("Studying");
        } else if (result.confidence <= 0.15) {
          expect(result.classification).toBe("Idle");
        } else {
          expect(result.classification).toBe("Undetermined");
        }
        
        console.log("");
      }
    }, 90000);
  });

  describe("real AI consistency and reliability", () => {
    it("should give consistent results for identical input with real AI", async () => {
      const testText = "Learning software engineering principles and design patterns";
      
      console.log(`Testing consistency with real AI: "${testText}"`);
      
      const results = [];
      for (let i = 1; i <= 3; i++) {
        const result = await service.classifyWithConfidence(testText);
        results.push(result);
        console.log(`   Run ${i}: ${result.classification} (${result.confidence.toFixed(3)})`);
      }
      
      // All results should be identical with real AI
      const firstResult = results[0];
      for (const result of results) {
        expect(result.classification).toBe(firstResult.classification);
        expect(result.confidence).toBe(firstResult.confidence);
      }
      
      console.log("Real AI produced consistent results across multiple runs!");
    }, 60000);

    it("should handle edge cases with real AI", async () => {
      const edgeCases = [
        "AI", // Very short
        "programming", // Single word
        "Learning", // Single word, different context
      ];

      console.log("Testing edge cases with real AI:");

      for (const text of edgeCases) {
        const result = await service.classifyWithConfidence(text);
        
        console.log(`   "${text}" → ${result.classification} (${result.confidence.toFixed(3)})`);
        
        expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    }, 60000);
  });

  describe("real AI performance", () => {
    it("should classify content efficiently with real AI", async () => {
      const testText = "Building web applications with modern JavaScript frameworks and libraries";
      
      console.log(`Performance test with real AI: "${testText}"`);
      
      const startTime = Date.now();
      const result = await service.classifyWithConfidence(testText);
      const duration = Date.now() - startTime;
      
      console.log(`   Result: ${result.classification} (${result.confidence.toFixed(3)})`);
      console.log(`   Duration: ${duration}ms`);
      
      expect(["Studying", "Idle", "Undetermined"]).toContain(result.classification);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 15000);
  });

  describe("backward compatibility with real AI", () => {
    it("should maintain legacy method compatibility with real AI", async () => {
      const testText = "Debugging JavaScript code and fixing React component issues";
      
      console.log(`Testing backward compatibility: "${testText}"`);
      
      const legacyResult = await service.classify(testText);
      const newResult = await service.classifyWithConfidence(testText);
      
      console.log(`   Legacy classify(): ${legacyResult}`);
      console.log(`   New classifyWithConfidence(): ${newResult.classification} (${newResult.confidence.toFixed(3)})`);
      
      // Both methods should return the same classification
      expect(legacyResult).toBe(newResult.classification);
      expect(["Studying", "Idle", "Undetermined"]).toContain(legacyResult);
    }, 30000);
  });
});