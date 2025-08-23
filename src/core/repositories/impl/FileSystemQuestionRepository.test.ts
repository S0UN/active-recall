/**
 * Tests for FileSystemQuestionRepository
 * 
 * Runs the contract tests against the FileSystemQuestionRepository implementation
 * to verify it correctly implements the IQuestionRepository interface.
 */

import { describe, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileSystemQuestionRepository } from './FileSystemQuestionRepository';
import { runQuestionRepositoryContractTests } from '../IQuestionRepository.contract.test';

describe('FileSystemQuestionRepository', () => {
  let testDirectory: string;
  let repository: FileSystemQuestionRepository;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDirectory = join(tmpdir(), `question-repo-test-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    repository = new FileSystemQuestionRepository(testDirectory);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDirectory, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Run all contract tests
  runQuestionRepositoryContractTests(
    () => {
      // Always create a fresh repository for each test
      const newTestDir = join(tmpdir(), `question-repo-contract-${Date.now()}-${Math.random().toString(36).substring(2)}`);
      return new FileSystemQuestionRepository(newTestDir);
    },
    async () => {
      // Cleanup function - no-op since each test gets a fresh temp directory
      // The OS will handle cleanup of temp directories
    }
  );

  // Additional FileSystemQuestionRepository-specific tests can go here
  describe('FileSystem-specific functionality', () => {
    it.skip('placeholder test for file system specifics', () => {
      // These tests would cover file system specific behavior
      // like directory structure, file organization, etc.
    });
  });
});