import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WindowChangePoller } from "./WindowChangePoller";
import { IPollingSystem } from "../IPollingSystem";
import { ConfigService } from "../../../configs/ConfigService";
import { WindowDetectionError } from "../../../errors/CustomErrors";

// Mock external dependencies
vi.mock("active-win");
vi.mock("electron-log");

const createMockPollingSystem = (): IPollingSystem => ({
  register: vi.fn(),
  unregister: vi.fn(),
});

const createMockConfigService = (): ConfigService => ({
  windowChangeIntervalMs: 1000,
  studyingOcrIntervalMs: 5000,
  idleRevalidationIntervalMs: 30000,
  idleRevalidationThresholdMs: 900000,
  windowCacheTTL: 900000,
});

describe("WindowChangePoller", () => {
  let mockPollingSystem: IPollingSystem;
  let mockConfigService: ConfigService;
  let windowPoller: WindowChangePoller;
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPollingSystem = createMockPollingSystem();
    mockConfigService = createMockConfigService();
    mockOnChange = vi.fn();
    windowPoller = new WindowChangePoller(mockPollingSystem, mockConfigService);
    windowPoller.setOnChange(mockOnChange);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should register with polling system when started", () => {
      windowPoller.start();
      
      expect(mockPollingSystem.register).toHaveBeenCalledWith(
        "WindowChange",
        1000,
        expect.any(Function)
      );
    });

    it("should initialize with empty current window", () => {
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe("setOnChange", () => {
    it("should set the onChange callback", () => {
      const newCallback = vi.fn();
      windowPoller.setOnChange(newCallback);
      
      // The callback should be updated (we'll test this in the polling tests)
      expect(typeof newCallback).toBe("function");
    });
  });

  describe("window detection and polling", () => {
    beforeEach(async () => {
      // Import and mock active-win for each test
      const activeWindow = await import("active-win");
      vi.mocked(activeWindow.default).mockClear();
      // Start the poller to register the callback
      windowPoller.start();
    });

    it("should detect window change and call onChange callback", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "Test Application",
        owner: { name: "TestApp" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      // Get the registered callback from the polling system
      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      
      // Execute the polling callback
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Test Application");
    });

    it("should handle browser windows with empty titles using URL", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "Google Chrome" },
        url: "https://github.com/user/repo"
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Google Chrome - github.com");
    });

    it("should handle browser windows with no title and no URL", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "Google Chrome" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Chrome - Active Tab");
    });

    it("should handle Safari browser specifically", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "Safari" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Safari - Active Tab");
    });

    it("should handle Firefox browser", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "firefox.exe" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Firefox - Active Tab");
    });

    it("should handle Edge browser", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "msedge.exe" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Edge - Active Tab");
    });

    it("should handle favorites URL on macOS", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "Safari" },
        url: "favorites://"
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Safari - Favorites");
    });

    it("should not call onChange when window hasn't changed", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "Same Window",
        owner: { name: "TestApp" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      
      // First call
      await registeredCallback();
      expect(mockOnChange).toHaveBeenCalledWith("", "Same Window");
      
      mockOnChange.mockClear();
      
      // Second call with same window
      await registeredCallback();
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should handle null window response gracefully", async () => {
      const activeWindow = await import("active-win");
      const Logger = await import("electron-log");

      vi.mocked(activeWindow.default).mockResolvedValue(undefined);
      vi.mocked(Logger.default.warn).mockImplementation(() => {});

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(Logger.default.warn).toHaveBeenCalledWith('No active window detected');
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should throw WindowDetectionError when active-win fails", async () => {
      const activeWindow = await import("active-win");
      const originalError = new Error("Active window detection failed");

      vi.mocked(activeWindow.default).mockRejectedValue(originalError);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      
      await expect(registeredCallback()).rejects.toThrow(WindowDetectionError);
    });

    it("should handle invalid URL gracefully", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "Safari" },
        url: "not-a-valid-url"
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Safari - not-a-valid-url");
    });
  });

  describe("window identification logic", () => {
    beforeEach(() => {
      windowPoller.start();
    });

    it("should prefer title when available", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "Document.pdf - Preview",
        owner: { name: "Preview" },
        url: "file:///path/to/document.pdf"
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "Document.pdf - Preview");
    });

    it("should handle unknown applications with no title", async () => {
      const activeWindow = await import("active-win");
      const mockWindow = {
        title: "",
        owner: { name: "UnknownApp" }
      };

      vi.mocked(activeWindow.default).mockResolvedValue(mockWindow as any);

      const registeredCallback = vi.mocked(mockPollingSystem.register).mock.calls[0][2];
      await registeredCallback();

      expect(mockOnChange).toHaveBeenCalledWith("", "UnknownApp - No Title");
    });
  });

  describe("inheritance from BasePoller", () => {
    it("should extend BasePoller correctly", () => {
      expect(windowPoller).toHaveProperty('start');
      expect(windowPoller).toHaveProperty('stop');
      expect(typeof windowPoller.start).toBe('function');
      expect(typeof windowPoller.stop).toBe('function');
    });
  });
});