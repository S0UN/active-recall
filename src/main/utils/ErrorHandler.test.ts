import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorHandler, createErrorHandler, type ErrorContext } from "./ErrorHandler";
import { ILogger } from "./ILogger";
import { DomainError, VisionServiceError, OcrProcessingError } from "../errors/CustomErrors";

const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe("ErrorHandler", () => {
  let mockLogger: ILogger;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    mockLogger = createMockLogger();
    errorHandler = new ErrorHandler(mockLogger);
  });

  describe("logError", () => {
    it("should log domain errors with proper context", () => {
      const originalError = new Error("Original cause");
      const domainError = new VisionServiceError("Vision service failed", originalError);
      const context: ErrorContext = {
        traceId: "trace-123",
        operation: "captureScreen",
        metadata: { userId: "user-456" }
      };

      errorHandler.logError(domainError, context);

      expect(mockLogger.error).toHaveBeenCalledWith("Domain error occurred", {
        message: "Vision service failed",
        name: "VisionServiceError",
        stack: domainError.stack,
        traceId: "trace-123",
        operation: "captureScreen",
        metadata: { userId: "user-456" }
      });

      expect(mockLogger.error).toHaveBeenCalledWith("Caused by", {
        message: "Original cause",
        name: "Error",
        stack: originalError.stack
      });
    });

    it("should log domain errors without cause", () => {
      const domainError = new OcrProcessingError("OCR processing failed");

      errorHandler.logError(domainError);

      expect(mockLogger.error).toHaveBeenCalledWith("Domain error occurred", {
        message: "OCR processing failed",
        name: "OcrProcessingError",
        stack: domainError.stack
      });

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it("should log non-domain errors as unexpected errors", () => {
      const genericError = new Error("Something went wrong");
      const context: ErrorContext = {
        operation: "unknownOperation"
      };

      errorHandler.logError(genericError, context);

      expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", {
        message: "Something went wrong",
        name: "Error",
        stack: genericError.stack,
        operation: "unknownOperation"
      });
    });

    it("should handle errors without context", () => {
      const error = new Error("No context error");

      errorHandler.logError(error);

      expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", {
        message: "No context error",
        name: "Error",
        stack: error.stack
      });
    });
  });

  describe("logAndThrow", () => {
    it("should log error and then throw it", () => {
      const error = new VisionServiceError("Test error");
      const context: ErrorContext = { operation: "test" };

      expect(() => errorHandler.logAndThrow(error, context)).toThrow(VisionServiceError);
      expect(mockLogger.error).toHaveBeenCalledWith("Domain error occurred", expect.objectContaining({
        message: "Test error",
        name: "VisionServiceError",
        operation: "test"
      }));
    });

    it("should preserve error type when throwing", () => {
      const specificError = new OcrProcessingError("Specific error");

      try {
        errorHandler.logAndThrow(specificError);
      } catch (thrown) {
        expect(thrown).toBe(specificError);
        expect(thrown).toBeInstanceOf(OcrProcessingError);
        expect(thrown).toBeInstanceOf(DomainError);
      }
    });
  });

  describe("handleAsyncError", () => {
    it("should return a function that logs errors with operation context", () => {
      const operation = "backgroundTask";
      const error = new Error("Async operation failed");
      
      const handler = errorHandler.handleAsyncError(operation);
      
      expect(typeof handler).toBe("function");
      
      handler(error);
      
      expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", {
        message: "Async operation failed",
        name: "Error",
        stack: error.stack,
        operation: "backgroundTask"
      });
    });

    it("should handle domain errors in async context", () => {
      const operation = "asyncVisionProcessing";
      const domainError = new VisionServiceError("Async vision failed");
      
      const handler = errorHandler.handleAsyncError(operation);
      handler(domainError);
      
      expect(mockLogger.error).toHaveBeenCalledWith("Domain error occurred", {
        message: "Async vision failed",
        name: "VisionServiceError",
        stack: domainError.stack,
        operation: "asyncVisionProcessing"
      });
    });
  });

  describe("error context handling", () => {
    it("should include all context fields in log", () => {
      const error = new Error("Context test");
      const context: ErrorContext = {
        traceId: "trace-789",
        userId: "user-123",
        operation: "fullContextTest",
        metadata: {
          sessionId: "session-456",
          source: "automated-test",
          timestamp: Date.now()
        }
      };

      errorHandler.logError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", {
        message: "Context test",
        name: "Error",
        stack: error.stack,
        traceId: "trace-789",
        userId: "user-123",
        operation: "fullContextTest",
        metadata: {
          sessionId: "session-456",
          source: "automated-test",
          timestamp: expect.any(Number)
        }
      });
    });

    it("should handle partial context", () => {
      const error = new Error("Partial context");
      const context: ErrorContext = {
        traceId: "trace-only"
      };

      errorHandler.logError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", {
        message: "Partial context",
        name: "Error",
        stack: error.stack,
        traceId: "trace-only"
      });
    });
  });
});

describe("createErrorHandler", () => {
  it("should create ErrorHandler instance with provided logger", () => {
    const mockLogger = createMockLogger();
    
    const handler = createErrorHandler(mockLogger);
    
    expect(handler).toBeInstanceOf(ErrorHandler);
  });

  it("should create working ErrorHandler", () => {
    const mockLogger = createMockLogger();
    const handler = createErrorHandler(mockLogger);
    const error = new Error("Factory test");

    handler.logError(error);

    expect(mockLogger.error).toHaveBeenCalledWith("Unexpected error occurred", expect.objectContaining({
      message: "Factory test"
    }));
  });
});