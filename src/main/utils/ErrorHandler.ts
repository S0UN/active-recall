import { ILogger } from './ILogger';
import { DomainError } from '../errors/CustomErrors';

export interface ErrorContext {
  traceId?: string;
  userId?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

export class ErrorHandler {
  constructor(private readonly logger: ILogger) {}

  public logAndThrow(error: Error, context?: ErrorContext): never {
    this.logError(error, context);
    throw error;
  }

  public logError(error: Error, context?: ErrorContext): void {
    const errorInfo = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...context,
    };

    if (error instanceof DomainError) {
      this.logger.error('Domain error occurred', errorInfo);
      
      if (error.cause) {
        this.logger.error('Caused by', {
          message: error.cause.message,
          name: error.cause.name,
          stack: error.cause.stack,
        });
      }
    } else {
      this.logger.error('Unexpected error occurred', errorInfo);
    }
  }

  public handleAsyncError(operation: string) {
    return (error: Error) => {
      this.logError(error, { operation });
      // In production, you might want to send to error reporting service
    };
  }
}

// Global error handling utility
export const createErrorHandler = (logger: ILogger): ErrorHandler => {
  return new ErrorHandler(logger);
};