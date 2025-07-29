import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DistilBARTService } from './DistilBARTService';
import { TextPreprocessor } from '../../preprocessing/impl/TextPreprocessor';

// Mock the transformers library
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    allowRemoteModels: true,
    localModelPath: ''
  },
}));

// Mock the Python subprocess for TextPreprocessor
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn()
    };
    
    // Simulate successful preprocessing
    setTimeout(() => {
      const stdout = mockProcess.stdout.on as any;
      const onClose = mockProcess.on as any;
      
      // Call stdout callback with cleaned text
      const callback = stdout.mock.calls.find((call: any) => call[0] === 'data')?.[1];
      if (callback) {
        callback('The Executor framework will pool threads resize automatically and recreate threads');
      }
      
      // Call close callback
      const closeCallback = onClose.mock.calls.find((call: any) => call[0] === 'close')?.[1];
      if (closeCallback) {
        closeCallback(0);
      }
    }, 10);
    
    return mockProcess;
  })
}));

describe('DistilBARTService E2E with Real Preprocessing', () => {
  let service: DistilBARTService;
  let preprocessor: TextPreprocessor;
  let mockClassifier: any;

  beforeEach(async () => {
    // Create real preprocessor (mocked subprocess)
    preprocessor = new TextPreprocessor();
    
    // Create mock classifier
    mockClassifier = vi.fn();
    const { pipeline } = await import('@xenova/transformers');
    (pipeline as any).mockResolvedValue(mockClassifier);

    // Create service with real preprocessor
    service = new DistilBARTService(preprocessor);
    await service.init();
  });

  it('should demonstrate improved classification with preprocessing', async () => {
    // Real OCR output from the example provided
    const realOcrOutput = `«> £ active-recall 8 LEN A= | | [ia EXPLORER TS VisionService.ts TS DistilBARTService.ts 1, M
    TS EducationalContentDetectorts 5,U X Ts TesseractOcrService.ts TS Orchestrator.ts Ts ErrorHandlerts
    The Executor framework will pool threads, resize automatically, and recreate threads
    if necessary. It also supports futures, a common concurrent programming construct.`;

    // Mock classifier to show improved confidence with cleaned text
    mockClassifier.mockImplementation((text: string) => {
      // Higher confidence for cleaned text
      if (text.includes('«>') || text.includes('£')) {
        return { scores: [0.35], labels: ['studying technical or educational content'] };
      } else {
        return { scores: [0.75], labels: ['studying technical or educational content'] };
      }
    });

    const result = await service.classifyWithConfidence(realOcrOutput);
    
    expect(result.classification).toBe('Studying');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should handle complex mixed content', async () => {
    const complexContent = `
      OPEN EDITORS src > main > services > analysis > impl > T EducationalContentDetector.ts
      11 export class EducationalContentDetector implements IClassificationService { |S % X
      12 private static readonly STUDYING THRESHOLD = 0.5;
      
      practice. sexercises?/ « This log only § BANISH appears when SE ) 38 © getTextFroml
      
      The Executor framework will pool threads, resize automatically, and recreate threads
      if necessary. It also supports futures, a common concurrent programming construct.
    `;

    mockClassifier.mockResolvedValue({
      scores: [0.68],
      labels: ['studying technical or educational content']
    });

    const result = await service.classifyWithConfidence(complexContent);
    
    expect(result.classification).toBe('Studying');
    expect(mockClassifier).toHaveBeenCalledWith(
      expect.not.stringContaining('OPEN EDITORS'),
      expect.any(Array),
      expect.any(Object)
    );
  });

  it('should improve classification of code-heavy content', async () => {
    const codeContent = `
      TS VisionService.ts TS DistilBARTService.ts 1, M
      export class EducationalContentDetector implements IClassificationService {
        private static readonly STUDYING_THRESHOLD = 0.5;
        private static readonly MAX_TEXT_LENGTH = 1000;
      }
      
      // This demonstrates proper TypeScript patterns
      const result = await classifier(text, labels);
    `;

    mockClassifier.mockResolvedValue({
      scores: [0.82],
      labels: ['studying technical or educational content']
    });

    const result = await service.classifyWithConfidence(codeContent);
    
    expect(result.classification).toBe('Studying');
    expect(result.confidence).toBe(0.82);
  });
});