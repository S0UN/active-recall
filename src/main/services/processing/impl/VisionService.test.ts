import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisionService } from "./VisionService";
import { IScreenCaptureService } from "../../capture/IScreenCaptureService";
import { IOcrService } from "../../analysis/IOcrService";
import { ILogger } from "../../../utils/ILogger";
import { VisionServiceError, ScreenCaptureError, OcrProcessingError } from "../../../errors/CustomErrors";

const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createMockScreenCaptureService = (): IScreenCaptureService => ({
  captureScreen: vi.fn(),
});

const createMockOcrService = (): IOcrService => ({
  init: vi.fn(),
  getTextFromImage: vi.fn(),
  dispose: vi.fn(),
  cleanText: vi.fn(),
});

describe("VisionService", () => {
  let mockLogger: ILogger;
  let mockScreenCaptureService: IScreenCaptureService;
  let mockOcrService: IOcrService;
  let visionService: VisionService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockScreenCaptureService = createMockScreenCaptureService();
    mockOcrService = createMockOcrService();
    visionService = new VisionService(mockScreenCaptureService, mockOcrService, mockLogger);
  });

  describe("captureAndRecognizeText", () => {
    it("should successfully capture screen and recognize text", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      const expectedText = "Recognized text from image";
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(mockImageBuffer);
      vi.mocked(mockOcrService.init).mockResolvedValue();
      vi.mocked(mockOcrService.getTextFromImage).mockResolvedValue(expectedText);

      const result = await visionService.captureAndRecognizeText();

      expect(result).toBe(expectedText);
      expect(mockLogger.info).toHaveBeenCalledWith('Capturing screen...');
      expect(mockScreenCaptureService.captureScreen).toHaveBeenCalledOnce();
      expect(mockOcrService.init).toHaveBeenCalledOnce();
      expect(mockOcrService.getTextFromImage).toHaveBeenCalledWith(mockImageBuffer);
    });

    it("should return empty string when OCR returns null", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(mockImageBuffer);
      vi.mocked(mockOcrService.init).mockResolvedValue();
      vi.mocked(mockOcrService.getTextFromImage).mockResolvedValue("");

      const result = await visionService.captureAndRecognizeText();

      expect(result).toBe("");
    });

    it("should throw ScreenCaptureError when capture returns empty buffer", async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(emptyBuffer);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(ScreenCaptureError);
    });

    it("should throw ScreenCaptureError when capture returns null buffer", async () => {
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(null as any);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(ScreenCaptureError);
    });

    it("should propagate ScreenCaptureError from capture service", async () => {
      const captureError = new ScreenCaptureError("Display not found");
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockRejectedValue(captureError);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(ScreenCaptureError);
    });

    it("should propagate OcrProcessingError from OCR service", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      const ocrError = new OcrProcessingError("Failed to process image");
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(mockImageBuffer);
      vi.mocked(mockOcrService.init).mockResolvedValue();
      vi.mocked(mockOcrService.getTextFromImage).mockRejectedValue(ocrError);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(OcrProcessingError);
    });

    it("should wrap unknown errors in VisionServiceError", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      const unknownError = new Error("Unknown error");
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(mockImageBuffer);
      vi.mocked(mockOcrService.init).mockRejectedValue(unknownError);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(VisionServiceError);
    });

    it("should handle OCR init failure gracefully", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      const initError = new Error("OCR init failed");
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockResolvedValue(mockImageBuffer);
      vi.mocked(mockOcrService.init).mockRejectedValue(initError);

      await expect(visionService.captureAndRecognizeText())
        .rejects
        .toThrow(VisionServiceError);
    });

    it("should call services in correct order", async () => {
      const mockImageBuffer = Buffer.from("fake-image-data");
      const callOrder: string[] = [];
      
      vi.mocked(mockScreenCaptureService.captureScreen).mockImplementation(async () => {
        callOrder.push("capture");
        return mockImageBuffer;
      });
      
      vi.mocked(mockOcrService.init).mockImplementation(async () => {
        callOrder.push("init");
      });
      
      vi.mocked(mockOcrService.getTextFromImage).mockImplementation(async () => {
        callOrder.push("recognize");
        return "text";
      });

      await visionService.captureAndRecognizeText();

      expect(callOrder).toEqual(["capture", "init", "recognize"]);
    });
  });
});