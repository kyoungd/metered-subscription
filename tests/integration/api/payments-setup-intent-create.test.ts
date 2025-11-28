/**
 * Integration Tests: POST /api/payments/setup-intent.create
 * 
 * Tests the SetupIntent creation endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/payments/setup-intent.create/route";
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
  mockStripeSetupIntentCreate,
  mockStripeSetupIntentCreateError,
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

describe("POST /api/payments/setup-intent.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
    resetStripeMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {clientSecret}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const setupIntentId = "seti_test_789";
      const clientSecret = "seti_test_789_secret_abc123";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeSetupIntentCreate(setupIntentId, stripeCustomerId, clientSecret);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("clientSecret", clientSecret);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId: "org_123" },
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
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: {}, // Missing orgId
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
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId: "org_123" },
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
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId: "org_nonexistent" },
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
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId },
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

    test("4. stripe_api_error - Returns 502 on Stripe API failure", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeSetupIntentCreateError(new Error("Stripe API unavailable"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(502);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_API_ERROR");
    });

    test("5. creates_setup_intent_with_correct_parameters", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const setupIntentId = "seti_test_789";
      const clientSecret = "seti_test_789_secret_abc123";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeSetupIntentCreate(setupIntentId, stripeCustomerId, clientSecret);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/payments/setup-intent.create",
        method: "POST",
        body: { orgId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.clientSecret).toBe(clientSecret);
      
      // Verify SetupIntent was created with correct parameters
      const { mockStripe } = await import("../../helpers/mock-stripe");
      expect(mockStripe.setupIntents.create).toHaveBeenCalledWith({
        customer: stripeCustomerId,
        usage: "off_session",
        metadata: {
          orgId,
        },
      });
    });
  });
});

