/**
 * E2E Tests: POST /api/quota/check
 *
 * Tests quota checking with REAL database.
 * Requires test database to be set up.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. Organization with subscription and usage counter must exist (run Story 1.2, 1.3, 1.5 first)
 *
 * To run:
 *   npm run test:e2e -- tests/e2e/api/quota-check.e2e.test.ts
 *
 * Note:
 * - These tests use real database operations
 * - Tests are automatically skipped if DATABASE_URL is not configured
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { checkQuota } from "@/lib/services/quota/quota-service";
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

describeE2E("E2E: POST /api/quota/check - Real Database", () => {
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
    test("returns allow=true when quota is available", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_quota_available_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result.allow).toBe(true);
      expect(result.remaining).toBe(30); // Trial plan has 30 API calls, newly seeded = 0 used
    });

    test("returns allow=false when quota is exceeded", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_quota_exceeded_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Update usage counter to exceed quota
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      
      const usageCounter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });

      await prisma.usageCounter.update({
        where: { id: usageCounter!.id },
        data: { used: 30 }, // All quota used
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result.allow).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("returns allow=false when over quota", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_quota_over_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Update usage counter to exceed quota
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      
      const usageCounter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });

      await prisma.usageCounter.update({
        where: { id: usageCounter!.id },
        data: { used: 50 }, // Over the 30 limit
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result.allow).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("returns allow=true when exactly at quota limit minus one", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_quota_edge_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Update usage counter to be one less than quota
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: orgResult.orgId },
      });
      
      const usageCounter = await prisma.usageCounter.findFirst({
        where: {
          clerkOrgId,
          subscriptionId: subscription!.id,
        },
      });

      await prisma.usageCounter.update({
        where: { id: usageCounter!.id },
        data: { used: 29 }, // One less than 30
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result.allow).toBe(true);
      expect(result.remaining).toBe(1);
    });

    test("throws error when organization not found", async () => {
      // Arrange
      const clerkOrgId = "org_nonexistent_123";

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow();
    });

    test("throws error when no active subscription", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_no_sub_${Date.now()}`;
      
      // Create organization but no subscription
      await createOrganization(clerkOrgId, "E2E Test Org");

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow();
    });

    test("throws error when usage counter not found", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_no_counter_${Date.now()}`;
      
      // Create organization, customer, and subscription (but don't seed usage)
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow();
    });
  });
});

