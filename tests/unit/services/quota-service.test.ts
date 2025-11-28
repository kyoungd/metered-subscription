/**
 * Unit Tests: Quota Service
 * 
 * Tests the quota service layer business logic.
 */

import { checkQuota } from "@/lib/services/quota/quota-service";
import {
  findOrganizationByClerkOrgId,
} from "@/lib/db/repositories/org-repository";
import {
  findActiveSubscriptionByOrganizationId,
} from "@/lib/db/repositories/subscription-repository";
import {
  findUsageCounter,
} from "@/lib/db/repositories/usage-repository";
import {
  QuotaOrgNotFoundError,
  QuotaNoActiveSubscriptionError,
  QuotaCounterNotFoundError,
} from "@/lib/errors/quota-errors";

// Mock repositories
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");
jest.mock("@/lib/db/repositories/usage-repository", () => ({
  ...jest.requireActual("@/lib/db/repositories/usage-repository"),
  findUsageCounter: jest.fn(),
}));

const mockFindOrganizationByClerkOrgId = findOrganizationByClerkOrgId as jest.MockedFunction<
  typeof findOrganizationByClerkOrgId
>;
const mockFindActiveSubscriptionByOrganizationId =
  findActiveSubscriptionByOrganizationId as jest.MockedFunction<
    typeof findActiveSubscriptionByOrganizationId
  >;
const mockFindUsageCounter = findUsageCounter as jest.MockedFunction<
  typeof findUsageCounter
>;

describe("Quota Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("checkQuota", () => {
    const clerkOrgId = "org_test_123";
    const orgId = "org_internal_123";
    const subscriptionId = "sub_123";

    const mockOrganization = {
      id: orgId,
      clerkOrgId,
      name: "Test Org",
      stripeCustomerId: "cus_test",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSubscription = {
      id: subscriptionId,
      clerkOrgId,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_stripe_test",
      planCode: "starter",
      stripePriceId: "price_test",
      status: "active",
      currentPeriodStart: new Date(2025, 0, 15), // January 15, 2025
      currentPeriodEnd: new Date(2025, 1, 15), // February 15, 2025
      trialEndsAt: null,
      organizationId: orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockUsageCounter = {
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
    };

    test("returns allow=true when quota is available", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(mockUsageCounter);

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result).toEqual({
        allow: true,
        remaining: 45, // 60 - 15
      });

      expect(mockFindOrganizationByClerkOrgId).toHaveBeenCalledWith(clerkOrgId);
      expect(mockFindActiveSubscriptionByOrganizationId).toHaveBeenCalledWith(
        orgId
      );
      expect(mockFindUsageCounter).toHaveBeenCalledWith(
        clerkOrgId,
        "2025-01",
        "api_call"
      );
    });

    test("returns allow=false when quota is exceeded", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 60, // All quota used
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result).toEqual({
        allow: false,
        remaining: 0, // Return 0 when denied
      });
    });

    test("returns allow=false when over quota", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 100, // Over quota
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result).toEqual({
        allow: false,
        remaining: 0,
      });
    });

    test("throws QuotaOrgNotFoundError when organization not found", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(null);

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        QuotaOrgNotFoundError
      );
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        `Organization not found: ${clerkOrgId}`
      );
    });

    test("throws QuotaNoActiveSubscriptionError when no active subscription", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        QuotaNoActiveSubscriptionError
      );
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        `No active subscription found for organization: ${clerkOrgId}`
      );
    });

    test("throws QuotaCounterNotFoundError when usage counter not found", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(null);

      // Act & Assert
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        QuotaCounterNotFoundError
      );
      await expect(checkQuota(clerkOrgId, "api_call")).rejects.toThrow(
        `Usage counter not found for organization: ${clerkOrgId}`
      );
    });

    test("uses default metric 'api_call' when not provided", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(mockUsageCounter);

      // Act
      await checkQuota(clerkOrgId); // No metric provided

      // Assert
      expect(mockFindUsageCounter).toHaveBeenCalledWith(
        clerkOrgId,
        "2025-01",
        "api_call" // Default metric
      );
    });

    test("handles edge case: exactly at quota limit", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 59, // One less than included (60)
      });

      // Act
      const result = await checkQuota(clerkOrgId, "api_call");

      // Assert
      expect(result).toEqual({
        allow: true,
        remaining: 1,
      });
    });
  });
});

