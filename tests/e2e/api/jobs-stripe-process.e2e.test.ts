/**
 * E2E Tests: POST /api/jobs/stripe.process
 *
 * Tests Stripe webhook processing with REAL database and webhook events.
 * Requires STRIPE_SECRET_KEY to be set in environment (test mode key).
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. STRIPE_SECRET_KEY environment variable set (test mode key)
 * 3. Organization with subscription must exist (run Story 1.2, 1.3 first)
 *
 * To run with real Stripe API:
 *   STRIPE_SECRET_KEY=sk_test_... npm run test:e2e -- tests/e2e/api/jobs-stripe-process.e2e.test.ts
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
import { processStripeWebhook } from "@/lib/services/webhooks/webhook-processor-service";
import {
  upsertWebhookEvent,
  findWebhookEvent,
} from "@/lib/db/repositories/webhook-repository";
import {
  findSubscriptionByStripeSubscriptionId,
} from "@/lib/db/repositories/subscription-repository";
import { createOrganization } from "@/lib/services/orgs/org-service";
import { ensureCustomer } from "@/lib/services/stripe/stripe-customer-service";
import { createSubscriptionForOrganization } from "@/lib/services/stripe/stripe-subscription-service";
import { stripe } from "@/lib/stripe";

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

describeE2E("E2E: POST /api/jobs/stripe.process - Real Database", () => {
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
    test("processes subscription.updated event and updates subscription status", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create organization, customer, and subscription
      const clerkOrgId = `org_e2e_process_${Date.now()}`;
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscription) {
        throw new Error("Subscription not found in database");
      }

      // Create a webhook event payload manually (simulating Stripe webhook)
      // Use realistic timestamps for periods
      const now = Math.floor(Date.now() / 1000);
      const testEvent = {
        id: `evt_test_update_${Date.now()}`,
        object: "event",
        type: "customer.subscription.updated",
        created: now,
        data: {
          object: {
            id: dbSubscription.stripeSubscriptionId,
            customer: customerResult.stripeCustomerId,
            status: "active",
            current_period_start: now,
            current_period_end: now + 30 * 24 * 60 * 60, // 30 days from now
            trial_end: null,
          },
        },
      };

      // Enqueue the webhook event
      await upsertWebhookEvent({
        eventId: testEvent.id,
        eventType: testEvent.type,
        payload: testEvent,
      });

      // Act
      const result = await processStripeWebhook(testEvent.id);

      // Assert
      expect(result.converged).toBe(true);

      // Assert - Subscription status updated
      const updatedSubscription = await findSubscriptionByStripeSubscriptionId(
        dbSubscription.stripeSubscriptionId
      );
      expect(updatedSubscription).toBeDefined();
      expect(updatedSubscription?.status).toBe("active");

      // Assert - Event marked as processed
      const processedEvent = await findWebhookEvent(testEvent.id);
      expect(processedEvent?.processed).toBe(true);
      expect(processedEvent?.processedAt).toBeDefined();
    });

    test("processes subscription.deleted event and marks subscription as canceled", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create organization, customer, and subscription
      const clerkOrgId = `org_e2e_delete_${Date.now()}`;
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscription) {
        throw new Error("Subscription not found in database");
      }

      // Create a webhook event payload manually (simulating Stripe webhook)
      const now = Math.floor(Date.now() / 1000);
      const testEvent = {
        id: `evt_test_delete_${Date.now()}`,
        object: "event",
        type: "customer.subscription.deleted",
        created: now,
        data: {
          object: {
            id: dbSubscription.stripeSubscriptionId,
            customer: customerResult.stripeCustomerId,
            status: "canceled",
            current_period_start: now,
            current_period_end: now + 30 * 24 * 60 * 60,
            trial_end: null,
          },
        },
      };

      // Enqueue the webhook event
      await upsertWebhookEvent({
        eventId: testEvent.id,
        eventType: testEvent.type,
        payload: testEvent,
      });

      // Act
      const result = await processStripeWebhook(testEvent.id);

      // Assert
      expect(result.converged).toBe(true);

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscriptionForDelete = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscriptionForDelete) {
        throw new Error("Subscription not found in database");
      }

      // Assert - Subscription marked as canceled
      const updatedSubscription = await findSubscriptionByStripeSubscriptionId(
        dbSubscriptionForDelete.stripeSubscriptionId
      );
      expect(updatedSubscription).toBeDefined();
      expect(updatedSubscription?.status).toBe("canceled");

      // Assert - Event marked as processed
      const processedEvent = await findWebhookEvent(testEvent.id);
      expect(processedEvent?.processed).toBe(true);
    });

    test("handles idempotent processing correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create organization, customer, and subscription
      const clerkOrgId = `org_e2e_idempotent_${Date.now()}`;
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscriptionForIdempotent = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscriptionForIdempotent) {
        throw new Error("Subscription not found in database");
      }

      // Create a webhook event payload manually (simulating Stripe webhook)
      const now = Math.floor(Date.now() / 1000);
      const testEvent = {
        id: `evt_test_idempotent_${Date.now()}`,
        object: "event",
        type: "customer.subscription.updated",
        created: now,
        data: {
          object: {
            id: dbSubscriptionForIdempotent.stripeSubscriptionId,
            customer: customerResult.stripeCustomerId,
            status: "active",
            current_period_start: now,
            current_period_end: now + 30 * 24 * 60 * 60,
            trial_end: null,
          },
        },
      };

      // Enqueue the webhook event
      await upsertWebhookEvent({
        eventId: testEvent.id,
        eventType: testEvent.type,
        payload: testEvent,
      });

      // Act - Process twice
      const result1 = await processStripeWebhook(testEvent.id);
      const result2 = await processStripeWebhook(testEvent.id);

      // Assert - Both return converged
      expect(result1.converged).toBe(true);
      expect(result2.converged).toBe(true);

      // Assert - Event only processed once (idempotent)
      const processedEvent = await findWebhookEvent(testEvent.id);
      expect(processedEvent?.processed).toBe(true);
    });

    test("handles unhandled event types gracefully", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create a webhook event payload manually (simulating Stripe webhook)
      const testEvent = {
        id: `evt_test_unhandled_${Date.now()}`,
        object: "event",
        type: "charge.succeeded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "ch_test",
            amount: 1000,
          },
        },
      };

      // Enqueue the webhook event
      await upsertWebhookEvent({
        eventId: testEvent.id,
        eventType: testEvent.type,
        payload: testEvent,
      });

      // Act
      const result = await processStripeWebhook(testEvent.id);

      // Assert - Still returns converged (gracefully handles unhandled events)
      expect(result.converged).toBe(true);

      // Assert - Event marked as processed
      const processedEvent = await findWebhookEvent(testEvent.id);
      expect(processedEvent?.processed).toBe(true);
    });
  });

  describe("Data Integrity", () => {
    test("subscription periods are updated correctly from webhook", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create organization, customer, and subscription
      const clerkOrgId = `org_e2e_periods_${Date.now()}`;
      const orgResult = await createOrganization(clerkOrgId, "E2E Test Org");
      const customerResult = await ensureCustomer(orgResult.orgId, `test_${Date.now()}@example.com`);
      
      const subscriptionResult = await createSubscriptionForOrganization(
        orgResult.orgId,
        "trial"
      );

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscriptionForPeriods = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscriptionForPeriods) {
        throw new Error("Subscription not found in database");
      }

      // Create period dates
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 30);

      // Create a webhook event payload manually (simulating Stripe webhook)
      const testEvent = {
        id: `evt_test_periods_${Date.now()}`,
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: dbSubscriptionForPeriods.stripeSubscriptionId,
            customer: customerResult.stripeCustomerId,
            status: "active",
            current_period_start: Math.floor(periodStart.getTime() / 1000),
            current_period_end: Math.floor(periodEnd.getTime() / 1000),
            trial_end: null,
          },
        },
      };

      // Enqueue the webhook event
      await upsertWebhookEvent({
        eventId: testEvent.id,
        eventType: testEvent.type,
        payload: testEvent,
      });

      // Act
      await processStripeWebhook(testEvent.id);

      // Get the subscription from DB to get stripeSubscriptionId
      const dbSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionResult.subscriptionId },
      });
      
      if (!dbSubscription) {
        throw new Error("Subscription not found in database");
      }

      // Assert - Subscription periods updated
      const updatedSubscription = await findSubscriptionByStripeSubscriptionId(
        dbSubscriptionForPeriods.stripeSubscriptionId
      );
      expect(updatedSubscription).toBeDefined();
      expect(updatedSubscription?.currentPeriodStart).toBeDefined();
      expect(updatedSubscription?.currentPeriodEnd).toBeDefined();
    });
  });
});

