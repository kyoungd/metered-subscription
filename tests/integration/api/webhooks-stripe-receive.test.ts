/**
 * Integration Tests: POST /api/webhooks/stripe.receive
 * 
 * Tests the Stripe webhook intake endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/webhooks/stripe.receive/route";
import {
  processStripeWebhookIntake,
} from "@/lib/services/webhooks/webhook-intake-service";
import {
  upsertWebhookEvent,
  findWebhookEvent,
} from "@/lib/db/repositories/webhook-repository";
import {
  verifyStripeWebhookSignature,
} from "@/lib/utils/webhooks/stripe-webhook-verification";
import {
  mockStripeWebhookConstructEvent,
  resetStripeMocks,
} from "../../helpers/mock-stripe";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";
import { headers } from "next/headers";

// Mock dependencies
jest.mock("@/lib/services/webhooks/webhook-intake-service");
jest.mock("@/lib/db/repositories/webhook-repository");
jest.mock("@/lib/utils/webhooks/stripe-webhook-verification");
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

const mockProcessStripeWebhookIntake = processStripeWebhookIntake as jest.MockedFunction<
  typeof processStripeWebhookIntake
>;
const mockHeaders = headers as jest.MockedFunction<typeof headers>;

describe("POST /api/webhooks/stripe.receive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks();
    
    // Mock Next.js headers() to return headers from request
    mockHeaders.mockImplementation(async () => {
      return new Headers() as any;
    });
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 202 with {data: {queued: true, eventId}, correlationId}", async () => {
      // Arrange
      const eventId = "evt_test123";
      const eventBody = JSON.stringify({
        id: eventId,
        type: "customer.subscription.updated",
        data: { object: {} },
      });
      const signature = "t=1234567890,v1=test_signature";

      mockProcessStripeWebhookIntake.mockResolvedValue({
        queued: true,
        eventId,
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        rawBody: eventBody, // Use rawBody for webhooks
        headers: {
          "stripe-signature": signature,
        },
      });

      mockHeaders.mockResolvedValue(
        new Headers({ "stripe-signature": signature }) as any
      );

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(202);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("queued", true);
      expect(body.data).toHaveProperty("eventId", eventId);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. missing_body - Returns 400 for empty request body", async () => {
      // Arrange
      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        rawBody: "", // Empty body
        headers: {
          "stripe-signature": "t=1234567890,v1=test_signature",
        },
      });

      mockHeaders.mockResolvedValue(
        new Headers({ "stripe-signature": "t=1234567890,v1=test_signature" }) as any
      );

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("3. missing_signature - Returns 400 for missing stripe-signature header", async () => {
      // Arrange
      const eventBody = JSON.stringify({
        id: "evt_test123",
        type: "customer.subscription.updated",
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        rawBody: eventBody, // Use rawBody for webhooks
        // No stripe-signature header
      });

      // Mock headers() to return headers without stripe-signature
      mockHeaders.mockResolvedValue(new Headers() as any);

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(body.error.message).toContain("stripe-signature");
    });
  });

  describe("Situational Tests", () => {
    test("1. invalid_signature - Returns 401 for invalid webhook signature", async () => {
      // Arrange
      const eventBody = JSON.stringify({
        id: "evt_test123",
        type: "customer.subscription.updated",
      });
      const signature = "invalid_signature";

      mockProcessStripeWebhookIntake.mockRejectedValue(
        new Error("Invalid Stripe webhook signature")
      );

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        rawBody: eventBody, // Use rawBody for webhooks
        headers: {
          "stripe-signature": signature,
        },
      });

      mockHeaders.mockResolvedValue(
        new Headers({ "stripe-signature": signature }) as any
      );

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    });

    test("2. idempotent_request - Returns 202 for duplicate event (same eventId)", async () => {
      // Arrange
      const eventId = "evt_duplicate123";
      const eventBody = JSON.stringify({
        id: eventId,
        type: "customer.subscription.updated",
      });
      const signature = "t=1234567890,v1=test_signature";

      // First call - new event
      mockProcessStripeWebhookIntake.mockResolvedValueOnce({
        queued: true,
        eventId,
      });

      // Second call - duplicate event (idempotent)
      mockProcessStripeWebhookIntake.mockResolvedValueOnce({
        queued: true,
        eventId,
      });

      const request1 = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        body: eventBody,
        headers: {
          "stripe-signature": signature,
        },
      });

      const request2 = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        body: eventBody,
        headers: {
          "stripe-signature": signature,
        },
      });

      // Act
      const response1 = await POST(request1);
      const response2 = await POST(request2);
      const body1 = await extractJsonBody(response1);
      const body2 = await extractJsonBody(response2);

      // Assert - Both return 202 with same eventId
      expect(response1.status).toBe(202);
      expect(response2.status).toBe(202);
      expect(body1.data.eventId).toBe(eventId);
      expect(body2.data.eventId).toBe(eventId);
    });

    test("3. different_event_types - Handles various Stripe event types", async () => {
      // Arrange
      const eventTypes = [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
      ];

      for (const eventType of eventTypes) {
        jest.clearAllMocks();
        
        const eventId = `evt_${eventType}`;
        const eventBody = JSON.stringify({
          id: eventId,
          type: eventType,
        });
        const signature = "t=1234567890,v1=test_signature";

        mockProcessStripeWebhookIntake.mockResolvedValue({
          queued: true,
          eventId,
        });

        const request = createTestRequestWithHeaders({
          url: "http://localhost:3000/api/webhooks/stripe.receive",
          method: "POST",
          rawBody: eventBody, // Use rawBody for webhooks
          headers: {
            "stripe-signature": signature,
          },
        });

        mockHeaders.mockResolvedValue(
          new Headers({ "stripe-signature": signature }) as any
        );

        // Act
        const response = await POST(request);
        const body = await extractJsonBody(response);

        // Assert
        expect(response.status).toBe(202);
        expect(body.data.eventId).toBe(eventId);
      }
    });

    test("4. service_error - Returns 500 on service layer error", async () => {
      // Arrange
      const eventBody = JSON.stringify({
        id: "evt_test123",
        type: "customer.subscription.updated",
      });
      const signature = "t=1234567890,v1=test_signature";

      mockProcessStripeWebhookIntake.mockRejectedValue(
        new Error("Database error")
      );

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/webhooks/stripe.receive",
        method: "POST",
        rawBody: eventBody, // Use rawBody for webhooks
        headers: {
          "stripe-signature": signature,
        },
      });

      mockHeaders.mockResolvedValue(
        new Headers({ "stripe-signature": signature }) as any
      );

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
    });
  });
});

