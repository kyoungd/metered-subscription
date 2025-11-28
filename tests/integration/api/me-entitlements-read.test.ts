/**
 * Integration Tests: GET /api/me/entitlements.read
 * 
 * Tests the entitlements API endpoint with mocked dependencies.
 */

import { GET } from "@/app/api/me/entitlements.read/route";
import { createTestRequest } from "../../helpers/test-request";
import { mockClerkAuthWithOrg } from "@/tests/helpers/mock-clerk-auth";
import {
  findOrganizationByClerkOrgId,
} from "@/lib/db/repositories/org-repository";
import {
  findActiveSubscriptionByOrganizationId,
} from "@/lib/db/repositories/subscription-repository";
import {
  findUsageCounter,
} from "@/lib/db/repositories/usage-repository";

// Mock dependencies
jest.mock("@/lib/middleware/auth");
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");
jest.mock("@/lib/db/repositories/usage-repository", () => ({
  ...jest.requireActual("@/lib/db/repositories/usage-repository"),
  findUsageCounter: jest.fn(),
}));

const mockRequireAuthWithOrg = require("@/lib/middleware/auth")
  .requireAuthWithOrg as jest.MockedFunction<
  typeof import("@/lib/middleware/auth").requireAuthWithOrg
>;

const mockFindOrganizationByClerkOrgId = findOrganizationByClerkOrgId as jest.MockedFunction<
  typeof findOrganizationByClerkOrgId
>;
const mockFindActiveSubscriptionByOrganizationId = findActiveSubscriptionByOrganizationId as jest.MockedFunction<
  typeof findActiveSubscriptionByOrganizationId
>;
const mockFindUsageCounter = findUsageCounter as jest.MockedFunction<
  typeof findUsageCounter
>;

describe("GET /api/me/entitlements.read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Success Cases", () => {
    test("returns entitlements successfully", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";
      const subscriptionId = "sub_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindOrganizationByClerkOrgId.mockResolvedValue({
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "starter",
        stripePriceId: "price_test",
        status: "active",
        currentPeriodStart: new Date(2025, 0, 15), // January 15, 2025
        currentPeriodEnd: new Date(2025, 1, 15),
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindUsageCounter.mockResolvedValue({
        id: "counter_123",
        clerkOrgId,
        periodKey: "2025-01",
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 1, 1),
        metric: "api_call",
        included: 60,
        used: 15,
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          planCode: "starter",
          included: 60,
          used: 15,
          remaining: 45,
          periodKey: "2025-01",
        },
        correlationId: expect.any(String),
      });
    });

    test("returns zeros when usage counter does not exist", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";
      const subscriptionId = "sub_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindOrganizationByClerkOrgId.mockResolvedValue({
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "trial",
        stripePriceId: "price_test",
        status: "trialing",
        currentPeriodStart: new Date(2025, 0, 15),
        currentPeriodEnd: new Date(2025, 1, 15),
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindUsageCounter.mockResolvedValue(null);

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          planCode: "trial",
          included: 0,
          used: 0,
          remaining: 0,
          periodKey: "2025-01",
        },
        correlationId: expect.any(String),
      });
    });
  });

  describe("Error Cases", () => {
    test("returns 401 when not authenticated", async () => {
      // Arrange
      const { UnauthorizedError } = require("@/lib/utils/errors");
      mockRequireAuthWithOrg.mockRejectedValue(
        new UnauthorizedError("Authentication required")
      );

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
    });

    test("returns 403 when no org context", async () => {
      // Arrange
      const { ForbiddenError } = require("@/lib/utils/errors");
      mockRequireAuthWithOrg.mockRejectedValue(
        new ForbiddenError("Organization context required")
      );

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(body.error).toBeDefined();
    });

    test("returns 404 when organization not found", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindOrganizationByClerkOrgId.mockResolvedValue(null);

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    test("returns 404 when no active subscription", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindOrganizationByClerkOrgId.mockResolvedValue({
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Headers", () => {
    test("auto-generates request-id and correlation-id if missing", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";
      const subscriptionId = "sub_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindOrganizationByClerkOrgId.mockResolvedValue({
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "starter",
        stripePriceId: "price_test",
        status: "active",
        currentPeriodStart: new Date(2025, 0, 15),
        currentPeriodEnd: new Date(2025, 1, 15),
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindUsageCounter.mockResolvedValue({
        id: "counter_123",
        clerkOrgId,
        periodKey: "2025-01",
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 1, 1),
        metric: "api_call",
        included: 60,
        used: 15,
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequest({
        method: "GET",
        url: "http://localhost:3000/api/me/entitlements.read",
        headers: {}, // No headers
      });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.correlationId).toBeDefined();
      expect(typeof body.correlationId).toBe("string");
    });
  });
});

