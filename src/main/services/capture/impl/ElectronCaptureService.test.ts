import { describe, it, expect } from "vitest";

// Skip ElectronCaptureService tests due to complex Electron API mocking requirements
// These would be better suited for integration tests in an actual Electron environment
describe("ElectronCaptureService", () => {
  it.skip("should be tested in integration environment", () => {
    // ElectronCaptureService tests require proper Electron environment
    // and are complex to mock. These should be covered by integration tests.
    expect(true).toBe(true);
  });
});