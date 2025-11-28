/**
 * Integration Tests: POST /api/payments/default-method.set
 * 
 * Tests the default payment method setting endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/payments/default-method.set/route";
import {
  mockAuthenticatedWithOrg,
  mockUnauthenticated,
  resetClerkAuthMock,
} from "../../helpers/mock-clerk-auth";
import {
  createMockOrganization,
  resetDbMocks,
} from "../../helpers/mock-db";
import {
  findOrganizationById,
} from "@/lib/db/repositories/org-repository";
import {
  mockStripePaymentMethodAttach,
  mockStripePaymentMethodAttachError,
  mockStripeCustomerUpdate,
  mockStripeCustomerUpdateError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;

describe("POST /api/payments/default-method.set", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
    resetStripeMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {ok: true}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const paymentMethodId = "pm_test_789";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripePaymentMethodAttach(paymentMethodId, stripeCustomerId);
      mockStripeCustomerUpdate(stripeCustomerId, paymentMethodId);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId, paymentMethodId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("ok", true);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId: "org_123", paymentMethodId: "pm_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    });

    test("3. invalid_payload - Returns 400 for missing orgId", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { paymentMethodId: "pm_123" }, // Missing orgId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("4. invalid_payload - Returns 400 for missing paymentMethodId", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId: "org_123" }, // Missing paymentMethodId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });
  });

  describe("Situational Tests", () => {
    test("1. no_org_context - Returns 403 when no Clerk org in session", async () => {
      // Arrange
      const { mockAuthenticatedWithoutOrg } = await import("../../helpers/mock-clerk-auth");
      mockAuthenticatedWithoutOrg("user_test123");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId: "org_123", paymentMethodId: "pm_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(403);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "FORBIDDEN");
    });

    test("2. org_not_found - Returns 404 when organization doesn't exist", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(null);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId: "org_nonexistent", paymentMethodId: "pm_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "ORG_NOT_FOUND");
    });

    test("3. no_stripe_customer - Returns 400 when org has no stripeCustomerId", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null, // No Stripe customer
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId, paymentMethodId: "pm_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(body.error.message).toContain("does not have a Stripe customer ID");
    });

    test("4. stripe_attach_error - Returns 502 on payment method attach failure", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const paymentMethodId = "pm_test_789";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripePaymentMethodAttachError(new Error("Payment method attach failed"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId, paymentMethodId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(502);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_API_ERROR");
    });

    test("5. stripe_update_error - Returns 502 on customer update failure", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const paymentMethodId = "pm_test_789";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripePaymentMethodAttach(paymentMethodId, stripeCustomerId);
      mockStripeCustomerUpdateError(new Error("Customer update failed"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId, paymentMethodId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(502);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_API_ERROR");
    });

    test("6. calls_stripe_with_correct_parameters", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const paymentMethodId = "pm_test_789";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripePaymentMethodAttach(paymentMethodId, stripeCustomerId);
      mockStripeCustomerUpdate(stripeCustomerId, paymentMethodId);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/default-method.set",
        method: "POST",
        body: { orgId, paymentMethodId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.ok).toBe(true);
      
      // Verify Stripe calls were made with correct parameters
      const { mockStripe } = await import("../../helpers/mock-stripe");
      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith(
        paymentMethodId,
        {
          customer: stripeCustomerId,
        }
      );
      expect(mockStripe.customers.update).toHaveBeenCalledWith(
        stripeCustomerId,
        {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        }
      );
    });
  });
});

