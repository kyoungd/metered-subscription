/**
 * Unit Tests: Webhook Processor Service
 *
 * Tests business logic for webhook processing operations
 */

import { processStripeWebhook } from "@/lib/services/webhooks/webhook-processor-service";
import {
  findWebhookEvent,
  markWebhookProcessed,
} from "@/lib/db/repositories/webhook-repository";
import {
  findSubscriptionByStripeSubscriptionId,
  updateSubscriptionFromStripe,
} from "@/lib/db/repositories/subscription-repository";
import { ApplicationError } from "@/lib/utils/errors";

// Mock dependencies
jest.mock("@/lib/db/repositories/webhook-repository");
jest.mock("@/lib/db/repositories/subscription-repository");

const mockFindWebhookEvent = findWebhookEvent as jest.MockedFunction<
  typeof findWebhookEvent
>;
const mockMarkWebhookProcessed = markWebhookProcessed as jest.MockedFunction<
  typeof markWebhookProcessed
>;
const mockFindSubscriptionByStripeSubscriptionId =
  findSubscriptionByStripeSubscriptionId as jest.MockedFunction<
    typeof findSubscriptionByStripeSubscriptionId
  >;
const mockUpdateSubscriptionFromStripe =
  updateSubscriptionFromStripe as jest.MockedFunction<
    typeof updateSubscriptionFromStripe
  >;

describe("Webhook Processor Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processStripeWebhook", () => {
    const eventId = "evt_test123";
    const stripeSubscriptionId = "sub_test123";

    test("processes subscription.updated event successfully", async () => {
      // Arrange
      const webhookEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType: "customer.subscription.updated",
        processed: false,
        payload: {
          id: eventId,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: stripeSubscriptionId,
              status: "active",
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
              trial_end: null,
            },
          },
        },
        createdAt: new Date(),
        processedAt: null,
      };

      const dbSubscription = {
        id: "sub_internal_123",
        clerkOrgId: "org_test456",
        stripeCustomerId: "cus_test789",
        stripeSubscriptionId,
        planCode: "trial",
        stripePriceId: "price_test123",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: null,
        organizationId: "org_internal_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindWebhookEvent.mockResolvedValue(webhookEvent);
      mockFindSubscriptionByStripeSubscriptionId.mockResolvedValue(dbSubscription);
      mockUpdateSubscriptionFromStripe.mockResolvedValue({
        ...dbSubscription,
        status: "active",
      });
      mockMarkWebhookProcessed.mockResolvedValue({
        ...webhookEvent,
        processed: true,
        processedAt: new Date(),
      });

      // Act
      const result = await processStripeWebhook(eventId);

      // Assert
      expect(result.converged).toBe(true);
      expect(mockFindWebhookEvent).toHaveBeenCalledWith(eventId);
      expect(mockFindSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith(
        stripeSubscriptionId
      );
      expect(mockUpdateSubscriptionFromStripe).toHaveBeenCalled();
      expect(mockMarkWebhookProcessed).toHaveBeenCalledWith(eventId);
    });

    test("returns idempotent response for already processed event", async () => {
      // Arrange
      const webhookEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType: "customer.subscription.updated",
        processed: true, // Already processed
        payload: {},
        createdAt: new Date(),
        processedAt: new Date(),
      };

      mockFindWebhookEvent.mockResolvedValue(webhookEvent);

      // Act
      const result = await processStripeWebhook(eventId);

      // Assert
      expect(result.converged).toBe(true);
      expect(mockFindWebhookEvent).toHaveBeenCalledWith(eventId);
      expect(mockMarkWebhookProcessed).not.toHaveBeenCalled();
    });

    test("throws ApplicationError if webhook event not found", async () => {
      // Arrange
      mockFindWebhookEvent.mockResolvedValue(null);

      // Act & Assert
      await expect(processStripeWebhook(eventId)).rejects.toThrow(
        ApplicationError
      );
      await expect(processStripeWebhook(eventId)).rejects.toThrow(
        "Webhook event not found"
      );
    });

    test("handles subscription.deleted event", async () => {
      // Arrange
      const webhookEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType: "customer.subscription.deleted",
        processed: false,
        payload: {
          id: eventId,
          type: "customer.subscription.deleted",
          data: {
            object: {
              id: stripeSubscriptionId,
              status: "canceled",
            },
          },
        },
        createdAt: new Date(),
        processedAt: null,
      };

      const dbSubscription = {
        id: "sub_internal_123",
        clerkOrgId: "org_test456",
        stripeCustomerId: "cus_test789",
        stripeSubscriptionId,
        planCode: "trial",
        stripePriceId: "price_test123",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: null,
        organizationId: "org_internal_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindWebhookEvent.mockResolvedValue(webhookEvent);
      mockFindSubscriptionByStripeSubscriptionId.mockResolvedValue(dbSubscription);
      mockUpdateSubscriptionFromStripe.mockResolvedValue({
        ...dbSubscription,
        status: "canceled",
      });
      mockMarkWebhookProcessed.mockResolvedValue({
        ...webhookEvent,
        processed: true,
        processedAt: new Date(),
      });

      // Act
      const result = await processStripeWebhook(eventId);

      // Assert
      expect(result.converged).toBe(true);
      expect(mockUpdateSubscriptionFromStripe).toHaveBeenCalledWith(
        stripeSubscriptionId,
        expect.objectContaining({
          status: "canceled",
        })
      );
    });

    test("handles unhandled event types gracefully", async () => {
      // Arrange
      const webhookEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType: "charge.succeeded", // Unhandled event type
        processed: false,
        payload: {
          id: eventId,
          type: "charge.succeeded",
        },
        createdAt: new Date(),
        processedAt: null,
      };

      mockFindWebhookEvent.mockResolvedValue(webhookEvent);
      mockMarkWebhookProcessed.mockResolvedValue({
        ...webhookEvent,
        processed: true,
        processedAt: new Date(),
      });

      // Act
      const result = await processStripeWebhook(eventId);

      // Assert
      expect(result.converged).toBe(true);
      expect(mockMarkWebhookProcessed).toHaveBeenCalledWith(eventId);
    });

    test("does not mark as processed if handler fails", async () => {
      // Arrange
      const webhookEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType: "customer.subscription.updated",
        processed: false,
        payload: {
          id: eventId,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: stripeSubscriptionId,
              status: "active",
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          },
        },
        createdAt: new Date(),
        processedAt: null,
      };

      const dbSubscription = {
        id: "sub_internal_123",
        clerkOrgId: "org_test456",
        stripeCustomerId: "cus_test789",
        stripeSubscriptionId,
        planCode: "trial",
        stripePriceId: "price_test123",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: null,
        organizationId: "org_internal_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindWebhookEvent.mockResolvedValue(webhookEvent);
      mockFindSubscriptionByStripeSubscriptionId.mockResolvedValue(dbSubscription);
      mockUpdateSubscriptionFromStripe.mockRejectedValue(
        new Error("Update failed")
      );

      // Act & Assert
      await expect(processStripeWebhook(eventId)).rejects.toThrow();
      expect(mockMarkWebhookProcessed).not.toHaveBeenCalled();
    });
  });
});

