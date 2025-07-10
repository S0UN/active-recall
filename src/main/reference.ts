

// -----------------------------
// 1. INTERFACES & DI REGISTRATION
// -----------------------------

// (A) Polling System Interface
interface IPollingSystem {
  register(name: string, intervalMs: number, callback: () => void): void;
  unregister(name: string): void;
}

// (B) OCR / Classification / Capture / Batcher
interface IOcrService {
  getTextFromImage(image: Buffer): Promise<string>;
}

interface IClassificationService {
  classify(text: string): Promise<'Studying' | 'Idle'>;
}

interface IScreenCaptureService {
  capture(): Promise<Buffer>;
}

interface IBatcherService {
  add(text: string): void;
  flushIfNeeded(): Promise<void>;
}

// (C) Pollers
interface IPoller {
  start(): void;
  stop(): void;
}

// (D) Orchestrator State
interface IOrchestratorState {
  onEnter(): void;
  onWindowChange(key: string): void;
  onOcrTick(): void;
  onExit(): void;
}

// DI container (tsyringe-like)
container.registerSingleton<IPollingSystem>('PollingSystem', PollingSystem);
container.registerSingleton<IOcrService>('OcrService', TesseractOcrService);
container.registerSingleton<IClassificationService>('ClassificationService', DistilBARTService);
container.registerSingleton<IScreenCaptureService>('ScreenCaptureService', ElectronCaptureService);
container.registerSingleton<IBatcherService>('BatcherService', BatcherService);
container.registerSingleton<WindowChangePoller>(WindowChangePoller);
container.registerSingleton<StudyingOCRPoller>(StudyingOCRPoller);
container.registerSingleton<IdleRevalidationPoller>(IdleRevalidationPoller);
container.registerSingleton<Orchestrator>(Orchestrator);


// -----------------------------
// 2. POLLING SYSTEM
// -----------------------------

class PollingSystem implements IPollingSystem {
  private timers = new Map<string, any>();
  register(name, intervalMs, callback) {
    this.unregister(name);
    this.timers.set(name, setInterval(callback, intervalMs));
  }
  unregister(name) {
    if (this.timers.has(name)) {
      clearInterval(this.timers.get(name));
      this.timers.delete(name);
    }
  }
}


// -----------------------------
// 3. POLLERS (wrap PollingSystem)
// -----------------------------

class WindowChangePoller implements IPoller {
  private lastKey: string|null = null;
  constructor(private polling: IPollingSystem, private onChange: (key:string)=>void) {}
  start() {
    this.polling.register('windowChange', 1000, async () => {
      const { id, title } = await activeWin();            // util reading OS window title
      const key = `${id}::${title}`;
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.onChange(key);
      }
    });
  }
  stop() {
    this.polling.unregister('windowChange');
  }
}

class StudyingOCRPoller implements IPoller {
  constructor(private polling: IPollingSystem, private onTick: ()=>void) {}
  start() {
    this.polling.register('studyingOcr', 30_000, this.onTick);
  }
  stop() {
    this.polling.unregister('studyingOcr');
  }
}

class IdleRevalidationPoller implements IPoller {
  constructor(private polling: IPollingSystem, private onFocusToIdle:(key:string)=>void) {}
  // This poller doesn’t use a blind timer—Orchestrator will call its one-off check on focus-change if needed.
  start() { /* no-op or register if you prefer timed idle sweeps */ }
  stop() { /* no-op */ }
}


// -----------------------------
// 4. PIPELINE FILTERS (Pipes & Filters + Strategy)
// -----------------------------

class ScreenCaptureService implements IScreenCaptureService {
  capture() {
    // call Electron desktopCapturer, return Buffer
  }
}

class OcrService implements IOcrService {
  getTextFromImage(buf) {
    // run Tesseract/OCR, return plain text
  }
}

class ClassificationService implements IClassificationService {
  classify(text) {
    // run zero-shot NLI model, return 'Studying' or 'Idle'
  }
}

class BatcherService implements IBatcherService {
  private buffer: string[] = [];
  add(text: string) {
    this.buffer.push(text);
  }
  async flushIfNeeded() {
    if (this.buffer.join(' ').split(' ').length > TOKEN_THRESHOLD) {
      const payload = this.buffer.join('\n');
      await sendToSemanticApi(payload);
      this.buffer = [];
    }
  }
}


// -----------------------------
// 5. STATE CLASSES (State Pattern)
// -----------------------------

class IdleState implements IOrchestratorState {
  constructor(private ctx: Orchestrator) {}
  onEnter() {
    this.ctx.windowPoller.start();
    this.ctx.studyingOcrPoller.stop();
  }
  onWindowChange(key: string) {
    const state = this.ctx.cache.get(key);
    if (!state) {
      this.ctx.runFullPipeline(key);
    } else if (Date.now() - state.lastClassified > 15*60_000) {
      this.ctx.runFullPipeline(key);
    }
  }
  onOcrTick() { /* noop in Idle */ }
  onExit() {
    this.ctx.windowPoller.stop();
  }
}

class StudyingState implements IOrchestratorState {
  constructor(private ctx: Orchestrator) {}
  onEnter() {
    this.ctx.studyingOcrPoller.start();
  }
  onWindowChange(key: string) {
    // just update lastSeen
    this.ctx.updateLastSeen(key);
  }
  onOcrTick() {
    this.ctx.runFullPipeline(this.ctx.currentKey);
  }
  onExit() {
    this.ctx.studyingOcrPoller.stop();
  }
}


// -----------------------------
// 6. ORCHESTRATOR (Facade + State + Strategy Invocation)
// -----------------------------

class Orchestrator {
  private cache = new Map<string, { mode: string, lastClassified: number }>();
  private state: IOrchestratorState;
  public currentKey: string|null = null;

  constructor(
    private windowPoller: WindowChangePoller,
    private studyingOcrPoller: StudyingOCRPoller,
    private idleRevalPoller: IdleRevalidationPoller,
    private capture: IScreenCaptureService,
    private ocr: IOcrService,
    private classifier: IClassificationService,
    private batcher: IBatcherService
  ) {
    this.state = new IdleState(this);
    windowPoller = new WindowChangePoller(container.resolve('PollingSystem'), key => {
      this.currentKey = key;
      this.state.onWindowChange(key);
      this.transitionStateIfNeeded(key);
    });
    studyingOcrPoller = new StudyingOCRPoller(container.resolve('PollingSystem'), () => {
      this.state.onOcrTick();
    });
  }

  start() {
    this.state.onEnter();
  }
  stop() {
    this.state.onExit();
  }

  private transitionStateIfNeeded(key: string) {
    const entry = this.cache.get(key);
    const desiredState = entry?.mode === 'Studying' ? StudyingState : IdleState;
    if (!(this.state instanceof desiredState)) {
      this.state.onExit();
      this.state = new desiredState(this);
      this.state.onEnter();
    }
  }

  async runFullPipeline(key: string) {
    // 1) Capture
    const img = await this.capture.capture();
    // 2) OCR
    const text = await this.ocr.getTextFromImage(img);
    // 3) Classify
    const mode = await this.classifier.classify(text);
    // 4) Update cache
    this.cache.set(key, { mode, lastClassified: Date.now() });
    // 5) If studying, batch & flush
    if (mode === 'Studying') {
      this.batcher.add(text);
      await this.batcher.flushIfNeeded();
    }
  }

  updateLastSeen(key: string) {
    const entry = this.cache.get(key);
    if (entry) entry.lastClassified = Date.now();
  }
}

