/**
 * E2E Tests: POST /api/webhooks/stripe.receive
 *
 * Tests Stripe webhook intake with REAL Stripe webhook events.
 * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to be set in environment.
 *
 * Prerequisites:
 * 1. Test database running (via npm run test:e2e:setup or local DB)
 * 2. STRIPE_SECRET_KEY environment variable set (test mode key)
 * 3. STRIPE_WEBHOOK_SECRET environment variable set (webhook signing secret)
 *
 * To run with real Stripe API:
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... npm run test:e2e -- tests/e2e/api/webhooks-stripe-receive.e2e.test.ts
 *
 * Note:
 * - These tests make real API calls to Stripe test mode (free, safe)
 * - Tests are automatically skipped if STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set or contains "mock"
 * - Stripe test mode keys start with "sk_test_" and are safe to use
 * - Webhook secrets start with "whsec_" and are required for signature verification
 */

import {
  getTestPrismaClient,
  clearTestDatabase,
} from "../helpers/test-database";
import { processStripeWebhookIntake } from "@/lib/services/webhooks/webhook-intake-service";
import { findWebhookEvent } from "@/lib/db/repositories/webhook-repository";
import { stripe } from "@/lib/stripe";

// Override the db import to use test database
jest.mock("@/lib/db", () => {
  const { getTestPrismaClient } = require("../helpers/test-database");
  return {
    db: getTestPrismaClient(),
  };
});

// Skip tests if Stripe keys are not configured
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const shouldSkipTests =
  !STRIPE_SECRET_KEY ||
  STRIPE_SECRET_KEY.includes("mock") ||
  !STRIPE_WEBHOOK_SECRET ||
  STRIPE_WEBHOOK_SECRET.includes("mock");

const describeE2E = shouldSkipTests ? describe.skip : describe;

