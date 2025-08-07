import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HybridCaptureService } from './HybridCaptureService';
import { ElectronCaptureService } from './ElectronCaptureService';
import { NativeCaptureFactory } from '../NativeCaptureFactory';
import { ScreenCaptureError } from '../../../errors/CustomErrors';
import { ILogger } from '../../../utils/ILogger';
import { INativeScreenCapture } from '../INativeScreenCapture';

// Mock the dependencies
vi.mock('./ElectronCaptureService');
vi.mock('../NativeCaptureFactory');
vi.mock('../../../utils/ErrorHandler');

describe('HybridCaptureService', () => {
  let hybridService: HybridCaptureService;
  let mockLogger: ILogger;
  let mockElectronService: any;
  let mockNativeService: INativeScreenCapture;

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as ILogger;

    // Setup mock Electron service
    mockElectronService = {
      captureScreen: vi.fn()
    };
    vi.mocked(ElectronCaptureService).mockImplementation(() => mockElectronService);

    // Setup mock native service
    mockNativeService = {
      captureScreen: vi.fn(),
      isSupported: vi.fn().mockReturnValue(true),
      getPlatformName: vi.fn().mockReturnValue('macOS')
    };
    vi.mocked(NativeCaptureFactory.createValidatedNativeCaptureService).mockReturnValue(mockNativeService);


    hybridService = new HybridCaptureService(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create Electron and native services during construction', () => {
      expect(ElectronCaptureService).toHaveBeenCalled();
      expect(NativeCaptureFactory.createValidatedNativeCaptureService).toHaveBeenCalledWith(mockLogger);
    });

    it('should throw error if native service creation fails', () => {
      vi.mocked(NativeCaptureFactory.createValidatedNativeCaptureService)
        .mockImplementation(() => { throw new Error('Platform not supported'); });

      expect(() => {
        new HybridCaptureService(mockLogger);
      }).toThrow(ScreenCaptureError);
    });
  });

  describe('captureScreen - Electron first strategy', () => {
    it('should use Electron successfully when not in fallback mode', async () => {
      const expectedBuffer = Buffer.from('test-image-data');
      mockElectronService.captureScreen.mockResolvedValue(expectedBuffer);

      const result = await hybridService.captureScreen();

      expect(result).toBe(expectedBuffer);
      expect(mockElectronService.captureScreen).toHaveBeenCalled();
      expect(mockNativeService.captureScreen).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting Electron screen capture...');
    });

    it('should fallback to native when Electron returns empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const nativeBuffer = Buffer.from('native-image-data');
      
      mockElectronService.captureScreen.mockResolvedValue(emptyBuffer);
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      const result = await hybridService.captureScreen();

      expect(result).toBe(nativeBuffer);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Electron screen capture returned empty buffer')
      );
      expect(hybridService.isUsingNativeFallback()).toBe(true);
    });

    it('should fallback to native when Electron throws error', async () => {
      const electronError = new Error('Electron capture failed');
      const nativeBuffer = Buffer.from('native-image-data');
      
      mockElectronService.captureScreen.mockRejectedValue(electronError);
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      const result = await hybridService.captureScreen();

      expect(result).toBe(nativeBuffer);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Electron screen capture failed: Electron capture failed, trying native fallback'
      );
      expect(hybridService.isUsingNativeFallback()).toBe(true);
    });

    it('should throw error when both Electron and native fail', async () => {
      const electronError = new Error('Electron failed');
      const nativeError = new Error('Native failed');
      
      mockElectronService.captureScreen.mockRejectedValue(electronError);
      vi.mocked(mockNativeService.captureScreen).mockRejectedValue(nativeError);

      await expect(hybridService.captureScreen()).rejects.toThrow(ScreenCaptureError);
    });
  });

  describe('captureScreen - Native fallback mode', () => {
    beforeEach(() => {
      // Put service into native fallback mode
      hybridService.forceNativeMode();
    });

    it('should use native service directly when in fallback mode', async () => {
      const expectedBuffer = Buffer.from('native-image-data');
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(expectedBuffer);

      const result = await hybridService.captureScreen();

      expect(result).toBe(expectedBuffer);
      expect(mockNativeService.captureScreen).toHaveBeenCalled();
      expect(mockElectronService.captureScreen).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Using macOS native capture (Electron fallback mode)'
      );
    });

    it('should throw error when native service fails in fallback mode', async () => {
      const nativeError = new Error('Native capture failed');
      vi.mocked(mockNativeService.captureScreen).mockRejectedValue(nativeError);

      await expect(hybridService.captureScreen()).rejects.toThrow(nativeError);
    });
  });

  describe('monitoring methods', () => {
    it('should return correct fallback status', () => {
      expect(hybridService.isUsingNativeFallback()).toBe(false);
      
      hybridService.forceNativeMode();
      expect(hybridService.isUsingNativeFallback()).toBe(true);
    });

    it('should return correct capture info', () => {
      const info = hybridService.getCaptureInfo();

      expect(info).toEqual({
        isUsingNativeFallback: false,
        nativePlatform: 'macOS',
        nativePlatformSupported: true
      });
    });

    it('should update capture info when forced to native mode', () => {
      hybridService.forceNativeMode();
      const info = hybridService.getCaptureInfo();

      expect(info.isUsingNativeFallback).toBe(true);
    });
  });

  describe('testing methods', () => {
    it('should allow forcing native mode', () => {
      hybridService.forceNativeMode();

      expect(hybridService.isUsingNativeFallback()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Forced switch to macOS native screen capture mode'
      );
    });

    it('should allow resetting to Electron first', () => {
      hybridService.forceNativeMode();
      hybridService.resetToElectronFirst();

      expect(hybridService.isUsingNativeFallback()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reset to try Electron screen capture first'
      );
    });
  });

  describe('error handling', () => {
    it('should handle null/undefined buffers from Electron', async () => {
      mockElectronService.captureScreen.mockResolvedValue(null);
      const nativeBuffer = Buffer.from('native-fallback');
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      const result = await hybridService.captureScreen();

      expect(result).toBe(nativeBuffer);
      expect(hybridService.isUsingNativeFallback()).toBe(true);
    });

    it('should format error messages correctly', async () => {
      const customError = new Error('Custom error message');
      const nativeBuffer = Buffer.from('native-fallback');
      
      mockElectronService.captureScreen.mockRejectedValue(customError);
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      await hybridService.captureScreen();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Electron screen capture failed: Custom error message, trying native fallback'
      );
    });

    it('should handle non-Error objects thrown by Electron', async () => {
      const stringError = 'String error';
      const nativeBuffer = Buffer.from('native-fallback');
      
      mockElectronService.captureScreen.mockRejectedValue(stringError);
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      await hybridService.captureScreen();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Electron screen capture failed: String error, trying native fallback'
      );
    });
  });

  describe('session memory behavior', () => {
    it('should remember native fallback preference after first failure', async () => {
      // First call fails and triggers fallback
      mockElectronService.captureScreen.mockRejectedValueOnce(new Error('First failure'));
      const nativeBuffer = Buffer.from('native-fallback');
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      await hybridService.captureScreen();
      expect(hybridService.isUsingNativeFallback()).toBe(true);

      // Second call should skip Electron and go straight to native
      await hybridService.captureScreen();

      // Electron should only have been called once (during first attempt)
      expect(mockElectronService.captureScreen).toHaveBeenCalledTimes(1);
      // Native should have been called twice
      expect(mockNativeService.captureScreen).toHaveBeenCalledTimes(2);
    });

    it('should remember native fallback after empty buffer', async () => {
      // First call returns empty buffer
      mockElectronService.captureScreen.mockResolvedValueOnce(Buffer.alloc(0));
      const nativeBuffer = Buffer.from('native-fallback');
      vi.mocked(mockNativeService.captureScreen).mockResolvedValue(nativeBuffer);

      await hybridService.captureScreen();
      await hybridService.captureScreen();

      // Should skip Electron on second call
      expect(mockElectronService.captureScreen).toHaveBeenCalledTimes(1);
      expect(mockNativeService.captureScreen).toHaveBeenCalledTimes(2);
    });
  });
});