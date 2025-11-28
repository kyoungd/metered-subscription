/**
 * Unit Tests: Entitlements Service
 * 
 * Tests the entitlements service layer business logic.
 */

import { getEntitlements } from "@/lib/services/entitlements/entitlements-service";
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
  EntitlementsOrgNotFoundError,
  EntitlementsNoActiveSubscriptionError,
} from "@/lib/errors/entitlements-errors";

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

describe("Entitlements Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getEntitlements", () => {
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

    test("returns entitlements successfully", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(mockUsageCounter);

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result).toEqual({
        planCode: "starter",
        included: 60,
        used: 15,
        remaining: 45,
        periodKey: "2025-01",
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

    test("returns zeros when usage counter does not exist", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(null);

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result).toEqual({
        planCode: "starter",
        included: 0,
        used: 0,
        remaining: 0,
        periodKey: "2025-01",
      });
    });

    test("throws EntitlementsOrgNotFoundError when organization not found", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(null);

      // Act & Assert
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow(
        EntitlementsOrgNotFoundError
      );
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow(
        `Organization not found: ${clerkOrgId}`
      );
    });

    test("throws EntitlementsNoActiveSubscriptionError when no active subscription", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      // Act & Assert
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow(
        EntitlementsNoActiveSubscriptionError
      );
      await expect(getEntitlements(clerkOrgId)).rejects.toThrow(
        `No active subscription found for organization: ${clerkOrgId}`
      );
    });

    test("calculates remaining correctly for different usage levels", async () => {
      // Arrange
      const testCases = [
        { used: 0, expectedRemaining: 60 },
        { used: 30, expectedRemaining: 30 },
        { used: 60, expectedRemaining: 0 },
        { used: 100, expectedRemaining: -40 }, // Over quota
      ];

      for (const { used, expectedRemaining } of testCases) {
        mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
        mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
          mockSubscription
        );
        mockFindUsageCounter.mockResolvedValue({
          ...mockUsageCounter,
          used,
        });

        // Act
        const result = await getEntitlements(clerkOrgId);

        // Assert
        expect(result.remaining).toBe(expectedRemaining);
      }
    });

    test("derives periodKey correctly from subscription currentPeriodStart", async () => {
      // Arrange
      const testCases = [
        { date: new Date(2025, 0, 15), expected: "2025-01" }, // January
        { date: new Date(2025, 11, 25), expected: "2025-12" }, // December
        { date: new Date(2024, 5, 1), expected: "2024-06" }, // June
      ];

      for (const { date, expected } of testCases) {
        mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
        mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
          ...mockSubscription,
          currentPeriodStart: date,
        });
        mockFindUsageCounter.mockResolvedValue({
          ...mockUsageCounter,
          periodKey: expected,
        });

        // Act
        const result = await getEntitlements(clerkOrgId);

        // Assert
        expect(result.periodKey).toBe(expected);
        expect(mockFindUsageCounter).toHaveBeenCalledWith(
          clerkOrgId,
          expected,
          "api_call"
        );
      }
    });

    test("handles trialing subscription status", async () => {
      // Arrange
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
        ...mockSubscription,
        status: "trialing",
      });
      mockFindUsageCounter.mockResolvedValue(mockUsageCounter);

      // Act
      const result = await getEntitlements(clerkOrgId);

      // Assert
      expect(result.planCode).toBe("starter");
      expect(result.included).toBe(60);
    });
  });
});

