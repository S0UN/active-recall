import 'reflect-metadata';
import { container } from 'tsyringe';

import { ILogger } from './utils/ILogger';
import { LoggerService } from './utils/LoggerService';
import { IPollingSystem } from './services/polling/IPollingSystem';
import { PollingSystem } from './services/polling/impl/PollingSystem';
import { IOcrService } from './services/analysis/IOcrService';
import { TesseractOcrService } from './services/analysis/impl/TesseractOcrService';
import { IClassificationService } from './services/analysis/IClassificationService';
import { DistilBARTService } from './services/analysis/impl/DistilBARTService';
import { IScreenCaptureService } from './services/capture/IScreenCaptureService';
import { ElectronCaptureService } from './services/capture/impl/ElectronCaptureService';
import { IBatcherService } from './services/network/IBatcherService';
import { BatcherService } from './services/network/impl/BatcherService';
import { WindowChangePoller } from './services/polling/impl/WindowChangePoller';
import { StudyingOCRPoller } from './services/polling/impl/StudyingOCRPoller';
import { IdleRevalidationPoller } from './services/polling/impl/IdleRevalidationPoller';
import { Orchestrator } from './services/Orchestrator';
import { VisionService } from './services/processing/impl/VisionService';

// Register the logger first as it might be used by other services during initialization
container.registerSingleton<ILogger>('LoggerService', LoggerService);

// Register all other services for dependency injection
container.registerSingleton<IPollingSystem>('PollingSystem', PollingSystem);
container.registerSingleton<IOcrService>('OcrService', TesseractOcrService);
container.registerSingleton<IClassificationService>('ClassificationService', DistilBARTService);
container.registerSingleton<IScreenCaptureService>('ScreenCaptureService', ElectronCaptureService);
container.registerSingleton<IBatcherService>('BatcherService', BatcherService);
container.registerSingleton<WindowChangePoller>(WindowChangePoller);
container.registerSingleton<StudyingOCRPoller>(StudyingOCRPoller);
container.registerSingleton<IdleRevalidationPoller>(IdleRevalidationPoller);
container.registerSingleton<Orchestrator>(Orchestrator);
container.registerSingleton<VisionService>(VisionService);

export default container;
