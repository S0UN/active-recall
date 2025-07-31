// src/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

import { ILogger } from './utils/ILogger';
import { LoggerService } from './utils/LoggerService';

import { IPollingConfig } from './configs/IPollingConfig';
import { ConfigService } from './configs/ConfigService';

import { ICache } from './utils/ICache';
import { WindowCache } from './utils/WindowCache';

import { IPollingSystem } from './services/polling/IPollingSystem';
import { PollingSystem } from './services/polling/impl/PollingSystem';

import { IOcrService } from './services/analysis/IOcrService';
import { TesseractOcrService } from './services/analysis/impl/TesseractOcrService';

import { IClassificationService } from './services/analysis/IClassificationService';
import { IModelFactory } from './services/analysis/IModelFactory';
import { ModelFactory } from './services/analysis/impl/ModelFactory';
import { DEFAULT_CLASSIFICATION_CONFIG, SupportedModel } from './services/analysis/IClassificationModelConfig';

import { ITextPreprocessor } from './services/preprocessing/ITextPreprocessor';
import { TextPreprocessor } from './services/preprocessing/impl/TextPreprocessor';
import { ITextSegmenter } from './services/preprocessing/ITextSegmenter';
import { TextSegmenter } from './services/preprocessing/impl/TextSegmenter';

import { IScreenCaptureService } from './services/capture/IScreenCaptureService';
import { ElectronCaptureService } from './services/capture/impl/ElectronCaptureService';

import { IBatcherService } from './services/network/IBatcherService';
import { BatcherService } from './services/network/impl/BatcherService';

import { WindowChangePoller } from './services/polling/impl/WindowChangePoller';
import { StudyingOCRPoller } from './services/polling/impl/StudyingOCRPoller';
import { IdleRevalidationPoller } from './services/polling/impl/IdleRevalidationPoller';

import { VisionService } from './services/processing/impl/VisionService';
import { Orchestrator } from './services/Orchestrator';
import { IPoller } from './services/polling/IPoller';

// 1) Core utilities
container.registerSingleton<ILogger>('LoggerService', LoggerService);

// 2) Configuration
container.registerSingleton<IPollingConfig>('PollingConfig', ConfigService);

// 3) Cache
container.registerSingleton<
  ICache<string, { mode: string; lastClassified: number }>
>('WindowCache', WindowCache);



// 4) Low-level services
container.registerSingleton<IPollingSystem>('PollingSystem', PollingSystem);
container.registerSingleton<IOcrService>('OcrService', TesseractOcrService);
container.registerSingleton<ITextPreprocessor>('TextPreprocessor', TextPreprocessor);
container.registerSingleton<ITextSegmenter>('TextSegmenter', TextSegmenter);
container.registerSingleton<IModelFactory>('ModelFactory', ModelFactory);

const activeModel: SupportedModel = 
  (process.env.CLASSIFICATION_MODEL as SupportedModel) || 
  DEFAULT_CLASSIFICATION_CONFIG.activeModel;

container.registerSingleton<IClassificationService>('ClassificationService', {
  useFactory: (container: any) => {
    const factory = container.resolve('ModelFactory') as IModelFactory;
    return factory.createClassifier(activeModel);
  }
} as any);
container.registerSingleton<IScreenCaptureService>(
  'ScreenCaptureService',
  ElectronCaptureService
);
container.registerSingleton<IBatcherService>(
  'BatcherService',
  BatcherService
);


// 5) Pollers
container.registerSingleton<IPoller>('WindowChangePoller', WindowChangePoller);
container.registerSingleton<IPoller>('StudyingOCRPoller', StudyingOCRPoller);
container.registerSingleton<IPoller>('IdleRevalidationPoller', IdleRevalidationPoller);

// 6) Higher-level services
container.registerSingleton<VisionService>('VisionService', VisionService);
container.registerSingleton<Orchestrator>('Orchestrator', Orchestrator);



export default container;
