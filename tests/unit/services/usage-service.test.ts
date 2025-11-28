/**
 * Unit Tests: Usage Service
 * 
 * Tests business logic for usage counter operations
 */

import {
  seedUsageCounter,
} from "@/lib/services/usage/usage-service";
import { findActiveSubscriptionByOrganizationId } from "@/lib/db/repositories/subscription-repository";
import { findOrganizationById } from "@/lib/db/repositories/org-repository";
import { upsertUsageCounter } from "@/lib/db/repositories/usage-repository";
import { ApplicationError } from "@/lib/utils/errors";

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

describe("Usage Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("seedUsageCounter", () => {
    const orgId = "org_internal_123";
    const clerkOrgId = "org_test456";
    const subscriptionId = "sub_internal_789";
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    test("seeds usage counter successfully for trial plan", async () => {
      // Arrange
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

      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: "counter_123",
        clerkOrgId,
        periodKey: "2025-11",
        periodStart,
        periodEnd,
        metric: "api_call",
        included: 30, // trial plan
        used: 0,
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockUpsertUsageCounter.mockResolvedValue(mockCounter);

      // Act
      const result = await seedUsageCounter(orgId);

      // Assert
      expect(result.periodKey).toBe("2025-11");
      expect(result.remaining).toBe(30);
      expect(mockUpsertUsageCounter).toHaveBeenCalledWith({
        organizationId: orgId,
        clerkOrgId,
        subscriptionId,
        periodKey: "2025-11",
        periodStart,
        periodEnd,
        metric: "api_call",
        included: 30,
      });
    });

    test("seeds usage counter for different plan codes", async () => {
      // Arrange
      const planCodes = [
        { code: "trial", included: 30 },
        { code: "starter", included: 60 },
        { code: "growth", included: 300 },
        { code: "pro", included: 1500 },
      ] as const;

      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      for (const { code, included } of planCodes) {
        const mockSubscription = {
          id: subscriptionId,
          clerkOrgId,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_stripe_test",
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
          periodKey: "2025-11",
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
        mockFindOrganizationById.mockResolvedValue(mockOrg);
        mockUpsertUsageCounter.mockResolvedValue(mockCounter);

        // Act
        const result = await seedUsageCounter(orgId);

        // Assert
        expect(result.remaining).toBe(included);
        expect(mockUpsertUsageCounter).toHaveBeenCalledWith(
          expect.objectContaining({
            included,
          })
        );
      }
    });

    test("preserves existing used value when re-seeding", async () => {
      // Arrange
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

      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCounter = {
        id: "counter_123",
        clerkOrgId,
        periodKey: "2025-11",
        periodStart,
        periodEnd,
        metric: "api_call",
        included: 60, // starter plan
        used: 25, // Existing usage preserved
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockUpsertUsageCounter.mockResolvedValue(mockCounter);

      // Act
      const result = await seedUsageCounter(orgId);

      // Assert - Remaining should account for existing usage
      expect(result.remaining).toBe(35); // 60 - 25
    });

    test("throws error if no active subscription found", async () => {
      // Arrange
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      // Act & Assert
      await expect(seedUsageCounter(orgId)).rejects.toThrow(ApplicationError);
      try {
        await seedUsageCounter(orgId);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        expect((error as ApplicationError).code).toBe("NO_ACTIVE_SUBSCRIPTION");
      }
    });

    test("throws error if organization not found", async () => {
      // Arrange
      const mockSubscription = {
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_stripe_test",
        planCode: "trial",
        stripePriceId: "price_test",
        status: "trialing",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: new Date(),
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(null);

      // Act & Assert
      await expect(seedUsageCounter(orgId)).rejects.toThrow(ApplicationError);
      try {
        await seedUsageCounter(orgId);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        expect((error as ApplicationError).code).toBe("ORG_NOT_FOUND");
      }
    });

    test("throws error for invalid plan code in subscription", async () => {
      // Arrange
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

      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
      mockFindOrganizationById.mockResolvedValue(mockOrg);

      // Act & Assert
      await expect(seedUsageCounter(orgId)).rejects.toThrow(ApplicationError);
      try {
        await seedUsageCounter(orgId);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        expect((error as ApplicationError).code).toBe("INVALID_PLAN_CODE");
      }
    });

    test("formats period key correctly from subscription period start", async () => {
      // Arrange
      const testCases = [
        { date: new Date(2025, 0, 15), expected: "2025-01" }, // January
        { date: new Date(2025, 11, 25), expected: "2025-12" }, // December
        { date: new Date(2024, 5, 1), expected: "2024-06" }, // June
      ];

      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      for (const { date, expected } of testCases) {
        const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const mockSubscription = {
          id: subscriptionId,
          clerkOrgId,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_stripe_test",
          planCode: "starter",
          stripePriceId: "price_test",
          status: "active",
          currentPeriodStart: date,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockCounter = {
          id: "counter_123",
          clerkOrgId,
          periodKey: expected,
          periodStart: date,
          periodEnd: periodEnd,
          metric: "api_call",
          included: 60,
          used: 0,
          organizationId: orgId,
          subscriptionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(mockSubscription);
        mockFindOrganizationById.mockResolvedValue(mockOrg);
        mockUpsertUsageCounter.mockResolvedValue(mockCounter);

        // Act
        const result = await seedUsageCounter(orgId);

        // Assert
        expect(result.periodKey).toBe(expected);
      }
    });
  });
});

