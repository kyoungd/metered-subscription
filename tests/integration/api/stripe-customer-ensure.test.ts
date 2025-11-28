/**
 * Integration Tests: POST /api/stripe/customer.ensure
 * 
 * Tests the Stripe customer ensure endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/stripe/customer.ensure/route";
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
  updateOrganizationStripeCustomerId,
} from "@/lib/db/repositories/org-repository";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockUpdateOrganizationStripeCustomerId = updateOrganizationStripeCustomerId as jest.MockedFunction<
  typeof updateOrganizationStripeCustomerId
>;
import {
  mockStripeCustomerList,
  mockStripeCustomerListEmpty,
  mockStripeCustomerCreate,
  mockStripeCustomerListError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";
import {
  createTestRequest,
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

describe("POST /api/stripe/customer.ensure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
    resetStripeMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {stripeCustomerId}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const stripeCustomerId = "cus_test_456";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeCustomerListEmpty();
      mockStripeCustomerCreate(stripeCustomerId, email, { orgId });
      mockUpdateOrganizationStripeCustomerId.mockResolvedValue({
        ...mockOrg,
        stripeCustomerId,
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId, email },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("stripeCustomerId", stripeCustomerId);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. idempotency - Returns existing stripeCustomerId from DB", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const existingStripeCustomerId = "cus_existing_789";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: existingStripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId, email },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.stripeCustomerId).toBe(existingStripeCustomerId);
      // Should not call Stripe API
    });

    test("3. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId: "org_123", email: "test@example.com" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    });

    test("4. invalid_payload - Returns 400 for missing orgId", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { email: "test@example.com" }, // Missing orgId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("5. invalid_payload - Returns 400 for invalid email", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId: "org_123", email: "invalid-email" },
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
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId: "org_123", email: "test@example.com" },
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
      mockFindOrganizationById.mockResolvedValue(null); // Org not found

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId: "org_nonexistent", email: "test@example.com" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "ORG_NOT_FOUND");
    });

    test("3. stripe_search_found - Uses existing Stripe customer when found", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const existingStripeCustomerId = "cus_stripe_existing_999";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeCustomerList(existingStripeCustomerId, email);
      mockUpdateOrganizationStripeCustomerId.mockResolvedValue({
        ...mockOrg,
        stripeCustomerId: existingStripeCustomerId,
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId, email },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.stripeCustomerId).toBe(existingStripeCustomerId);
      // Should not create new customer
    });

    test("4. stripe_api_error - Returns 502 on Stripe API failure", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeCustomerListError(new Error("Stripe API unavailable"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId, email },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(502);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_API_ERROR");
    });

    test("5. stripe_create_error - Returns 500 on customer creation failure", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeCustomerListEmpty();
      const { mockStripeCustomerCreateError } = await import("../../helpers/mock-stripe");
      mockStripeCustomerCreateError(new Error("Stripe creation failed"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/customer.ensure",
        method: "POST",
        body: { orgId, email },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_CUSTOMER_CREATION_ERROR");
    });
  });
});

