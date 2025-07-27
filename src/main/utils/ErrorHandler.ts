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
      this.logErrorChain(error);
    } else {
      this.logger.error('Unexpected error occurred', errorInfo);
    }
  }

  private logErrorChain(error: Error, depth = 0): void {
    if (!error || depth > 10) return; // Prevent infinite loops
    
    const domainError = error as DomainError;
    if (domainError.cause) {
      const prefix = '  '.repeat(depth + 1);
      this.logger.error(`${prefix}↳ Caused by`, {
        message: domainError.cause.message,
        name: domainError.cause.name,
        stack: domainError.cause.stack,
      });
      
      // Recursively log the full chain
      this.logErrorChain(domainError.cause, depth + 1);
    }
  }

  public handleAsyncError(operation: string) {
    return (error: Error) => {
      this.logError(error, { operation });
      // In production, you might want to send to error reporting service
    };
  }

  /**
   * Get the root cause of an error chain
   */
  public static getRootCause(error: Error): Error {
    let current = error;
    while (current instanceof DomainError && current.cause) {
      current = current.cause;
    }
    return current;
  }

  /**
   * Get all errors in the chain as a flat array
   */
  public static getErrorChain(error: Error): Error[] {
    const chain: Error[] = [error];
    let current = error;
    
    while (current instanceof DomainError && current.cause) {
      current = current.cause;
      chain.push(current);
    }
    
    return chain;
  }

  /**
   * Create a human-readable error summary showing the full chain
   */
  public static formatErrorChain(error: Error): string {
    const chain = ErrorHandler.getErrorChain(error);
    return chain
      .map((err, index) => {
        const prefix = index === 0 ? '' : '  '.repeat(index) + '↳ ';
        return `${prefix}${err.name}: ${err.message}`;
      })
      .join('\n');
  }
}

// Global error handling utility
export const createErrorHandler = (logger: ILogger): ErrorHandler => {
  return new ErrorHandler(logger);
};