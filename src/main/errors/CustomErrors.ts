// Custom error classes for domain-specific errors

export abstract class DomainError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Vision/OCR related errors
export class VisionServiceError extends DomainError {}
export class OcrInitializationError extends DomainError {}
export class OcrProcessingError extends DomainError {}
export class ScreenCaptureError extends DomainError {}

// Classification errors
export class ClassificationError extends DomainError {}

// Window management errors
export class WindowDetectionError extends DomainError {}

// Polling errors
export class PollingSystemError extends DomainError {}

// Cache errors
export class CacheError extends DomainError {}

// Configuration errors
export class ConfigurationError extends DomainError {}

// Network/Batching errors
export class NetworkError extends DomainError {}
export class BatchingError extends DomainError {}

// Validation errors
export class ValidationError extends DomainError {}