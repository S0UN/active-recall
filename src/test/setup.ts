import 'reflect-metadata';
import { vi } from 'vitest';

beforeAll(() => {
  console.log('Test environment initialized');
});

afterAll(() => {
  vi.clearAllMocks();
});