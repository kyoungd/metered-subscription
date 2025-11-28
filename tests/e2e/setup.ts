/**
 * E2E Test Setup
 * 
 * Global setup for E2E tests.
 * Initializes the test database before tests run.
 */

// Set up required environment variables BEFORE any imports
// Load from .env file if available (via dotenv or Next.js)
process.env.NODE_ENV = 'test';
// Use TEST_DATABASE_URL if provided, otherwise fall back to DATABASE_URL from .env
// This allows running E2E tests against local dev database without Docker
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://test:test@localhost:5433/metered_subscription_test';

// Only set mock values if not already set (preserve .env values)
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_mock';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_mock';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';
process.env.STIGG_SERVER_API_KEY = process.env.STIGG_SERVER_API_KEY || 'stigg_test_mock';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'e2e_test_secret_mock';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

import {
  initializeTestDatabase,
  disconnectTestDatabase,
  waitForTestDatabase,
} from "./helpers/test-database";

// Run before all E2E tests
beforeAll(async () => {
  console.log("\n🚀 Starting E2E test suite...\n");
  
  // Wait for database to be ready
  await waitForTestDatabase();
  
  // Initialize database (run migrations, clear data)
  await initializeTestDatabase();
}, 60000); // 60 second timeout for database setup

// Run after all E2E tests
afterAll(async () => {
  console.log("\n🏁 E2E test suite complete\n");
  await disconnectTestDatabase();
});

