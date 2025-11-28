/**
 * Integration Tests: POST /api/usage/seed
 * 
 * Tests the usage seed endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/usage/seed/route";
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
  findActiveSubscriptionByOrganizationId,
} from "@/lib/db/repositories/subscription-repository";
import {
  findOrganizationById,
} from "@/lib/db/repositories/org-repository";
import {
  upsertUsageCounter,
} from "@/lib/db/repositories/usage-repository";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

// Mock repository
jest.mock("@/lib/db/repositories/subscription-repository");
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/usage-repository", () => ({
  ...jest.requireActual("@/lib/db/repositories/usage-repository"),
  upsertUsageCounter: jest.fn(),
}));

const mockFindActiveSubscriptionByOrganizationId = findActiveSubscriptionByOrganizationId as jest.MockedFunction<
  typeof findActiveSubscriptionByOrganizationId
>;
const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockUpsertUsageCounter = upsertUsageCounter as jest.MockedFunction<
  typeof upsertUsageCounter
>;

describe("POST /api/usage/seed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetClerkAuthMock();
    resetDbMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {periodKey, remaining}, correlationId}", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const clerkOrgId = "org_test456";
      const subscriptionId = "sub_internal_789";
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const mockOrg = createMockOrganization({
        id: orgId,
        clerkOrgId,
      });

      const mockSubscription = {
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "trial",
        stripePriceId: "price_1SF55833pr8E7tWLycMY8XKB",
        status: "trialing",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: new Date(),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: "counter_123",
        clerkOrgId,
        periodKey,
        periodStart,
        periodEnd,
        metric: "api_call",
        included: 30,
        used: 0,
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", clerkOrgId);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockUpsertUsageCounter.mockResolvedValue(mockCounter);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
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
      expect(body.data).toHaveProperty("periodKey", periodKey);
      expect(body.data).toHaveProperty("remaining", 30);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
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
        url: "http://localhost:3000/api/usage/seed",
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

    test("4. seeds_counter_for_different_plan_codes", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const clerkOrgId = "org_test456";
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const planCodes = [
        { code: "trial", included: 30 },
        { code: "starter", included: 60 },
        { code: "growth", included: 300 },
        { code: "pro", included: 1500 },
      ] as const;

      const mockOrg = createMockOrganization({
        id: orgId,
        clerkOrgId,
      });

      mockAuthenticatedWithOrg("user_test123", clerkOrgId);
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      for (const { code, included } of planCodes) {
        const subscriptionId = `sub_${code}_${Date.now()}`;
        const mockSubscription = {
          id: subscriptionId,
          clerkOrgId,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: `sub_stripe_${code}`,
          planCode: code,
          stripePriceId: "price_test",
          status: code === "trial" ? "trialing" : "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: code === "trial" ? new Date() : null,
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockCounter = {
          id: `counter_${code}`,
          clerkOrgId,
          periodKey,
          periodStart,
          periodEnd,
          metric: "api_call",
          included,
          used: 0,
          organizationId: orgId,
          subscriptionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
        mockUpsertUsageCounter.mockResolvedValue(mockCounter);

        const request = createTestRequestWithHeaders({
          url: "http://localhost:3000/api/usage/seed",
          method: "POST",
          body: { orgId },
        });

        // Act
        const response = await POST(request);
        const body = await extractJsonBody(response);

        // Assert
        expect(response.status).toBe(200);
        expect(body.data.remaining).toBe(included);
      }
    });
  });

  describe("Situational Tests", () => {
    test("1. no_org_context - Returns 403 when no Clerk org in session", async () => {
      // Arrange
      const { mockAuthenticatedWithoutOrg } = await import("../../helpers/mock-clerk-auth");
      mockAuthenticatedWithoutOrg("user_test123");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
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

    test("2. no_active_subscription - Returns 404 when no active subscription", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
        method: "POST",
        body: { orgId: "org_123" },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(404);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "NO_ACTIVE_SUBSCRIPTION");
    });

    test("3. preserves_existing_usage_when_re_seeding", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const clerkOrgId = "org_test456";
      const subscriptionId = "sub_internal_789";
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const mockOrg = createMockOrganization({
        id: orgId,
        clerkOrgId,
      });

      const mockSubscription = {
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "starter",
        stripePriceId: "price_test",
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: "counter_123",
        clerkOrgId,
        periodKey,
        periodStart,
        periodEnd,
        metric: "api_call",
        included: 60,
        used: 25, // Existing usage
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", clerkOrgId);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockUpsertUsageCounter.mockResolvedValue(mockCounter);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
        method: "POST",
        body: { orgId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert - Remaining should account for existing usage
      expect(response.status).toBe(200);
      expect(body.data.remaining).toBe(35); // 60 - 25
    });

    test("4. invalid_plan_code - Returns 500 when subscription has invalid plan code", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const clerkOrgId = "org_test456";
      const subscriptionId = "sub_internal_789";
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const mockOrg = createMockOrganization({
        id: orgId,
        clerkOrgId,
      });

      const mockSubscription = {
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "invalid_plan", // Invalid plan code
        stripePriceId: "price_test",
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthenticatedWithOrg("user_test123", clerkOrgId);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/usage/seed",
        method: "POST",
        body: { orgId },
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "INVALID_PLAN_CODE");
    });
  });
});

