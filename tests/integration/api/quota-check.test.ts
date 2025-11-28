/**
 * Integration Tests: POST /api/quota/check
 * 
 * Tests the quota check API endpoint with mocked dependencies.
 */

import { POST } from "@/app/api/quota/check/route";
import { createTestRequest } from "../../helpers/test-request";
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

describe("POST /api/quota/check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Success Cases", () => {
    test("returns 200 with allow=true when quota is available", async () => {
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
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          allow: true,
          remaining: 45,
        },
        correlationId: expect.any(String),
      });
    });

    test("returns 429 with allow=false when quota is exceeded", async () => {
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

      mockFindUsageCounter.mockResolvedValue({
        id: "counter_123",
        clerkOrgId,
        periodKey: "2025-01",
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 1, 1),
        metric: "api_call",
        included: 30,
        used: 30, // All quota used
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(429);
      expect(body).toMatchObject({
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Usage quota exceeded",
        },
        correlationId: expect.any(String),
      });
      expect(response.headers.get("Retry-After")).toBe("3600");
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
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: "org_test_123",
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
    });

    test("returns 403 when orgId does not match authenticated orgId", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: "org_different_456", // Different from authenticated orgId
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("FORBIDDEN");
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
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(404);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    test("returns 429 when usage counter not found", async () => {
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

      mockFindUsageCounter.mockResolvedValue(null); // Counter not found

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(429);
      expect(body).toMatchObject({
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Usage quota not available",
        },
        correlationId: expect.any(String),
      });
      expect(response.headers.get("Retry-After")).toBe("3600");
    });
  });

  describe("Validation", () => {
    test("returns 400 for missing orgId", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          // Missing orgId
          metric: "api_call",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(body.error).toBeDefined();
    });

    test("uses default metric 'api_call' when not provided", async () => {
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
        method: "POST",
        url: "http://localhost:3000/api/quota/check",
        body: {
          orgId: clerkOrgId,
          // metric not provided - should default to "api_call"
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.data.allow).toBe(true);
      expect(mockFindUsageCounter).toHaveBeenCalledWith(
        clerkOrgId,
        "2025-01",
        "api_call" // Default metric
      );
    });
  });
});

