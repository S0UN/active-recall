import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import container from './container';
import { Orchestrator } from './services/Orchestrator';
import { ILogger } from './utils/ILogger';
import { TesseractOcrService } from './services/analysis/impl/TesseractOcrService';

// Resolve the logger from the container
const logger = container.resolve<ILogger>('LoggerService');

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

app.whenReady().then(() => {
  createWindow();

  const orchestrator = container.resolve(Orchestrator);
  // orchestrator.start(); // Starting this later
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
