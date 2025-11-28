/**
 * E2E Tests: POST /api/payments/setup-intent.create
 *
 * Tests SetupIntent creation with REAL Stripe API calls.
 * Requires STRIPE_SECRET_KEY to be set in environment (test mode key).
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. STRIPE_SECRET_KEY environment variable set (test mode key)
 * 3. Organization must have stripeCustomerId (run Story 1.2 first)
 *
 * To run with real Stripe API:
 *   STRIPE_SECRET_KEY=sk_test_... npm run test:e2e -- tests/e2e/api/payments-setup-intent-create.e2e.test.ts
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
import { createSetupIntent } from "@/lib/services/payments/payment-service";
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

describeE2E("E2E: POST /api/payments/setup-intent.create - Real Stripe API", () => {
  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Service Layer - Real Stripe API", () => {
    test("creates SetupIntent successfully", async () => {
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
          clerkOrgId: `org_e2e_setup_intent_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSetupIntent(org.id);

      // Assert - Returns client secret
      expect(result.clientSecret).toBeDefined();
      expect(result.clientSecret).toMatch(/^seti_/);

      // Assert - SetupIntent exists in Stripe
      const setupIntentId = result.clientSecret.split("_secret_")[0];
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      expect(setupIntent).toBeDefined();
      expect(setupIntent.customer).toBe(customer.id);
      expect(setupIntent.usage).toBe("off_session");
      expect(setupIntent.metadata?.orgId).toBe(org.id);
    });

    test("throws StripeOrgNotFoundError for non-existent organization", async () => {
      // Arrange
      const nonExistentOrgId = "org_nonexistent_123";

      // Act & Assert
      await expect(createSetupIntent(nonExistentOrgId)).rejects.toThrow(
        StripeOrgNotFoundError
      );
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
      await expect(createSetupIntent(org.id)).rejects.toThrow(StripeValidationError);
      await expect(createSetupIntent(org.id)).rejects.toThrow("does not have a Stripe customer ID");
    });

    test("creates multiple SetupIntents for same customer", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_multiple_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act - Create multiple SetupIntents
      const result1 = await createSetupIntent(org.id);
      const result2 = await createSetupIntent(org.id);

      // Assert - Both should have different client secrets
      expect(result1.clientSecret).not.toBe(result2.clientSecret);
      expect(result1.clientSecret).toMatch(/^seti_/);
      expect(result2.clientSecret).toMatch(/^seti_/);

      // Verify both exist in Stripe
      const setupIntentId1 = result1.clientSecret.split("_secret_")[0];
      const setupIntentId2 = result2.clientSecret.split("_secret_")[0];
      const setupIntent1 = await stripe.setupIntents.retrieve(setupIntentId1);
      const setupIntent2 = await stripe.setupIntents.retrieve(setupIntentId2);
      expect(setupIntent1.customer).toBe(customer.id);
      expect(setupIntent2.customer).toBe(customer.id);
    });
  });

  describe("Data Integrity", () => {
    test("SetupIntent metadata contains orgId", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_metadata_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSetupIntent(org.id);

      // Assert - Metadata contains orgId
      const setupIntentId = result.clientSecret.split("_secret_")[0];
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      expect(setupIntent.metadata?.orgId).toBe(org.id);
    });

    test("SetupIntent has correct usage type", async () => {
      // Arrange
      const prisma = getTestPrismaClient();
      const { stripe } = await import("@/lib/stripe");

      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
      });

      const org = await prisma.organization.create({
        data: {
          clerkOrgId: `org_e2e_usage_${Date.now()}`,
          name: "E2E Test Org",
          stripeCustomerId: customer.id,
        },
      });

      // Act
      const result = await createSetupIntent(org.id);

      // Assert - Usage is off_session
      const setupIntentId = result.clientSecret.split("_secret_")[0];
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      expect(setupIntent.usage).toBe("off_session");
    });
  });
});

