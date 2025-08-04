import 'reflect-metadata';
// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow } from 'electron';
import container from './container';
import { Orchestrator } from './services/Orchestrator';
import { ILogger } from './utils/ILogger';
import { TesseractOcrService } from './services/analysis/impl/TesseractOcrService';
import { systemPreferences } from 'electron';
import { dialog, desktopCapturer } from 'electron';
import { ModelNotFoundError, ModelInitializationError, VisionServiceError, ClassificationError } from './errors/CustomErrors';

console.log(' execPath:', process.execPath);

// Resolve the logger from the container
const logger = container.resolve<ILogger>('LoggerService');
const orchestrator = container.resolve<Orchestrator>('Orchestrator');

// Global error handlers with smart handling
process.on('uncaughtException', (error) => {
  if (error instanceof ModelNotFoundError) {
    logger.warn('Model not found - continuing with degraded functionality:', error.message);
    return; // Don't quit on missing models
  }
  
  if (error instanceof VisionServiceError) {
    logger.warn('Vision service error - continuing:', error.message);
    return; // Don't quit on vision errors
  }
  
  // For other critical errors, log and quit
  logger.error('Uncaught Exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason as Error;
  
  if (error instanceof ModelNotFoundError) {
    logger.warn('Model not found (unhandled promise):', error.message);
    logger.info('App will continue with available models');
    return;
  }
  
  if (error instanceof ModelInitializationError) {
    logger.warn('Model initialization failed (unhandled promise):', error.message);
    logger.info('App will continue with available models');
    return;
  }
  
  if (error instanceof VisionServiceError) {
    logger.warn('Vision service error (unhandled promise):', error.message);
    return;
  }
  
  if (error instanceof ClassificationError) {
    logger.warn('Classification error (unhandled promise):', error.message);
    return;
  }
  
  // Log other unhandled rejections but don't crash in development
  logger.error('Unhandled Rejection at:', error, 'promise:', promise);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });

  win.loadFile('src/renderer/index.html');
}

// ...existing code...

app.whenReady().then(async () => {
  //createWindow();
  
  // Check current permission status
  const hasScreenPermission = systemPreferences.getMediaAccessStatus('screen');
  logger.info('Screen recording permission status:', hasScreenPermission);
  
  if (hasScreenPermission !== 'granted') {
    // Show info dialog
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Screen Recording Permission Required',
      message: 'This app needs screen recording permission to detect window changes.',
      detail: 'Please allow screen recording when prompted, then restart the app.',
      buttons: ['Continue', 'Cancel']
    });
    
    if (result.response === 1) {
      app.quit();
      return;
    }
    
    // Trigger the permission request
    try {
      await desktopCapturer.getSources({ types: ['screen'] });
    } catch (error) {
      logger.error('Failed to request screen recording permission:', error as Error);
    }
  }
  
  await orchestrator.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Ensure Tesseract worker is terminated on app quit
app.on('will-quit', async () => {
  const tesseractOcrService = container.resolve(TesseractOcrService);
  await tesseractOcrService.dispose();
});
