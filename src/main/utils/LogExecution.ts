import { container } from 'tsyringe';
import { app } from 'electron';
import { ILogger } from './ILogger';

// Configuration for the decorator
export interface LogExecutionOptions {
  logArgs?: boolean;
  logResult?: boolean;
}

// Retrieve the logger instance from the container
const logger = container.resolve<ILogger>('LoggerService');

// Determine if we are in development mode
const isDevelopment = !app.isPackaged;

export function LogExecution(options: LogExecutionOptions = {}) {
  // Set default behaviors based on the environment
  const {
    logArgs = isDevelopment, // Log args in dev by default, but not in prod
    logResult = false,       // Never log results by default
  } = options;

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const className = target.constructor.name;

      if (logArgs) {
        // To avoid logging huge data structures, we'll be selective.
        const argsToLog = args.map(arg => {
          if (Buffer.isBuffer(arg)) {
            return `Buffer(size=${arg.length})`;
          }
          // Add other type checks as needed
          return arg;
        });
        logger.info(`[${className}] Entering '${propertyKey}' with args:`, ...argsToLog);
      } else {
        logger.info(`[${className}] Entering '${propertyKey}'.`);
      }

      try {
        const result = await originalMethod.apply(this, args);
        
        if (logResult) {
            logger.info(`[${className}] Exited '${propertyKey}' successfully with result.`);
        } else {
            logger.info(`[${className}] Exited '${propertyKey}' successfully.`);
        }

        return result;
      } catch (error) {
        logger.error(`[${className}] Error in '${propertyKey}':`, error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}
