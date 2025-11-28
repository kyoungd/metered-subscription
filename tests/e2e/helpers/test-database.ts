/**
 * E2E Test Database Helper
 * 
 * Manages real database connections for E2E testing.
 * Uses a separate test database to avoid affecting development data.
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

// Test database URL - uses TEST_DATABASE_URL if set, otherwise falls back to DATABASE_URL
// This allows running E2E tests against local dev database without Docker
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 
  process.env.DATABASE_URL ||
  "postgresql://test:test@localhost:5433/metered_subscription_test";

let testPrismaClient: PrismaClient | null = null;

/**
 * Gets or creates the test Prisma client
 */
export function getTestPrismaClient(): PrismaClient {
  if (!testPrismaClient) {
    testPrismaClient = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });
  }
  return testPrismaClient;
}

/**
 * Initializes the test database
 * - Pushes schema (creates tables if they don't exist)
 * - Clears existing data
 */
export async function initializeTestDatabase(): Promise<void> {
  console.log("🔧 Initializing test database...");
  
  // Set the DATABASE_URL for Prisma CLI
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  
  try {
    // Push schema (creates tables if they don't exist)
    // This is safer than migrate deploy for test databases
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    console.log("✅ Schema pushed to test database");
  } catch (error) {
    console.error("❌ Failed to push schema:", error);
    throw error;
  }
  
  // Clear all data (will handle missing tables gracefully)
  await clearTestDatabase();
}

/**
 * Clears all data from the test database
 * Handles missing tables gracefully (won't fail if tables don't exist)
 */
export async function clearTestDatabase(): Promise<void> {
  const prisma = getTestPrismaClient();
  
  // Delete in order respecting foreign key constraints
  // Wrap each in try-catch to handle missing tables gracefully
  const deleteOperations = [
    () => prisma.usageRecord.deleteMany({}),
    () => prisma.usageCounter.deleteMany({}),
    () => prisma.subscription.deleteMany({}),
    () => prisma.user.deleteMany({}),
    () => prisma.organization.deleteMany({}),
    () => prisma.webhookQueue.deleteMany({}),
    () => prisma.debugLog.deleteMany({}),
  ];
  
  for (const operation of deleteOperations) {
    try {
      await operation();
    } catch (error: any) {
      // Ignore "table does not exist" errors
      if (error?.message?.includes("does not exist")) {
        // Table doesn't exist yet, that's okay
        continue;
      }
      // Re-throw other errors
      throw error;
    }
  }
  
  console.log("🧹 Test database cleared");
}

/**
 * Disconnects the test Prisma client
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (testPrismaClient) {
    await testPrismaClient.$disconnect();
    testPrismaClient = null;
    console.log("🔌 Test database disconnected");
  }
}

/**
 * Checks if the test database is available
 */
export async function isTestDatabaseAvailable(): Promise<boolean> {
  const prisma = getTestPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Waits for the test database to be ready
 */
export async function waitForTestDatabase(
  maxRetries: number = 30,
  retryIntervalMs: number = 1000
): Promise<void> {
  console.log("⏳ Waiting for test database...");
  
  for (let i = 0; i < maxRetries; i++) {
    if (await isTestDatabaseAvailable()) {
      console.log("✅ Test database is ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }
  
  throw new Error("Test database not available after max retries");
}

