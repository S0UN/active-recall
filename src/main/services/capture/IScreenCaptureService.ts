export interface IScreenCaptureService {
  captureScreen(): Promise<Buffer>;
}
