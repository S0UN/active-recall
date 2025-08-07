import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NativeCaptureFactory } from './NativeCaptureFactory';
import { MacOSNativeCaptureService } from './impl/MacOSNativeCaptureService';
import { WindowsNativeCaptureService } from './impl/WindowsNativeCaptureService';
import { LinuxNativeCaptureService } from './impl/LinuxNativeCaptureService';
import { ScreenCaptureError } from '../../errors/CustomErrors';
import { ILogger } from '../../utils/ILogger';

// Mock the concrete implementations
vi.mock('./impl/MacOSNativeCaptureService');
vi.mock('./impl/WindowsNativeCaptureService');
vi.mock('./impl/LinuxNativeCaptureService');

describe('NativeCaptureFactory', () => {
  let mockLogger: ILogger;
  let originalPlatform: string;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as ILogger;

    // Store original platform
    originalPlatform = process.platform;
  });

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true
    });
    vi.restoreAllMocks();
  });

  const setPlatform = (platform: string) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      writable: true
    });
  };

  describe('createNativeCaptureService', () => {
    it('should create MacOSNativeCaptureService for darwin platform', () => {
      setPlatform('darwin');

      const service = NativeCaptureFactory.createNativeCaptureService(mockLogger);

      expect(MacOSNativeCaptureService).toHaveBeenCalledWith(mockLogger);
      expect(service).toBeInstanceOf(MacOSNativeCaptureService);
    });

    it('should create WindowsNativeCaptureService for win32 platform', () => {
      setPlatform('win32');

      const service = NativeCaptureFactory.createNativeCaptureService(mockLogger);

      expect(WindowsNativeCaptureService).toHaveBeenCalledWith(mockLogger);
      expect(service).toBeInstanceOf(WindowsNativeCaptureService);
    });

    it('should create LinuxNativeCaptureService for linux platform', () => {
      setPlatform('linux');

      const service = NativeCaptureFactory.createNativeCaptureService(mockLogger);

      expect(LinuxNativeCaptureService).toHaveBeenCalledWith(mockLogger);
      expect(service).toBeInstanceOf(LinuxNativeCaptureService);
    });

    it('should throw ScreenCaptureError for unsupported platform', () => {
      setPlatform('freebsd');

      expect(() => {
        NativeCaptureFactory.createNativeCaptureService(mockLogger);
      }).toThrow(ScreenCaptureError);
      
      expect(() => {
        NativeCaptureFactory.createNativeCaptureService(mockLogger);
      }).toThrow(/Unsupported platform for native screen capture: freebsd/);
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return all supported platforms with current platform marked', () => {
      setPlatform('darwin');

      const platforms = NativeCaptureFactory.getSupportedPlatforms();

      expect(platforms).toEqual([
        {
          platformCode: 'darwin',
          displayName: 'macOS',
          isCurrentPlatform: true
        },
        {
          platformCode: 'win32',
          displayName: 'Windows',
          isCurrentPlatform: false
        },
        {
          platformCode: 'linux',
          displayName: 'Linux',
          isCurrentPlatform: false
        }
      ]);
    });

    it('should mark Windows as current platform when on win32', () => {
      setPlatform('win32');

      const platforms = NativeCaptureFactory.getSupportedPlatforms();
      const windowsPlatform = platforms.find(p => p.platformCode === 'win32');
      const macosPlatform = platforms.find(p => p.platformCode === 'darwin');

      expect(windowsPlatform?.isCurrentPlatform).toBe(true);
      expect(macosPlatform?.isCurrentPlatform).toBe(false);
    });
  });

  describe('isCurrentPlatformSupported', () => {
    it('should return true for supported platforms', () => {
      const supportedPlatforms = ['darwin', 'win32', 'linux'];
      
      supportedPlatforms.forEach(platform => {
        setPlatform(platform);
        expect(NativeCaptureFactory.isCurrentPlatformSupported()).toBe(true);
      });
    });

    it('should return false for unsupported platforms', () => {
      const unsupportedPlatforms = ['freebsd', 'openbsd', 'aix', 'sunos'];
      
      unsupportedPlatforms.forEach(platform => {
        setPlatform(platform);
        expect(NativeCaptureFactory.isCurrentPlatformSupported()).toBe(false);
      });
    });
  });

  describe('getCurrentPlatformDisplayName', () => {
    it('should return correct display names for supported platforms', () => {
      const platformMappings = [
        { code: 'darwin', display: 'macOS' },
        { code: 'win32', display: 'Windows' },
        { code: 'linux', display: 'Linux' }
      ];

      platformMappings.forEach(({ code, display }) => {
        setPlatform(code);
        expect(NativeCaptureFactory.getCurrentPlatformDisplayName()).toBe(display);
      });
    });

    it('should return unknown format for unsupported platforms', () => {
      setPlatform('freebsd');
      expect(NativeCaptureFactory.getCurrentPlatformDisplayName()).toBe('Unknown (freebsd)');
    });
  });

  describe('createValidatedNativeCaptureService', () => {
    let mockService: any;

    beforeEach(() => {
      mockService = {
        isSupported: vi.fn().mockReturnValue(true),
        getPlatformName: vi.fn().mockReturnValue('Test Platform')
      };
    });

    it('should create and validate service successfully', () => {
      setPlatform('darwin');
      vi.mocked(MacOSNativeCaptureService).mockReturnValue(mockService);

      const service = NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);

      expect(service).toBe(mockService);
      expect(mockService.isSupported).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Created native capture service for Test Platform');
    });

    it('should throw error for unsupported platform before creating service', () => {
      setPlatform('freebsd');

      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(ScreenCaptureError);
      
      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(/Cannot create native capture service: platform 'freebsd' is not supported/);
    });

    it('should throw error if created service does not support platform', () => {
      setPlatform('darwin');
      mockService.isSupported.mockReturnValue(false);
      vi.mocked(MacOSNativeCaptureService).mockReturnValue(mockService);

      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(ScreenCaptureError);
      
      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(/Created service Test Platform does not support current platform darwin/);
    });

    it('should wrap and rethrow service creation errors', () => {
      setPlatform('darwin');
      const originalError = new Error('Service creation failed');
      vi.mocked(MacOSNativeCaptureService).mockImplementation(() => {
        throw originalError;
      });

      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(ScreenCaptureError);
      
      expect(() => {
        NativeCaptureFactory.createValidatedNativeCaptureService(mockLogger);
      }).toThrow(/Failed to create native capture service for platform macOS/);
    });
  });
});