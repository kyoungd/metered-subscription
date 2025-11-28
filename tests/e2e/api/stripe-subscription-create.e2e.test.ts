/**
 * E2E Tests: POST /api/stripe/subscription.create
 *
 * Tests subscription creation with REAL Stripe API calls.
 * Requires STRIPE_SECRET_KEY to be set in environment (test mode key).
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. STRIPE_SECRET_KEY environment variable set (test mode key)
 * 3. Organization must have stripeCustomerId (run Story 1.2 first)
 *
 * To run with real Stripe API:
 *   STRIPE_SECRET_KEY=sk_test_... npm run test:e2e -- tests/e2e/api/stripe-subscription-create.e2e.test.ts
 *
 * Note:
 * - These tests make real API calls to Stripe test mode (free, safe)
 * - Tests are automatically skipped if STRIPE_SECRET_KEY is not set or contains "mock"
 * - Stripe test mode keys start with "sk_test_" and are safe to use
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { createSubscriptionForOrganization } from "@/lib/services/stripe/stripe-subscription-service";
import { findOrganizationById } from "@/lib/db/repositories/org-repository";
import {
  StripeOrgNotFoundError,
  StripeValidationError,
} from "@/lib/errors/stripe-errors";

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

describeE2E("E2E: POST /api/stripe/subscription.create - Real Stripe API", () => {
  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Service Layer - Real Stripe API", () => {
    test("creates trial subscription successfully", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      // Create organization with Stripe customer
      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
        metadata: { test: "e2e" },
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_sub_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSubscriptionForOrganization(org.id, "trial");

      // Assert - Returns subscription details
      expect(result.subscriptionId).toBeDefined();
      expect(result.status).toBe("trialing");
      expect(result.trialEndsAt).toBeTruthy();

      // Assert - Database has subscription
      const subscription = await prisma.subscription.findUnique({
        where: { id: result.subscriptionId },
      });
      expect(subscription).not.toBeNull();
      expect(subscription!.status).toBe("trialing");
      expect(subscription!.planCode).toBe("trial");
      expect(subscription!.organizationId).toBe(org.id);

      // Assert - Subscription exists in Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription!.stripeSubscriptionId
      );
      expect(stripeSubscription).toBeDefined();
      expect(stripeSubscription.status).toBe("trialing");
      expect(stripeSubscription.customer).toBe(customer.id);
    });

    test("creates active subscription for non-trial plan", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
        metadata: { test: "e2e" },
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_sub_starter_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSubscriptionForOrganization(org.id, "starter");

      // Assert
      expect(result.subscriptionId).toBeDefined();
      expect(result.status).toBe("active");
      expect(result.trialEndsAt).toBeNull();

      // Assert - Database
      const subscription = await prisma.subscription.findUnique({
        where: { id: result.subscriptionId },
      });
      expect(subscription!.status).toBe("active");
      expect(subscription!.planCode).toBe("starter");
    });

    test("throws StripeOrgNotFoundError for non-existent organization", async () => {
      // Arrange
      const nonExistentOrgId = "org_nonexistent_123";

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(nonExistentOrgId, "trial")
      ).rejects.toThrow(StripeOrgNotFoundError);
    });

    test("throws StripeValidationError if org has no stripeCustomerId", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_no_customer_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: null, // No Stripe customer
        },
      });

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(org.id, "trial")
      ).rejects.toThrow(StripeValidationError);
      await expect(
        createSubscriptionForOrganization(org.id, "trial")
      ).rejects.toThrow("does not have a Stripe customer ID");
    });

    test("throws StripeValidationError for invalid planCode", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_invalid_plan_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(org.id, "invalid_plan" as any)
      ).rejects.toThrow(StripeValidationError);
    });

    test("creates subscriptions for all plan codes", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");
      const planCodes = ["trial", "starter", "growth", "pro"] as const;

      for (const planCode of planCodes) {
        const customer = await stripe.customers.create({
          email: `test_${planCode}_${Date.now()}@example.com`,
        });

        const org = await prisma.organization.create({
          data: {
            clerkOrgId: `org_e2e_${planCode}_${Date.now()}`,
            name: `E2E Test Org ${planCode}`,
            stripeCustomerId: customer.id,
          },
        });

        // Act
        const result = await createSubscriptionForOrganization(org.id, planCode);

        // Assert
        expect(result.subscriptionId).toBeDefined();
        expect(result.status).toBe(planCode === "trial" ? "trialing" : "active");

        // Verify in database
        const subscription = await prisma.subscription.findUnique({
          where: { id: result.subscriptionId },
        });
        expect(subscription!.planCode).toBe(planCode);
      }
    });
  });

  describe("Data Integrity", () => {
    test("subscription is linked to organization correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_linked_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSubscriptionForOrganization(org.id, "trial");

      // Assert - Subscription linked to org
      const subscription = await prisma.subscription.findUnique({
        where: { id: result.subscriptionId },
        include: { organization: true },
      });
      expect(subscription!.organizationId).toBe(org.id);
      expect(subscription!.organization.id).toBe(org.id);
      expect(subscription!.clerkOrgId).toBe(org.clerkOrgId);
    });

    test("subscription timestamps are in UTC", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_timestamps_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSubscriptionForOrganization(org.id, "trial");

      // Assert
      const subscription = await prisma.subscription.findUnique({
        where: { id: result.subscriptionId },
      });
      expect(subscription!.createdAt.toISOString()).toMatch(/Z$/);
      expect(subscription!.updatedAt.toISOString()).toMatch(/Z$/);
      expect(subscription!.currentPeriodStart.toISOString()).toMatch(/Z$/);
      expect(subscription!.currentPeriodEnd.toISOString()).toMatch(/Z$/);
      if (subscription!.trialEndsAt) {
        expect(subscription!.trialEndsAt.toISOString()).toMatch(/Z$/);
      }
    });

    test("stripeSubscriptionId is unique", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer1 = await stripe.customers.create({
        email: `test1_${Date.now()}@example.com`,
      });
      const customer2 = await stripe.customers.create({
        email: `test2_${Date.now()}@example.com`,
      });

      const org1 = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_unique1_${Date.now()}`,
          name: "E2E Test Org 1",
          stripeCustomerId: customer1.id,
        },
      });

      const org2 = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_unique2_${Date.now()}`,
          name: "E2E Test Org 2",
          stripeCustomerId: customer2.id,
        },
      });

      // Act
      const result1 = await createSubscriptionForOrganization(org1.id, "trial");
      const result2 = await createSubscriptionForOrganization(org2.id, "trial");

      // Assert - Different subscriptions have different Stripe IDs
      const sub1 = await prisma.subscription.findUnique({
        where: { id: result1.subscriptionId },
      });
      const sub2 = await prisma.subscription.findUnique({
        where: { id: result2.subscriptionId },
      });
      expect(sub1!.stripeSubscriptionId).not.toBe(sub2!.stripeSubscriptionId);
    });
  });
});

