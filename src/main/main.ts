import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import container from './container';
import { Orchestrator } from './services/Orchestrator';
import { ILogger } from './utils/ILogger';
import { TesseractOcrService } from './services/analysis/impl/TesseractOcrService';
import { systemPreferences } from 'electron';
import { dialog, desktopCapturer } from 'electron';

console.log(' execPath:', process.execPath);

// Resolve the logger from the container
const logger = container.resolve<ILogger>('LoggerService');
const orchestrator = container.resolve<Orchestrator>('Orchestrator');

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // It's generally recommended to quit the app on an uncaught exception
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', reason as Error, 'promise:', promise);
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
  
  orchestrator.start();
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
