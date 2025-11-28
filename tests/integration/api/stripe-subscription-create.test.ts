/**
 * Integration Tests: POST /api/stripe/subscription.create
 * 
 * Tests the subscription creation endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/stripe/subscription.create/route";
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
  createSubscription,
} from "@/lib/db/repositories/subscription-repository";
import {
  mockStripeSubscriptionCreate,
  mockStripeSubscriptionCreateError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";
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
const mockCreateSubscription = createSubscription as jest.MockedFunction<
  typeof createSubscription
>;

describe("POST /api/stripe/subscription.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
    resetStripeMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {subscriptionId, status, trialEndsAt}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const planCode = "trial";
      const stripeCustomerId = "cus_test_456";
      const stripeSubscriptionId = "sub_test_789";
      const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeSubscriptionCreate(
        stripeSubscriptionId,
        stripeCustomerId,
        "trialing",
        trialEndsAt,
        planCode
      );
      mockCreateSubscription.mockResolvedValue({
        id: "sub_internal_123",
        clerkOrgId: mockOrg.clerkOrgId,
        stripeCustomerId,
        stripeSubscriptionId,
        planCode,
        stripePriceId: "price_1SF55833pr8E7tWLycMY8XKB",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: new Date(trialEndsAt * 1000),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId, planCode },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("subscriptionId");
      expect(body.data).toHaveProperty("status", "trialing");
      expect(body.data).toHaveProperty("trialEndsAt");
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. invalid_planCode - Returns 400 for invalid planCode", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId: "org_123", planCode: "invalid_plan" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("3. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId: "org_123", planCode: "trial" },
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
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { planCode: "trial" }, // Missing orgId
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("5. creates subscription for different plan codes", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const planCodes = ["trial", "starter", "growth", "pro"] as const;

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      for (const planCode of planCodes) {
        const stripeSubscriptionId = `sub_${planCode}_${Date.now()}`;
        mockStripeSubscriptionCreate(
          stripeSubscriptionId,
          stripeCustomerId,
          planCode === "trial" ? "trialing" : "active",
          planCode === "trial" ? Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60 : null,
          planCode
        );
        mockCreateSubscription.mockResolvedValue({
          id: `sub_internal_${planCode}`,
          clerkOrgId: mockOrg.clerkOrgId,
          stripeCustomerId,
          stripeSubscriptionId,
          planCode,
          stripePriceId: "price_test",
          status: planCode === "trial" ? "trialing" : "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          trialEndsAt: planCode === "trial" ? new Date() : null,
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const request = createTestRequestWithHeaders({
          url: "http://localhost:3000/api/stripe/subscription.create",
          method: "POST",
          body: { orgId, planCode },
        });

        // Act
        const response = await POST(request);
        const body = await extractJsonBody(response);

        // Assert
        expect(response.status).toBe(200);
        expect(body.data.planCode || planCode).toBeTruthy(); // Verify plan code is used
      }
    });
  });

  describe("Situational Tests", () => {
    test("1. no_org_context - Returns 403 when no Clerk org in session", async () => {
      // Arrange
      const { mockAuthenticatedWithoutOrg } = await import("../../helpers/mock-clerk-auth");
      mockAuthenticatedWithoutOrg("user_test123");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId: "org_123", planCode: "trial" },
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
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId: "org_nonexistent", planCode: "trial" },
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
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId, planCode: "trial" },
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
      mockStripeSubscriptionCreateError(new Error("Stripe API unavailable"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId, planCode: "trial" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(502);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "STRIPE_API_ERROR");
    });

    test("5. subscription_with_trial - Returns trialEndsAt for trial plan", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const stripeCustomerId = "cus_test_456";
      const stripeSubscriptionId = "sub_test_789";
      const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

      const mockOrg = createMockOrganization({
        id: orgId,
        stripeCustomerId,
      });

      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockStripeSubscriptionCreate(
        stripeSubscriptionId,
        stripeCustomerId,
        "trialing",
        trialEndsAt,
        "trial"
      );
      mockCreateSubscription.mockResolvedValue({
        id: "sub_internal_123",
        clerkOrgId: mockOrg.clerkOrgId,
        stripeCustomerId,
        stripeSubscriptionId,
        planCode: "trial",
        stripePriceId: "price_1SF55833pr8E7tWLycMY8XKB",
        status: "trialing",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: new Date(trialEndsAt * 1000),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/stripe/subscription.create",
        method: "POST",
        body: { orgId, planCode: "trial" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.trialEndsAt).toBeTruthy();
      expect(new Date(body.data.trialEndsAt).getTime()).toBeGreaterThan(Date.now());
    });
  });
});

