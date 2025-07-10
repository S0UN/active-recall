import { injectable } from 'tsyringe';
import log from 'electron-log';
import { app } from 'electron';
import { ILogger } from './ILogger';

@injectable()
export class LoggerService implements ILogger {

	constructor() {
		// Configure electron-log
		log.transports.file.level = app.isPackaged ? 'warn' : 'debug';
		log.transports.console.level = app.isPackaged ? 'info' : 'debug';

		// Optional: Customize log format
		log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
		log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
	}

	public info(message: string, ...args: unknown[]): void {
		log.info(message, ...args);
	}

	public warn(message: string, ...args: unknown[]): void {
		log.warn(message, ...args);
	}

	public error(message: string, error?: Error, ...args: unknown[]): void {
		if (error) {
			log.error(message, error, ...args);
		} else {
			log.error(message, ...args);
		}
	}

	public debug(message: string, ...args: unknown[]): void {
		log.debug(message, ...args);
	}
}
