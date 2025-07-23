import 'reflect-metadata';
import { vi } from 'vitest';
import { container } from 'tsyringe';
import { ILogger } from '../main/utils/ILogger';

// 1. Mock Electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false, 
    getPath: (name: string) => `mock/path/to/${name}`,
  },
  dialog: {},
  ipcMain: {},
  ipcRenderer: {},
  desktopCapturer: {},
  screen: {},
}));

// 2. Register a mock LoggerService for dependency injection
const mockLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

container.registerInstance<ILogger>('LoggerService', mockLogger);