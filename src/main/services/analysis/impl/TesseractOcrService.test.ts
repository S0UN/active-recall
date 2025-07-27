import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TesseractOcrService } from "./TesseractOcrService";
import { ILogger } from "../../../utils/ILogger";
import { fixtures } from "@fixtures";
import { OcrInitializationError, OcrProcessingError } from "../../../errors/CustomErrors";

const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe("TesseractOcrService", () => {
  let mockLogger: ILogger;
  let ocrService: TesseractOcrService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    ocrService = new TesseractOcrService(mockLogger);
  });

  afterEach(async () => {
    if (ocrService) {
      await ocrService.dispose();
    }
  });

  describe("initialization", () => {
    it("should initialize worker successfully", async () => {
      await ocrService.init();
      
      expect(mockLogger.debug).toHaveBeenCalledWith('TesseractOcrService: Initializing worker...');
      expect(mockLogger.debug).toHaveBeenCalledWith('TesseractOcrService: Worker initialized.');
    });

    it("should not reinitialize if worker already exists", async () => {
      await ocrService.init();
      vi.clearAllMocks();
      
      await ocrService.init();
      
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe("text recognition", () => {
    beforeEach(async () => {
      await ocrService.init();
    });

    it("should throw OcrProcessingError when image buffer is empty", async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      await expect(ocrService.getTextFromImage(emptyBuffer))
        .rejects
        .toThrow(OcrProcessingError);
    });

    it("should throw OcrInitializationError when worker not initialized", async () => {
      const uninitializedService = new TesseractOcrService(mockLogger);
      const buffer = Buffer.from('test');
      
      await expect(uninitializedService.getTextFromImage(buffer))
        .rejects
        .toThrow(OcrInitializationError);
    });

    it("should correctly recognize text from a real image", async () => {
      const imageBuffer = fixtures['simple.png'];

      const recognizedText = await ocrService.getTextFromImage(imageBuffer);

      expect(recognizedText).toContain("execution pathways");
    }, 30000);
  });

  describe("text cleaning", () => {
    it("should clean text by replacing multiple spaces with single space", () => {
      const messyText = "Hello    world   with  multiple   spaces";
      const expectedText = "Hello world with multiple spaces";
      
      const cleanedText = ocrService.cleanText(messyText);
      
      expect(cleanedText).toBe(expectedText);
    });

    it("should trim whitespace from beginning and end", () => {
      const messyText = "   Hello world   ";
      const expectedText = "Hello world";
      
      const cleanedText = ocrService.cleanText(messyText);
      
      expect(cleanedText).toBe(expectedText);
    });

    it("should return empty string for null or undefined input", () => {
      expect(ocrService.cleanText("")).toBe("");
    });

    it("should handle text with newlines and tabs", () => {
      const messyText = "Hello\n\nworld\t\twith\r\nvarious\twhitespace";
      const expectedText = "Hello world with various whitespace";
      
      const cleanedText = ocrService.cleanText(messyText);
      
      expect(cleanedText).toBe(expectedText);
    });
  });

  describe("disposal", () => {
    it("should dispose worker successfully", async () => {
      await ocrService.init();
      
      await ocrService.dispose();
      
      expect(mockLogger.info).toHaveBeenCalledWith('TesseractOcrService: Terminating worker...');
      expect(mockLogger.info).toHaveBeenCalledWith('TesseractOcrService: Worker terminated.');
    });

    it("should handle disposal when no worker exists", async () => {
      await ocrService.dispose();
      
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
