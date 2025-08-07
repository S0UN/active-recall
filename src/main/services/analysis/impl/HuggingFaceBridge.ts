import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import Logger from 'electron-log';
import { ModelInitializationError, ModelInferenceError } from '../../../errors/CustomErrors';

export type ClassificationRequest = {
  text: string;
  labels: string[];
  multiLabel?: boolean;
}

export type ClassificationResponse = {
  labels: string[];
  scores: number[];
  sequence?: string;
}

type PythonMessage = {
  type: string;
  error?: string;
  labels?: string[];
  scores?: number[];
  sequence?: string;
  status?: string;
}

/**
 * Bridge service that communicates with a Python HuggingFace transformer process.
 * 
 * This service spawns a Python subprocess that loads HuggingFace models and performs
 * zero-shot classification. Communication happens via JSON over stdin/stdout.
 * 
 * Features:
 * - Automatic model downloading and caching via HuggingFace Hub
 * - JSON-based communication protocol with the Python process
 * - Comprehensive error handling and timeout management
 * - Support for virtual environment Python detection
 */
export class HuggingFaceBridge extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly modelName: string;
  private isReady = false;
  private messageBuffer = '';

  constructor(modelName: string = 'facebook/bart-large-mnli') {
    super();
    this.modelName = modelName;
    this.pythonPath = this.determinePythonPath();
    this.scriptPath = this.determineScriptPath();
  }

  /**
   * Initializes the Python bridge and waits for the model to be ready
   */
  public async initialize(): Promise<void> {
    if (this.isReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.setupInitializationTimeout(reject);
      this.setupInitializationHandlers(resolve, reject);
      this.spawnPythonProcess();
    });
  }

  /**
   * Performs zero-shot classification using the HuggingFace model
   */
  public async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    this.ensureBridgeReady();
    
    return new Promise((resolve, reject) => {
      this.setupClassificationHandlers(resolve, reject);
      this.sendClassificationRequest(request);
      this.setupClassificationTimeout(reject);
    });
  }

  /**
   * Checks if the Python bridge is alive and responsive
   */
  public async ping(): Promise<boolean> {
    if (!this.pythonProcess) {
      return false;
    }

    return new Promise((resolve) => {
      this.setupPingHandlers(resolve);
      this.sendPingRequest();
      this.setupPingTimeout(resolve);
    });
  }

  /**
   * Gracefully shuts down the Python bridge
   */
  public async shutdown(): Promise<void> {
    if (!this.pythonProcess) {
      return;
    }

    return new Promise((resolve) => {
      this.sendShutdownRequest();
      this.setupShutdownTimeout(resolve);
    });
  }

  /**
   * Gets the readiness state of the bridge
   */
  public get ready(): boolean {
    return this.isReady;
  }

  // Private helper methods for initialization

  /**
   * Determines the correct Python executable path
   */
  private determinePythonPath(): string {
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3');
    
    if (this.fileExists(venvPython)) {
      Logger.debug('Using virtual environment Python', { path: venvPython });
      return venvPython;
    }
    
    Logger.debug('Using system Python');
    return 'python3';
  }

  /**
   * Determines the path to the HuggingFace classifier script
   */
  private determineScriptPath(): string {
    return path.join(__dirname, '..', 'python', 'huggingface_classifier.py');
  }

  /**
   * Checks if a file exists at the given path
   */
  private fileExists(filePath: string): boolean {
    const fs = require('fs');
    return fs.existsSync(filePath);
  }

  /**
   * Sets up timeout for initialization
   */
  private setupInitializationTimeout(reject: (reason?: any) => void): void {
    const timeout = setTimeout(() => {
      reject(new ModelInitializationError('Python bridge initialization timeout'));
    }, 60000); // 60 seconds for model download/initialization

    this.once('initialized', () => clearTimeout(timeout));
  }

  /**
   * Sets up event handlers for initialization
   */
  private setupInitializationHandlers(
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (reason?: any) => void
  ): void {
    this.once('initialized', () => {
      this.isReady = true;
      Logger.info('HuggingFace bridge initialized successfully');
      resolve();
    });

    this.once('error', (error: Error) => {
      reject(error);
    });
  }

  /**
   * Spawns the Python process with proper configuration
   */
  private spawnPythonProcess(): void {
    try {
      Logger.info('Starting HuggingFace Python bridge', {
        pythonPath: this.pythonPath,
        scriptPath: this.scriptPath,
        model: this.modelName
      });

      this.pythonProcess = spawn(this.pythonPath, [this.scriptPath], {
        env: this.createProcessEnvironment()
      });

      this.setupProcessHandlers();

    } catch (error) {
      const initError = new ModelInitializationError(
        `Failed to spawn Python process: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', initError);
    }
  }

  /**
   * Creates the environment variables for the Python process
   */
  private createProcessEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      HUGGINGFACE_MODEL: this.modelName,
      PYTHONUNBUFFERED: '1'
    };
  }

  /**
   * Sets up event handlers for the Python process
   */
  private setupProcessHandlers(): void {
    if (!this.pythonProcess) return;

    this.pythonProcess.stdout?.on('data', (data) => {
      this.handlePythonOutput(data.toString());
    });

    this.pythonProcess.stderr?.on('data', (data) => {
      Logger.error('Python stderr:', data.toString());
    });

    this.pythonProcess.on('error', (error) => {
      Logger.error('Python process error:', error);
      this.emit('error', new ModelInitializationError(`Python process error: ${error.message}`));
    });

    this.pythonProcess.on('close', (code) => {
      Logger.info(`Python process exited with code ${code}`);
      this.handleProcessClose();
    });
  }

  /**
   * Handles Python process closure
   */
  private handleProcessClose(): void {
    this.isReady = false;
    this.pythonProcess = null;
  }

  // Private helper methods for message handling

  /**
   * Handles output from the Python process
   */
  private handlePythonOutput(data: string): void {
    this.messageBuffer += data;
    const messages = this.extractCompleteMessages();
    
    for (const message of messages) {
      this.processMessage(message);
    }
  }

  /**
   * Extracts complete JSON messages from the buffer
   */
  private extractCompleteMessages(): string[] {
    const lines = this.messageBuffer.split('\n');
    
    // Keep the last incomplete line in the buffer
    this.messageBuffer = lines.pop() || '';
    
    return lines.filter(line => line.trim());
  }

  /**
   * Processes a single message from Python
   */
  private processMessage(messageStr: string): void {
    try {
      const message: PythonMessage = JSON.parse(messageStr);
      this.handlePythonMessage(message);
    } catch (error) {
      Logger.warn('Failed to parse Python output:', messageStr);
    }
  }

  /**
   * Handles parsed Python messages
   */
  private handlePythonMessage(message: PythonMessage): void {
    switch (message.type) {
      case 'initialized':
        this.emit('initialized');
        break;
      
      case 'classification':
        this.emitClassificationResult(message);
        break;
      
      case 'error':
        this.handlePythonError(message.error);
        break;
      
      case 'pong':
        this.emit('pong');
        break;
      
      default:
        Logger.debug('Unknown Python message type:', message.type);
    }
  }

  /**
   * Emits classification results
   */
  private emitClassificationResult(message: PythonMessage): void {
    const result: ClassificationResponse = {
      labels: message.labels || [],
      scores: message.scores || [],
      sequence: message.sequence
    };
    this.emit('classification', result);
  }

  /**
   * Handles Python error messages
   */
  private handlePythonError(errorMessage?: string): void {
    const error = new Error(errorMessage || 'Unknown Python error');
    Logger.error('Python error:', errorMessage);
    this.emit('error', error);
  }

  // Private helper methods for classification

  /**
   * Ensures the bridge is ready for classification
   */
  private ensureBridgeReady(): void {
    if (!this.isReady || !this.pythonProcess) {
      throw new ModelInferenceError('HuggingFace bridge not initialized');
    }
  }

  /**
   * Sets up handlers for classification request
   */
  private setupClassificationHandlers(
    resolve: (value: ClassificationResponse | PromiseLike<ClassificationResponse>) => void,
    reject: (reason?: any) => void
  ): void {
    const responseHandler = (result: ClassificationResponse) => {
      this.removeListener('classification', responseHandler);
      this.removeListener('error', errorHandler);
      resolve(result);
    };

    const errorHandler = (error: Error) => {
      this.removeListener('classification', responseHandler);
      this.removeListener('error', errorHandler);
      reject(new ModelInferenceError(`Classification failed: ${error.message}`));
    };

    this.once('classification', responseHandler);
    this.once('error', errorHandler);
  }

  /**
   * Sends classification request to Python process
   */
  private sendClassificationRequest(request: ClassificationRequest): void {
    const command = {
      type: 'classify',
      text: request.text,
      labels: request.labels,
      multi_label: request.multiLabel || false
    };

    this.sendCommand(command);
  }

  /**
   * Sets up timeout for classification requests
   */
  private setupClassificationTimeout(reject: (reason?: any) => void): void {
    setTimeout(() => {
      reject(new ModelInferenceError('Classification timeout'));
    }, 30000); // 30 second timeout
  }

  // Private helper methods for ping

  /**
   * Sets up handlers for ping request
   */
  private setupPingHandlers(resolve: (value: boolean) => void): void {
    const pongHandler = () => {
      this.removeListener('pong', pongHandler);
      resolve(true);
    };

    this.once('pong', pongHandler);
  }

  /**
   * Sends ping request to Python process
   */
  private sendPingRequest(): void {
    this.sendCommand({ type: 'ping' });
  }

  /**
   * Sets up timeout for ping requests
   */
  private setupPingTimeout(resolve: (value: boolean) => void): void {
    setTimeout(() => {
      resolve(false);
    }, 5000); // 5 second timeout
  }

  // Private helper methods for shutdown

  /**
   * Sends shutdown request to Python process
   */
  private sendShutdownRequest(): void {
    this.sendCommand({ type: 'shutdown' });
  }

  /**
   * Sets up timeout for shutdown
   */
  private setupShutdownTimeout(resolve: () => void): void {
    setTimeout(() => {
      if (this.pythonProcess) {
        this.pythonProcess.kill();
        this.handleProcessClose();
      }
      resolve();
    }, 2000); // 2 second timeout
  }

  // Private utility methods

  /**
   * Sends a command to the Python process
   */
  private sendCommand(command: object): void {
    if (!this.pythonProcess?.stdin) {
      throw new ModelInferenceError('Python process stdin not available');
    }

    const commandStr = JSON.stringify(command) + '\n';
    this.pythonProcess.stdin.write(commandStr);
  }
}