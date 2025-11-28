/**
 * E2E Tests: POST /api/usage/seed
 *
 * Tests usage counter seeding with REAL database.
 * Requires test database to be running.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 *
 * To run:
 *   npm run test:e2e -- tests/e2e/api/usage-seed.e2e.test.ts
 *
 * Note:
 * - These tests use a real database
 * - Tests create real organizations, subscriptions, and usage counters
 * - Database is cleared before each test for isolation
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { seedUsageCounter } from "@/lib/services/usage/usage-service";
import { createSubscriptionForOrganization } from "@/lib/services/stripe/stripe-subscription-service";
import { ensureCustomer } from "@/lib/services/stripe/stripe-customer-service";
import { findUsageCounter, formatPeriodKey } from "@/lib/db/repositories/usage-repository";
import { ApplicationError } from "@/lib/utils/errors";

// Override the db import to use test database
jest.mock("@/lib/db", () => {
  const { getTestPrismaClient } = require("../helpers/test-database");
  return {
    db: getTestPrismaClient(),
  };
});

describe("E2E: POST /api/usage/seed - Real Database", () => {
  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Service Layer - Real Database", () => {
    test("seeds usage counter successfully for trial plan", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create organization
      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_seed_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org to get stripeCustomerId
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });
      expect(updatedOrg?.stripeCustomerId).toBeDefined();

      // Create subscription using service
      const subscriptionResult = await createSubscriptionForOrganization(
        org.id,
        "trial"
      );

      // Get subscription from DB
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      expect(dbSubscription).not.toBeNull();

      // Act
      const result = await seedUsageCounter(org.id);

      // Assert - Returns periodKey and remaining
      expect(result.periodKey).toBeDefined();
      expect(result.remaining).toBe(30); // trial plan has 30 API calls

      // Assert - Database has usage counter
      const periodKey = formatPeriodKey(dbSubscription!.currentPeriodStart);
      const counter = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        periodKey,
        "api_call"
      );
      expect(counter).not.toBeNull();
      expect(counter!.included).toBe(30);
      expect(counter!.used).toBe(0);
      expect(counter!.included - counter!.used).toBe(30); // remaining = included - used
      expect(counter!.organizationId).toBe(org.id);
      expect(counter!.subscriptionId).toBe(dbSubscription!.id);
    });

    test("seeds usage counter with correct quota for trial plan", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_trial_quota_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Act
      const result = await seedUsageCounter(org.id);

      // Assert - Trial plan has 30 API calls
      expect(result.remaining).toBe(30);

      // Verify in database
      const dbSubscription = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
      });
      const periodKey = formatPeriodKey(dbSubscription!.currentPeriodStart);
      const counter = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        periodKey,
        "api_call"
      );
      expect(counter!.included).toBe(30);
    });

    test("preserves existing usage when re-seeding", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_reseed_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Get subscription from DB
      const dbSubscription = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
      });
      const periodKey = formatPeriodKey(dbSubscription!.currentPeriodStart);

      // First seed
      await seedUsageCounter(org.id);

      // Manually update usage to simulate some usage
      await prisma.usageCounter.update({
        where: {
          clerkOrgId_periodKey_metric: {
            clerkOrgId: updatedOrg!.clerkOrgId,
            periodKey,
            metric: "api_call",
          },
        },
        data: {
          used: 10,
        },
      });

      // Act - Re-seed
      const result = await seedUsageCounter(org.id);

      // Assert - Remaining should account for existing usage (trial has 30)
      expect(result.remaining).toBe(20); // 30 - 10

      // Verify in database - used should be preserved
      const counter = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        periodKey,
        "api_call"
      );
      expect(counter!.used).toBe(10);
      expect(counter!.included).toBe(30);
    });

    test("throws error if no active subscription found", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_no_sub_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Act & Assert
      await expect(seedUsageCounter(org.id)).rejects.toThrow(ApplicationError);
      try {
        await seedUsageCounter(org.id);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        expect((error as ApplicationError).code).toBe("NO_ACTIVE_SUBSCRIPTION");
      }
    });

    test("formats period key correctly from subscription period", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_period_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Get subscription from DB
      const dbSubscription = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
      });
      const expectedPeriodKey = formatPeriodKey(dbSubscription!.currentPeriodStart);

      // Act
      const result = await seedUsageCounter(org.id);

      // Assert
      expect(result.periodKey).toBe(expectedPeriodKey);

      // Verify in database
      const counter = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        expectedPeriodKey,
        "api_call"
      );
      expect(counter).not.toBeNull();
      expect(counter!.periodKey).toBe(expectedPeriodKey);
    });

    test("creates unique counter per period key", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_unique_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Get subscription from DB
      const dbSubscription1 = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
      });
      const periodStart1 = dbSubscription1!.currentPeriodStart;
      const periodKey1 = formatPeriodKey(periodStart1);

      // Seed first period
      await seedUsageCounter(org.id);

      // Simulate period rollover - update subscription to next month
      const nextMonth = new Date(periodStart1);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const periodKey2 = formatPeriodKey(nextMonth);

      await prisma.subscription.update({
        where: { id: dbSubscription1!.id },
        data: {
          currentPeriodStart: nextMonth,
          currentPeriodEnd: new Date(
            nextMonth.getTime() + 30 * 24 * 60 * 60 * 1000
          ),
        },
      });

      // Act - Seed for new period
      const result = await seedUsageCounter(org.id);

      // Assert - Should create new counter for new period
      expect(result.periodKey).toBe(periodKey2);

      // Verify both counters exist
      const counter1 = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        periodKey1,
        "api_call"
      );
      const counter2 = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        periodKey2,
        "api_call"
      );
      expect(counter1).not.toBeNull();
      expect(counter2).not.toBeNull();
      expect(counter1!.periodKey).toBe(periodKey1);
      expect(counter2!.periodKey).toBe(periodKey2);
    });
  });

  describe("Data Integrity", () => {
    test("usage counter is linked to organization and subscription correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_linked_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Get subscription from DB
      const dbSubscription = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
      });

      // Act
      await seedUsageCounter(org.id);

      // Assert - Counter linked correctly
      const periodKey = formatPeriodKey(dbSubscription!.currentPeriodStart);
      const counter = await prisma.usageCounter.findUnique({
        where: {
          clerkOrgId_periodKey_metric: {
            clerkOrgId: updatedOrg!.clerkOrgId,
            periodKey,
            metric: "api_call",
          },
        },
        include: {
          organization: true,
          subscription: true,
        },
      });

      expect(counter).not.toBeNull();
      expect(counter!.organizationId).toBe(org.id);
      expect(counter!.subscriptionId).toBe(dbSubscription!.id);
      expect(counter!.organization.id).toBe(org.id);
      expect(counter!.subscription.id).toBe(dbSubscription!.id);
    });

    test("period key format is YYYY-MM", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_format_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null,
        },
      });

      // Ensure Stripe customer
      const email = `test_${Date.now()}@example.com`;
      await ensureCustomer(org.id, email);

      // Refresh org
      const updatedOrg = await prisma.organization.findUnique({
        where: { id: org.id },
      });

      // Create subscription using service (trial plan)
      await createSubscriptionForOrganization(org.id, "trial");

      // Act
      const result = await seedUsageCounter(org.id);

      // Assert - Period key format
      expect(result.periodKey).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
      expect(result.periodKey.length).toBe(7); // YYYY-MM = 7 characters

      // Verify in database
      const counter = await findUsageCounter(
        updatedOrg!.clerkOrgId,
        result.periodKey,
        "api_call"
      );
      expect(counter!.periodKey).toMatch(/^\d{4}-\d{2}$/);
    });
  });
});

