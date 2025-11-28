/**
 * Unit Tests: Webhook Intake Service
 * 
 * Tests business logic for webhook intake operations
 */

import { processStripeWebhookIntake } from "@/lib/services/webhooks/webhook-intake-service";
import {
  upsertWebhookEvent,
  findWebhookEvent,
} from "@/lib/db/repositories/webhook-repository";
import { verifyStripeWebhookSignature } from "@/lib/utils/webhooks/stripe-webhook-verification";
import { UnauthorizedError } from "@/lib/utils/errors";
import {
  mockStripeWebhookConstructEvent,
  mockStripeWebhookConstructEventError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";

// Mock dependencies
jest.mock("@/lib/db/repositories/webhook-repository");
jest.mock("@/lib/utils/webhooks/stripe-webhook-verification");

const mockUpsertWebhookEvent = upsertWebhookEvent as jest.MockedFunction<
  typeof upsertWebhookEvent
>;
const mockFindWebhookEvent = findWebhookEvent as jest.MockedFunction<
  typeof findWebhookEvent
>;
const mockVerifyStripeWebhookSignature = verifyStripeWebhookSignature as jest.MockedFunction<
  typeof verifyStripeWebhookSignature
>;

describe("Webhook Intake Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks();
  });

  describe("processStripeWebhookIntake", () => {
    const body = JSON.stringify({ test: "data" });
    const signature = "t=1234567890,v1=test_signature";
    const eventId = "evt_test123";
    const eventType = "customer.subscription.updated";

    test("processes new webhook event successfully", async () => {
      // Arrange
      const mockEvent = {
        id: eventId,
        object: "event",
        type: eventType,
        data: {
          object: {},
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockVerifyStripeWebhookSignature.mockReturnValue(mockEvent as any);
      mockFindWebhookEvent.mockResolvedValue(null); // Event doesn't exist
      mockUpsertWebhookEvent.mockResolvedValue({
        id: "webhook_queue_id",
        eventId,
        eventType,
        processed: false,
        payload: mockEvent,
        createdAt: new Date(),
        processedAt: null,
      });

      // Act
      const result = await processStripeWebhookIntake(body, signature);

      // Assert
      expect(result.queued).toBe(true);
      expect(result.eventId).toBe(eventId);
      expect(mockVerifyStripeWebhookSignature).toHaveBeenCalledWith(body, signature);
      expect(mockFindWebhookEvent).toHaveBeenCalledWith(eventId);
      expect(mockUpsertWebhookEvent).toHaveBeenCalledWith({
        eventId,
        eventType,
        payload: mockEvent,
      });
    });

    test("returns idempotent response for existing event", async () => {
      // Arrange
      const mockEvent = {
        id: eventId,
        object: "event",
        type: eventType,
        data: {
          object: {},
        },
        created: Math.floor(Date.now() / 1000),
      };

      const existingEvent = {
        id: "webhook_queue_id",
        eventId,
        eventType,
        processed: false,
        payload: mockEvent,
        createdAt: new Date(),
        processedAt: null,
      };

      mockVerifyStripeWebhookSignature.mockReturnValue(mockEvent as any);
      mockFindWebhookEvent.mockResolvedValue(existingEvent); // Event already exists

      // Act
      const result = await processStripeWebhookIntake(body, signature);

      // Assert
      expect(result.queued).toBe(true);
      expect(result.eventId).toBe(eventId);
      expect(mockVerifyStripeWebhookSignature).toHaveBeenCalledWith(body, signature);
      expect(mockFindWebhookEvent).toHaveBeenCalledWith(eventId);
      expect(mockUpsertWebhookEvent).not.toHaveBeenCalled(); // Should not upsert if exists
    });

    test("throws UnauthorizedError if signature verification fails", async () => {
      // Arrange
      const verificationError = new UnauthorizedError("Invalid signature");
      mockVerifyStripeWebhookSignature.mockImplementation(() => {
        throw verificationError;
      });

      // Act & Assert
      await expect(processStripeWebhookIntake(body, signature)).rejects.toThrow(
        UnauthorizedError
      );
      expect(mockFindWebhookEvent).not.toHaveBeenCalled();
      expect(mockUpsertWebhookEvent).not.toHaveBeenCalled();
    });

    test("handles different event types correctly", async () => {
      // Arrange
      const eventTypes = [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
      ];

      for (const type of eventTypes) {
        jest.clearAllMocks();
        
        const mockEvent = {
          id: `evt_${type}`,
          object: "event",
          type,
          data: {
            object: {},
          },
          created: Math.floor(Date.now() / 1000),
        };

        mockVerifyStripeWebhookSignature.mockReturnValue(mockEvent as any);
        mockFindWebhookEvent.mockResolvedValue(null);
        mockUpsertWebhookEvent.mockResolvedValue({
          id: "webhook_queue_id",
          eventId: mockEvent.id,
          eventType: type,
          processed: false,
          payload: mockEvent,
          createdAt: new Date(),
          processedAt: null,
        });

        // Act
        const result = await processStripeWebhookIntake(body, signature);

        // Assert
        expect(result.eventId).toBe(mockEvent.id);
        expect(mockUpsertWebhookEvent).toHaveBeenCalledWith({
          eventId: mockEvent.id,
          eventType: type,
          payload: mockEvent,
        });
      }
    });
  });
});

