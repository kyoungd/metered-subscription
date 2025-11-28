/**
 * E2E Tests: GET /api/me/entitlements.read
 *
 * Tests entitlements retrieval with REAL database.
 * Requires test database to be set up.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. Organization with subscription and usage counter must exist (run Story 1.2, 1.3, 1.5 first)
 *
 * To run:
 *   npm run test:e2e -- tests/e2e/api/me-entitlements-read.e2e.test.ts
 *
 * Note:
 * - These tests use real database operations
 * - Tests are automatically skipped if DATABASE_URL is not configured
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { getEntitlements } from "@/lib/services/entitlements/entitlements-service";
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

describeE2E("E2E: GET /api/me/entitlements.read - Real Database", () => {
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
    test("returns entitlements successfully with usage counter", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_entitlements_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );
      const seedResult = await seedUsageCounter(orgResult.orgId);

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result.planCode).toBe("trial");
      expect(result.included).toBe(30); // Trial plan has 30 API calls
      expect(result.used).toBe(0); // Newly seeded counter
      expect(result.remaining).toBe(30);
      expect(result.periodKey).toBe(seedResult.periodKey);
    });

    test("returns entitlements with used quota", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_used_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );
      await seedUsageCounter(orgResult.orgId);

      // Update usage counter to have some usage
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
        data: { used: 15 },
      });

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result.planCode).toBe("trial");
      expect(result.included).toBe(30); // Trial plan has 30 API calls
      expect(result.used).toBe(15);
      expect(result.remaining).toBe(15);
    });

    test("returns zeros when usage counter does not exist", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_no_counter_${Date.now()}`;
      
      // Create organization, customer, and subscription (but don't seed usage)
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result.planCode).toBe("trial");
      expect(result.included).toBe(0); // No counter exists
      expect(result.used).toBe(0);
      expect(result.remaining).toBe(0);
      expect(result.periodKey).toBeDefined();
      expect(result.periodKey).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
    });

    test("throws error when organization not found", async () => {
      // Arrange
      const clerkOrgId = "org_nonexistent_123";

      // Act & Assert
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow();
    });

    test("throws error when no active subscription", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_no_sub_${Date.now()}`;
      
      // Create organization but no subscription
      await createOrganization(clerkOrgId, "E2E Test Org");

      // Act & Assert
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow();
    });

    test("calculates remaining correctly for over-quota usage", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_over_quota_${Date.now()}`;
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );
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
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result.planCode).toBe("trial");
      expect(result.included).toBe(30);
      expect(result.used).toBe(50);
      expect(result.remaining).toBe(-20); // Negative remaining indicates over-quota
    });
  });
});