describeE2E("E2E: POST /api/webhooks/stripe.receive - Real Stripe API", () => {
  beforeAll(async () => {
    // Initialize test database schema
    const { initializeTestDatabase } = await import("../helpers/test-database");
    await initializeTestDatabase();
  });

  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Service Layer - Real Stripe API", () => {
    test("processes webhook event successfully and enqueues it", async () => {
      // Arrange
      // Create a test customer and subscription to generate a real webhook event
      const customer = await stripe.customers.create({
        email: `test_${Date.now()}@example.com`,
        metadata: { test: "e2e" },
      });

      // Use the trial price ID from PLANS_CONFIG
      const { PLANS_CONFIG } = await import("@/lib/stripe");
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price: PLANS_CONFIG.trial.stripePriceId, // Use trial price from config
          },
        ],
        metadata: {
          test: "e2e_webhook",
        },
      });

      // Wait a moment for Stripe to process and generate events
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Retrieve the actual event that Stripe generated
      // Note: Stripe generates events automatically, we need to retrieve them
      const events = await stripe.events.list({
        type: "customer.subscription.created",
        created: {
          gte: Math.floor(Date.now() / 1000) - 10, // Last 10 seconds
        },
        limit: 1,
      });

      if (events.data.length === 0) {
        // If no event was generated, create a test event payload manually
        // This simulates what Stripe would send
        const testEvent = {
          id: `evt_test_${Date.now()}`,
          object: "event",
          type: "customer.subscription.created",
          created: Math.floor(Date.now() / 1000),
          data: {
            object: subscription,
          },
        };

        const eventBody = JSON.stringify(testEvent);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload: eventBody,
          secret: STRIPE_WEBHOOK_SECRET!,
          timestamp,
          scheme: "v1",
        });

        // Act
        const result = await processStripeWebhookIntake(eventBody, signature);

        // Assert
        expect(result.queued).toBe(true);
        expect(result.eventId).toBe(testEvent.id);

        // Assert - Event is in queue
        const queuedEvent = await findWebhookEvent(testEvent.id);
        expect(queuedEvent).toBeDefined();
        expect(queuedEvent?.eventId).toBe(testEvent.id);
        expect(queuedEvent?.eventType).toBe("customer.subscription.created");
        expect(queuedEvent?.processed).toBe(false);
      } else {
        // Use the real event from Stripe
        const testEvent = events.data[0];
        const eventBody = JSON.stringify(testEvent);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload: eventBody,
          secret: STRIPE_WEBHOOK_SECRET!,
          timestamp,
          scheme: "v1",
        });

        // Act
        const result = await processStripeWebhookIntake(eventBody, signature);

        // Assert
        expect(result.queued).toBe(true);
        expect(result.eventId).toBe(testEvent.id);

        // Assert - Event is in queue
        const queuedEvent = await findWebhookEvent(testEvent.id);
        expect(queuedEvent).toBeDefined();
        expect(queuedEvent?.eventId).toBe(testEvent.id);
        expect(queuedEvent?.eventType).toBe("customer.subscription.created");
        expect(queuedEvent?.processed).toBe(false);
      }
    });

    test("handles idempotent webhook events correctly", async () => {
      // Arrange
      const prisma = getTestPrismaClient();

      // Create a test event payload manually (simulating Stripe webhook)
      const testEvent = {
        id: `evt_test_idempotent_${Date.now()}`,
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "sub_test",
            customer: "cus_test",
            status: "active",
          },
        },
      };

      const eventBody = JSON.stringify(testEvent);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: eventBody,
        secret: STRIPE_WEBHOOK_SECRET!,
        timestamp,
        scheme: "v1",
      });

      // Act - Process same event twice
      const result1 = await processStripeWebhookIntake(eventBody, signature);
      const result2 = await processStripeWebhookIntake(eventBody, signature);

      // Assert - Both return same eventId (idempotent)
      expect(result1.queued).toBe(true);
      expect(result2.queued).toBe(true);
      expect(result1.eventId).toBe(testEvent.id);
      expect(result2.eventId).toBe(testEvent.id);

      // Assert - Only one event in queue
      const events = await prisma.webhookQueue.findMany({
        where: { eventId: testEvent.id },
      });
      expect(events.length).toBe(1);
    });

    test("rejects webhook with invalid signature", async () => {
      // Arrange
      const testEvent = {
        id: "evt_test_invalid",
        type: "customer.subscription.updated",
        data: { object: {} },
      };

      const eventBody = JSON.stringify(testEvent);
      const invalidSignature = "invalid_signature";

      // Act & Assert
      await expect(
        processStripeWebhookIntake(eventBody, invalidSignature)
      ).rejects.toThrow();
    });
  });

  describe("Data Integrity", () => {
    test("webhook event payload is stored correctly", async () => {
      // Arrange
      // Create a test event payload manually (simulating Stripe webhook)
      const testEvent = {
        id: `evt_test_payload_${Date.now()}`,
        object: "event",
        type: "invoice.payment_succeeded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            amount_paid: 1000,
          },
        },
      };

      const eventBody = JSON.stringify(testEvent);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: eventBody,
        secret: STRIPE_WEBHOOK_SECRET!,
        timestamp,
        scheme: "v1",
      });

      // Act
      await processStripeWebhookIntake(eventBody, signature);

      // Assert - Event payload is stored
      const queuedEvent = await findWebhookEvent(testEvent.id);
      expect(queuedEvent).toBeDefined();
      expect(queuedEvent?.payload).toBeDefined();
      
      // Verify payload structure
      const payload = queuedEvent?.payload as any;
      expect(payload.id).toBe(testEvent.id);
      expect(payload.type).toBe("invoice.payment_succeeded");
    });

    test("webhook event type is stored correctly", async () => {
      // Arrange
      const eventTypes = [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ];

      for (const eventType of eventTypes) {
        // Create a test event payload manually (simulating Stripe webhook)
        const testEvent = {
          id: `evt_test_${eventType}_${Date.now()}`,
          object: "event",
          type: eventType,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: `sub_test_${eventType}`,
              customer: "cus_test",
            },
          },
        };

        const eventBody = JSON.stringify(testEvent);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload: eventBody,
          secret: STRIPE_WEBHOOK_SECRET!,
          timestamp,
          scheme: "v1",
        });

        // Act
        await processStripeWebhookIntake(eventBody, signature);

        // Assert
        const queuedEvent = await findWebhookEvent(testEvent.id);
        expect(queuedEvent?.eventType).toBe(eventType);
      }
    });
  });
});

