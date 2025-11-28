/**
 * Jest Configuration for E2E Tests
 * 
 * Uses real database connections and no mocks.
 * Requires Docker test database to be running.
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.ts'],
  
  // Test environment - use node for database access
  testEnvironment: 'node',
  
  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Only run E2E tests
  testMatch: [
    '<rootDir>/tests/e2e/**/*.e2e.test.ts',
  ],
  
  // Longer timeout for database operations
  testTimeout: 30000,
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Ignore patterns
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  
  // Don't clear mocks - we want real implementations
  clearMocks: false,
  
  // Verbose output for E2E
  verbose: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles (useful for database connections)
  detectOpenHandles: true,
};

module.exports = createJestConfig(customJestConfig);

