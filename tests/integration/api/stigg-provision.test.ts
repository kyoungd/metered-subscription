/**
 * Integration Tests: POST /api/stigg/provision
 * 
 * Tests the Stigg provision endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/stigg/provision/route";
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
  findSubscriptionById,
} from "@/lib/db/repositories/subscription-repository";
import {
  mockStiggProvisionSubscriptionSuccess,
  mockStiggProvisionSubscriptionError,
  resetStiggMocks,
} from "../../helpers/mock-stigg";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockFindSubscriptionById = findSubscriptionById as jest.MockedFunction<
  typeof findSubscriptionById
>;

describe("POST /api/stigg/provision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
    resetStiggMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {provisioned: true}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const subscriptionId = "sub_internal_456";
      const stripeCustomerId = "cus_test_789";
      const stripeSubscriptionId = "sub_stripe_123";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      const mockSub = {
        id: subscriptionId,
        clerkOrgId: mockOrg.clerkOrgId,
        stripeCustomerId,
        stripeSubscriptionId,
        planCode: "trial",
        stripePriceId: "price_test",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: new Date(),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);
      mockStiggProvisionSubscriptionSuccess();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId, subscriptionId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("provisioned", true);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId: "org_123", subscriptionId: "sub_123" },
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
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { subscriptionId: "sub_123" }, // Missing orgId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("4. invalid_payload - Returns 400 for missing subscriptionId", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId: "org_123" }, // Missing subscriptionId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("5. always_returns_200_even_if_stigg_fails - Soft dependency", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const subscriptionId = "sub_internal_456";
      const stripeCustomerId = "cus_test_789";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      const mockSub = {
        id: subscriptionId,
        clerkOrgId: mockOrg.clerkOrgId,
        stripeCustomerId,
        stripeSubscriptionId: "sub_stripe_123",
        planCode: "trial",
        stripePriceId: "price_test",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: new Date(),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);
      mockStiggProvisionSubscriptionError(new Error("Stigg API unavailable"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId, subscriptionId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert - Should still return 200 (soft dependency)
      expect(response.status).toBe(200);
      expect(body.data.provisioned).toBe(false);
    });
  });

  describe("Situational Tests", () => {
    test("1. no_org_context - Returns 403 when no Clerk org in session", async () => {
      // Arrange
      const { mockAuthenticatedWithoutOrg } = await import("../../helpers/mock-clerk-auth");
      mockAuthenticatedWithoutOrg("user_test123");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId: "org_123", subscriptionId: "sub_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(403);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "FORBIDDEN");
    });

    test("2. org_not_found - Returns 200 with provisioned: false", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(null);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId: "org_nonexistent", subscriptionId: "sub_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert - Soft dependency, always returns 200
      expect(response.status).toBe(200);
      expect(body.data.provisioned).toBe(false);
    });

    test("3. subscription_not_found - Returns 200 with provisioned: false", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: "cus_test_789",
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(null);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId, subscriptionId: "sub_nonexistent" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert - Soft dependency, always returns 200
      expect(response.status).toBe(200);
      expect(body.data.provisioned).toBe(false);
    });

    test("4. no_stripe_customer - Returns 200 with provisioned: false", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const subscriptionId = "sub_internal_456";

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId: null, // No Stripe customer
      });

      const mockSub = {
        id: subscriptionId,
        clerkOrgId: mockOrg.clerkOrgId,
        stripeCustomerId: null,
        stripeSubscriptionId: "sub_stripe_123",
        planCode: "trial",
        stripePriceId: "price_test",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: new Date(),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stigg/provision",
        method: "POST",
        body: { orgId, subscriptionId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert - Soft dependency, always returns 200
      expect(response.status).toBe(200);
      expect(body.data.provisioned).toBe(false);
    });

    test("5. provisions_subscription_for_different_plan_codes", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_789";
      const planCodes = ["trial", "starter", "growth", "pro"] as const;

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStiggProvisionSubscriptionSuccess();

      for (const planCode of planCodes) {
        const subscriptionId = `sub_${planCode}_${Date.now()}`;
        const mockSub = {
          id: subscriptionId,
          clerkOrgId: mockOrg.clerkOrgId,
          stripeCustomerId,
          stripeSubscriptionId: `sub_stripe_${planCode}`,
          planCode,
          stripePriceId: "price_test",
          status: planCode === "trial" ? "trialing" : "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          trialEndsAt: planCode === "trial" ? new Date() : null,
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockFindSubscriptionById.mockResolvedValue(mockSub);

        const request = createTestRequestWithHeaders({
          url: "http://localhost:3000/api/stigg/provision",
          method: "POST",
          body: { orgId, subscriptionId },
        });

        // Act
        const response = await POST(request);
        const body = await extractJsonBody(response);

        // Assert
        expect(response.status).toBe(200);
        expect(body.data.provisioned).toBe(true);
      }
    });
  });
});

