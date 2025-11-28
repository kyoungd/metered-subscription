/**
 * E2E Tests: POST /api/usage/record
 *
 * Tests usage recording with REAL database.
 * Requires test database to be set up.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. Organization with subscription and usage counter must exist (run Story 1.2, 1.3, 1.5 first)
 *
 * To run:
 *   npm run test:e2e -- tests/e2e/api/usage-record.e2e.test.ts
 *
 * Note:
 * - These tests use real database operations
 * - Tests are automatically skipped if DATABASE_URL is not configured
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { recordUsage } from "@/lib/services/usage/usage-recording-service";
import { createOrganization } from "@/lib/services/orgs/org-service";
import { ensureCustomer } from "@/lib/services/stripe/stripe-customer-service";
import { createSubscriptionForOrganization } from "@/lib/services/stripe/stripe-subscription-service";
import { seedUsageCounter } from "@/lib/services/usage/usage-service";

// Override the db import to use test database
jest.mock("@/lib/db", () => {
  const { getTestPrismaClient } = require("../helpers/test-database");
  return {
    db: getTestPrismaClient(),
  };
});

// Skip tests if Stripe key is not configured
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const shouldSkipTests =
  !STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("mock");

const describeE2E = shouldSkipTests ? describe.skip : describe;

describeE2E("E2E: POST /api/usage/record - Real Database", () => {
  beforeAll(async () => {
    // Initialize test database schema
    const { initializeTestDatabase } = await import("../helpers/test-database");
    await initializeTestDatabase();
  });

  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Service Layer - Real Database", () => {
    test("records usage successfully", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_record_${Date.now()}`;
      const requestId = `req_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert
      expect(result.periodKey).toBeDefined();
      expect(result.periodKey).toMatch(/^\d{4}-\d{2}$/);
      expect(result.used).toBe(5); // Started at 0, incremented by 5
      expect(result.remaining).toBe(25); // 30 - 5

      // Verify usage record was created
      const usageRecord = await prisma.usageRecord.findFirst({
        where: {
          metadata: {
            path: ["request_id"],
            equals: requestId,
          },
        },
      });
      expect(usageRecord).toBeDefined();
      expect(usageRecord?.value).toBe(5);
      expect(usageRecord?.metric).toBe("api_call");
    });

    test("returns existing result when request_id already exists (idempotent)", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_idempotent_${Date.now()}`;
      const requestId = `req_idempotent_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Record usage first time
      const result1 = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Act - Record same request_id again
      const result2 = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert - Should return same result
      expect(result2.periodKey).toBe(result1.periodKey);
      expect(result2.used).toBe(result1.used);
      expect(result2.remaining).toBe(result1.remaining);

      // Verify only one usage record exists
      const usageRecords = await prisma.usageRecord.findMany({
        where: {
          metadata: {
            path: ["request_id"],
            equals: requestId,
          },
        },
      });
      expect(usageRecords.length).toBe(1);

      // Verify counter was only incremented once
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      const counter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });
      expect(counter?.used).toBe(5); // Only incremented once
    });

    test("increments usage counter correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_increment_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Record multiple usage events
      await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        `req_1_${Date.now()}`
      );
      await recordUsage(
        clerkOrgId,
        "api_call",
        3,
        occurredAt,
        `req_2_${Date.now()}`
      );
      await recordUsage(
        clerkOrgId,
        "api_call",
        2,
        occurredAt,
        `req_3_${Date.now()}`
      );

      // Act - Get final state
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      const counter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });

      // Assert
      expect(counter?.used).toBe(10); // 5 + 3 + 2
      expect(counter?.included).toBe(30);
    });

    test("creates usage counter if it doesn't exist", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_create_counter_${Date.now()}`;
      const requestId = `req_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, and subscription (but don't seed usage)
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert
      expect(result.periodKey).toBeDefined();
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(25); // 30 - 5 (trial plan has 30)

      // Verify counter was created
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      const counter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });
      expect(counter).toBeDefined();
      expect(counter?.included).toBe(30);
      expect(counter?.used).toBe(5);
    });

    test("handles over-quota usage correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_over_quota_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Update counter to be close to limit
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      const counter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });

      await prisma.usageCounter.update({
        where: { id: counter!.id },
        data: { used: 28 }, // Close to 30 limit
      });

      // Act - Record usage that exceeds quota
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5, // This will exceed the 30 limit
        occurredAt,
        `req_over_${Date.now()}`
      );

      // Assert
      expect(result.used).toBe(33); // 28 + 5
      expect(result.remaining).toBe(-3); // Negative indicates over-quota

      // Verify usage was still recorded
      const updatedCounter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });
      expect(updatedCounter?.used).toBe(33);
    });
  });
});

