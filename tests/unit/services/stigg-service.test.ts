/**
 * Unit Tests: Stigg Service
 * 
 * Tests business logic for Stigg provisioning operations
 */

import {
  provisionSubscription,
} from "@/lib/services/stigg/stigg-service";
import { findOrganizationById } from "@/lib/db/repositories/org-repository";
import { findSubscriptionById } from "@/lib/db/repositories/subscription-repository";
import {
  mockStiggProvisionSubscriptionSuccess,
  mockStiggProvisionSubscriptionError,
  resetStiggMocks,
} from "../../helpers/mock-stigg";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockFindSubscriptionById = findSubscriptionById as jest.MockedFunction<
  typeof findSubscriptionById
>;

describe("Stigg Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStiggMocks();
  });

  describe("provisionSubscription", () => {
    const orgId = "org_internal_123";
    const subscriptionId = "sub_internal_456";
    const clerkOrgId = "org_test789";
    const stripeCustomerId = "cus_test_123";
    const stripeSubscriptionId = "sub_stripe_456";

    test("provisions subscription successfully", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSub = {
        id: subscriptionId,
        clerkOrgId,
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

      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);
      mockStiggProvisionSubscriptionSuccess();

      // Act
      const result = await provisionSubscription(orgId, subscriptionId);

      // Assert
      expect(result.provisioned).toBe(true);
    });

    test("returns provisioned: false if organization not found", async () => {
      // Arrange
      mockFindOrganizationById.mockResolvedValue(null);

      // Act
      const result = await provisionSubscription(orgId, subscriptionId);

      // Assert
      expect(result.provisioned).toBe(false);
    });

    test("returns provisioned: false if subscription not found", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(null);

      // Act
      const result = await provisionSubscription(orgId, subscriptionId);

      // Assert
      expect(result.provisioned).toBe(false);
    });

    test("returns provisioned: false if org has no stripeCustomerId", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSub = {
        id: subscriptionId,
        clerkOrgId,
        stripeCustomerId: null,
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

      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);

      // Act
      const result = await provisionSubscription(orgId, subscriptionId);

      // Assert
      expect(result.provisioned).toBe(false);
    });

    test("returns provisioned: false if Stigg API fails (soft dependency)", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSub = {
        id: subscriptionId,
        clerkOrgId,
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

      mockFindOrganizationById.mockResolvedValue(mockOrg);
      mockFindSubscriptionById.mockResolvedValue(mockSub);
      mockStiggProvisionSubscriptionError(new Error("Stigg API error"));

      // Act
      const result = await provisionSubscription(orgId, subscriptionId);

      // Assert - Should return false but not throw (soft dependency)
      expect(result.provisioned).toBe(false);
    });

    test("provisions subscription for different plan codes", async () => {
      // Arrange
      const planCodes = ["trial", "starter", "growth", "pro"] as const;

      for (const planCode of planCodes) {
        const mockOrg = {
          id: orgId,
          clerkOrgId,
          name: "Test Org",
          stripeCustomerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockSub = {
          id: subscriptionId,
          clerkOrgId,
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
        };

        mockFindOrganizationById.mockResolvedValue(mockOrg);
        mockFindSubscriptionById.mockResolvedValue(mockSub);
        mockStiggProvisionSubscriptionSuccess();

        // Act
        const result = await provisionSubscription(orgId, subscriptionId);

        // Assert
        expect(result.provisioned).toBe(true);
      }
    });
  });
});

