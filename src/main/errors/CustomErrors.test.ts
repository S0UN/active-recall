import { describe, it, expect } from "vitest";
import {
  DomainError,
  VisionServiceError,
  OcrInitializationError,
  OcrProcessingError,
  ScreenCaptureError,
  ClassificationError,
  WindowDetectionError,
  PollingSystemError,
  CacheError,
  ConfigurationError,
  NetworkError,
  BatchingError,
  ValidationError
} from "./CustomErrors";

describe("Custom Error Classes", () => {
  describe("DomainError", () => {
    class TestDomainError extends DomainError {}

    it("should create error with message", () => {
      const message = "Test domain error";
      const error = new TestDomainError(message);

      expect(error.message).toBe(message);
      expect(error.name).toBe("TestDomainError");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create error with message and cause", () => {
      const message = "Test domain error";
      const cause = new Error("Original error");
      const error = new TestDomainError(message, cause);

      expect(error.message).toBe(message);
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("TestDomainError");
    });

    it("should have proper stack trace", () => {
      const error = new TestDomainError("Test error");
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("TestDomainError");
    });
  });

  describe("Vision and OCR Errors", () => {
    it("should create VisionServiceError correctly", () => {
      const error = new VisionServiceError("Vision service failed");

      expect(error.message).toBe("Vision service failed");
      expect(error.name).toBe("VisionServiceError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create OcrInitializationError correctly", () => {
      const cause = new Error("Tesseract worker failed");
      const error = new OcrInitializationError("Failed to initialize OCR", cause);

      expect(error.message).toBe("Failed to initialize OCR");
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("OcrInitializationError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create OcrProcessingError correctly", () => {
      const error = new OcrProcessingError("Failed to process image");

      expect(error.message).toBe("Failed to process image");
      expect(error.name).toBe("OcrProcessingError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create ScreenCaptureError correctly", () => {
      const error = new ScreenCaptureError("No display found");

      expect(error.message).toBe("No display found");
      expect(error.name).toBe("ScreenCaptureError");
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe("Application Domain Errors", () => {
    it("should create ClassificationError correctly", () => {
      const error = new ClassificationError("Classification model failed");

      expect(error.message).toBe("Classification model failed");
      expect(error.name).toBe("ClassificationError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create WindowDetectionError correctly", () => {
      const error = new WindowDetectionError("Active window not detected");

      expect(error.message).toBe("Active window not detected");
      expect(error.name).toBe("WindowDetectionError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create PollingSystemError correctly", () => {
      const error = new PollingSystemError("Polling system crashed");

      expect(error.message).toBe("Polling system crashed");
      expect(error.name).toBe("PollingSystemError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create CacheError correctly", () => {
      const error = new CacheError("Cache entry not found");

      expect(error.message).toBe("Cache entry not found");
      expect(error.name).toBe("CacheError");
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe("Infrastructure Errors", () => {
    it("should create ConfigurationError correctly", () => {
      const error = new ConfigurationError("Invalid configuration");

      expect(error.message).toBe("Invalid configuration");
      expect(error.name).toBe("ConfigurationError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create NetworkError correctly", () => {
      const cause = new Error("Connection timeout");
      const error = new NetworkError("Network request failed", cause);

      expect(error.message).toBe("Network request failed");
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("NetworkError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create BatchingError correctly", () => {
      const error = new BatchingError("Batch processing failed");

      expect(error.message).toBe("Batch processing failed");
      expect(error.name).toBe("BatchingError");
      expect(error).toBeInstanceOf(DomainError);
    });

    it("should create ValidationError correctly", () => {
      const error = new ValidationError("Input validation failed");

      expect(error.message).toBe("Input validation failed");
      expect(error.name).toBe("ValidationError");
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe("Error inheritance and type checking", () => {
    it("should properly identify error types with instanceof", () => {
      const visionError = new VisionServiceError("Vision failed");
      const ocrError = new OcrProcessingError("OCR failed");
      const cacheError = new CacheError("Cache failed");

      expect(visionError instanceof VisionServiceError).toBe(true);
      expect(visionError instanceof DomainError).toBe(true);
      expect(visionError instanceof Error).toBe(true);

      expect(ocrError instanceof OcrProcessingError).toBe(true);
      expect(ocrError instanceof DomainError).toBe(true);
      expect(ocrError instanceof VisionServiceError).toBe(false);

      expect(cacheError instanceof CacheError).toBe(true);
      expect(cacheError instanceof DomainError).toBe(true);
      expect(cacheError instanceof VisionServiceError).toBe(false);
    });

    it("should maintain error chain with cause", () => {
      const originalError = new Error("Original system error");
      const domainError = new VisionServiceError("Vision service failed", originalError);
      const applicationError = new ClassificationError("Classification failed", domainError);

      expect(applicationError.cause).toBe(domainError);
      expect(domainError.cause).toBe(originalError);
      expect(applicationError.message).toBe("Classification failed");
      expect(domainError.message).toBe("Vision service failed");
      expect(originalError.message).toBe("Original system error");
    });
  });
});