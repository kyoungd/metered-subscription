/**
 * Integration Tests: POST /api/jobs/stripe.process
 *
 * Tests the Stripe webhook processing endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/jobs/stripe.process/route";
import { processStripeWebhook } from "@/lib/services/webhooks/webhook-processor-service";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

// Mock service
jest.mock("@/lib/services/webhooks/webhook-processor-service");

const mockProcessStripeWebhook = processStripeWebhook as jest.MockedFunction<
  typeof processStripeWebhook
>;

describe("POST /api/jobs/stripe.process", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {converged: true}, correlationId}", async () => {
      // Arrange
      const eventId = "evt_test123";

      mockProcessStripeWebhook.mockResolvedValue({
        converged: true,
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/jobs/stripe.process",
        method: "POST",
        body: { eventId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("converged", true);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. invalid_payload - Returns 400 for missing eventId", async () => {
      // Arrange
      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/jobs/stripe.process",
        method: "POST",
        body: {}, // Missing eventId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("3. invalid_json - Returns error for malformed JSON", async () => {
      // Arrange
      // Create a request with invalid JSON
      const invalidRequest = new Request("http://localhost:3000/api/jobs/stripe.process", {
        method: "POST",
        headers: {
          "x-request-id": "test-request-id-123",
          "x-correlation-id": "test-correlation-id-456",
          "content-type": "application/json",
        },
        body: "invalid json{",
      });

      // Act
      const response = await POST(invalidRequest as any);
      const body = await extractJsonBody(response);

      // Assert - Should return an error (400 or 500 depending on how Next.js handles it)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(body).toHaveProperty("error");
    });
  });

  describe("Situational Tests", () => {
    test("1. event_not_found - Returns 404 when webhook event doesn't exist", async () => {
      // Arrange
      const eventId = "evt_nonexistent";
      const { ApplicationError } = await import("@/lib/utils/errors");

      mockProcessStripeWebhook.mockRejectedValue(
        new ApplicationError("Webhook event not found", "WEBHOOK_EVENT_NOT_FOUND", 404)
      );

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/jobs/stripe.process",
        method: "POST",
        body: { eventId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
    });

    test("2. processing_error - Returns 500 on processing failure", async () => {
      // Arrange
      const eventId = "evt_test123";

      mockProcessStripeWebhook.mockRejectedValue(
        new Error("Database error")
      );

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/jobs/stripe.process",
        method: "POST",
        body: { eventId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
    });

    test("3. calls_service_with_correct_parameters", async () => {
      // Arrange
      const eventId = "evt_test123";

      mockProcessStripeWebhook.mockResolvedValue({
        converged: true,
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/jobs/stripe.process",
        method: "POST",
        body: { eventId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.converged).toBe(true);
      expect(mockProcessStripeWebhook).toHaveBeenCalledWith(eventId);
    });
  });
});

