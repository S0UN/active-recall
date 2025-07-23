
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use 'node' environment for testing backend services
    environment: 'node',
    
    // Enable globals (vi, describe, it, etc.) so you don't have to import them
    globals: true,
    
    // Look for test files in any file ending with .test.ts or .spec.ts
    include: ['**/*.{test,spec}.ts'],

    // Optional: If you need a setup file to run before all tests
    setupFiles: './src/test/setup.ts',
  },
});
