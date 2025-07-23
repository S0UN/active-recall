
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TesseractOcrService } from '../../../../main/services/analysis/impl/TesseractOcrService';
import { ILogger } from '../../../../main/utils/ILogger';
import * as fs from 'fs';
import * as path from 'path';

// --- Helper Functions for Self-Documentation ---

/** Creates a mock logger for use in tests. */
const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const loadImageFixture = (fileName: string): Buffer => {
  const imagePath = path.resolve(__dirname, '__fixtures__', fileName);
  return fs.readFileSync(imagePath);
};


describe('TesseractOcrService - Integration Test', () => {
  let ocrService: TesseractOcrService;

  beforeEach(async () => {
    const logger = createMockLogger();
    ocrService = new TesseractOcrService(logger);
    await ocrService.init();
  });

  afterEach(async () => {
    if (ocrService) {
      await ocrService.dispose();
    }
  });

  it('should correctly recognize text from a real image', async () => {
    const imageBuffer = loadImageFixture('simple.png');
    const expectedText = "The number of possible execution pathways becomes two for two threads and N! in the general case.";

    const recognizedText = await ocrService.getTextFromImage(imageBuffer);

    expect(recognizedText).includes(expectedText);

  }, 30000); // Increased timeout for real OCR processing
});
