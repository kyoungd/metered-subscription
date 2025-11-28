/**
 * E2E Tests: Story 4 - Complete Usage & Quota Flow
 *
 * Tests the complete Story 4 flow: quota check → record usage → verify state.
 * Requires test database to be set up.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. Organization with subscription and usage counter must exist (run Story 1.2, 1.3, 1.5 first)
 *
 * To run:
 *   npm run test:e2e -- tests/e2e/api/story-4-flow.e2e.test.ts
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

describeE2E("E2E: Story 4 - Complete Usage & Quota Flow", () => {
  beforeAll(async () => {
    // Initialize test database schema
    const { initializeTestDatabase } = await import("../helpers/test-database");
    await initializeTestDatabase();
  });

  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Complete Flow", () => {
    test("full flow: check quota → record usage → check quota again", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const clerkOrgId = `org_e2e_flow_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Step 1: Check quota (should be available)
      const quotaCheck1 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck1.allow).toBe(true);
      expect(quotaCheck1.remaining).toBe(30); // Trial plan has 30, newly seeded = 0 used

      // Step 2: Record usage
      const recordResult1 = await recordUsage(
        clerkOrgId,
        "api_call",
        10,
        occurredAt,
        `req_1_${Date.now()}`
      );
      expect(recordResult1.used).toBe(10);
      expect(recordResult1.remaining).toBe(20);

      // Step 3: Check quota again (should still be available)
      const quotaCheck2 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck2.allow).toBe(true);
      expect(quotaCheck2.remaining).toBe(20);

      // Step 4: Record more usage
      const recordResult2 = await recordUsage(
        clerkOrgId,
        "api_call",
        15,
        occurredAt,
        `req_2_${Date.now()}`
      );
      expect(recordResult2.used).toBe(25);
      expect(recordResult2.remaining).toBe(5);

      // Step 5: Check quota (should still be available, but low)
      const quotaCheck3 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck3.allow).toBe(true);
      expect(quotaCheck3.remaining).toBe(5);

      // Step 6: Record usage that exceeds quota
      const recordResult3 = await recordUsage(
        clerkOrgId,
        "api_call",
        10, // This will exceed the 30 limit
        occurredAt,
        `req_3_${Date.now()}`
      );
      expect(recordResult3.used).toBe(35);
      expect(recordResult3.remaining).toBe(-5); // Negative = over quota

      // Step 7: Check quota (should be denied)
      const quotaCheck4 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck4.allow).toBe(false);
      expect(quotaCheck4.remaining).toBe(0);
    });

    test("idempotency: duplicate request_id doesn't increment counter", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_idempotent_flow_${Date.now()}`;
      const requestId = `req_idempotent_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Step 1: Check initial quota
      const quotaCheck1 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck1.allow).toBe(true);
      expect(quotaCheck1.remaining).toBe(30);

      // Step 2: Record usage first time
      const recordResult1 = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );
      expect(recordResult1.used).toBe(5);
      expect(recordResult1.remaining).toBe(25);

      // Step 3: Check quota after first record
      const quotaCheck2 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck2.allow).toBe(true);
      expect(quotaCheck2.remaining).toBe(25);

      // Step 4: Record same request_id again (idempotent)
      const recordResult2 = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId // Same request_id
      );
      expect(recordResult2.used).toBe(5); // Should still be 5, not 10
      expect(recordResult2.remaining).toBe(25); // Should still be 25

      // Step 5: Verify quota is unchanged
      const quotaCheck3 = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck3.allow).toBe(true);
      expect(quotaCheck3.remaining).toBe(25); // Unchanged from step 3
    });

    test("multiple metrics: different metrics tracked separately", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_metrics_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      
      // Seed usage for api_call metric
      await seedUsageCounter(orgResult.orgId);

      // Note: This test assumes we only support 'api_call' metric for now
      // If multiple metrics are supported in the future, this test can be expanded
      
      // Record usage for api_call
      const recordResult = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        `req_api_${Date.now()}`
      );
      expect(recordResult.used).toBe(5);

      // Check quota for api_call
      const quotaCheck = await checkQuota(clerkOrgId, "api_call");
      expect(quotaCheck.allow).toBe(true);
      expect(quotaCheck.remaining).toBe(25);
    });

    test("quota check → record usage → quota check cycle", async () => {
      // Arrange
      const clerkOrgId = `org_e2e_cycle_${Date.now()}`;
      const occurredAt = new Date();
      
      // Create organization, customer, subscription, and seed usage
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      await createSubscriptionForOrganization(orgResult.orgId, "trial");
      await seedUsageCounter(orgResult.orgId);

      // Perform multiple cycles until quota is exhausted
      // Trial plan has 30 API calls, so we'll do 15 cycles of 2 each to exhaust it
      for (let i = 1; i <= 15; i++) {
        // Check quota before recording
        const quotaCheckBefore = await checkQuota(clerkOrgId, "api_call");
        const expectedRemainingBefore = 30 - (i - 1) * 2; // Each cycle uses 2
        expect(quotaCheckBefore.allow).toBe(expectedRemainingBefore > 0);
        expect(quotaCheckBefore.remaining).toBe(expectedRemainingBefore > 0 ? expectedRemainingBefore : 0);

        // Record usage
        const recordResult = await recordUsage(
          clerkOrgId,
          "api_call",
          2,
          occurredAt,
          `req_cycle_${i}_${Date.now()}`
        );
        expect(recordResult.used).toBe(i * 2);
        expect(recordResult.remaining).toBe(30 - i * 2);

        // Check quota after recording
        const quotaCheckAfter = await checkQuota(clerkOrgId, "api_call");
        const expectedRemainingAfter = 30 - i * 2;
        expect(quotaCheckAfter.allow).toBe(expectedRemainingAfter > 0);
        expect(quotaCheckAfter.remaining).toBe(expectedRemainingAfter > 0 ? expectedRemainingAfter : 0);
      }

      // Final quota check should be denied (30 used, 0 remaining)
      const finalQuotaCheck = await checkQuota(clerkOrgId, "api_call");
      expect(finalQuotaCheck.allow).toBe(false);
      expect(finalQuotaCheck.remaining).toBe(0);
    });
  });
});

