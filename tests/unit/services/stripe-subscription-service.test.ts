/**
 * Unit Tests: Stripe Subscription Service
 * 
 * Tests business logic for Stripe subscription operations
 */

import {
  createSubscriptionForOrganization,
  isValidPlanCode,
} from "@/lib/services/stripe/stripe-subscription-service";
import { findOrganizationById } from "@/lib/db/repositories/org-repository";
import { createSubscription } from "@/lib/db/repositories/subscription-repository";
import {
  StripeValidationError,
  StripeOrgNotFoundError,
  StripeApiError,
} from "@/lib/errors/stripe-errors";
import {
  mockStripeSubscriptionCreate,
  mockStripeSubscriptionCreateError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockCreateSubscription = createSubscription as jest.MockedFunction<
  typeof createSubscription
>;

describe("Stripe Subscription Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks();
  });

  describe("isValidPlanCode", () => {
    test("returns true for valid plan codes", () => {
      expect(isValidPlanCode("trial")).toBe(true);
      expect(isValidPlanCode("starter")).toBe(true);
      expect(isValidPlanCode("growth")).toBe(true);
      expect(isValidPlanCode("pro")).toBe(true);
    });

    test("returns false for invalid plan codes", () => {
      expect(isValidPlanCode("invalid")).toBe(false);
      expect(isValidPlanCode("")).toBe(false);
      expect(isValidPlanCode("premium")).toBe(false);
    });
  });

  describe("createSubscriptionForOrganization", () => {
    const orgId = "org_internal_123";
    const clerkOrgId = "org_test456";
    const stripeCustomerId = "cus_test789";
    const stripeSubscriptionId = "sub_test123";

    test("creates subscription successfully with valid planCode and org", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
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
        clerkOrgId,
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

      // Act
      const result = await createSubscriptionForOrganization(orgId, "trial");

      // Assert
      expect(result).toBeDefined();
      expect(result.subscriptionId).toBeDefined();
      expect(result.status).toBe("trialing");
      expect(result.trialEndsAt).toBeTruthy();
      expect(mockCreateSubscription).toHaveBeenCalled();
    });

    test("throws StripeValidationError for invalid planCode", async () => {
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

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(orgId, "invalid_plan")
      ).rejects.toThrow(StripeValidationError);

      // Should not call Stripe API
      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });

    test("throws StripeOrgNotFoundError if organization not found", async () => {
      // Arrange
      mockFindOrganizationById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(orgId, "trial")
      ).rejects.toThrow(StripeOrgNotFoundError);

      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });

    test("throws StripeValidationError if org has no stripeCustomerId", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindOrganizationById.mockResolvedValue(mockOrg);

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(orgId, "trial")
      ).rejects.toThrow(StripeValidationError);
      await expect(
        createSubscriptionForOrganization(orgId, "trial")
      ).rejects.toThrow("does not have a Stripe customer ID");

      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });

    test("throws StripeApiError if Stripe subscription creation fails", async () => {
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
      mockStripeSubscriptionCreateError(new Error("Stripe API error"));

      // Act & Assert
      await expect(
        createSubscriptionForOrganization(orgId, "trial")
      ).rejects.toThrow(StripeApiError);

      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });

    test("creates subscription with trial period for trial plan", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
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
        clerkOrgId,
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

      // Act
      const result = await createSubscriptionForOrganization(orgId, "trial");

      // Assert
      expect(result.status).toBe("trialing");
      expect(result.trialEndsAt).toBeTruthy();
    });

    test("creates subscription without trial for non-trial plans", async () => {
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
      mockStripeSubscriptionCreate(
        stripeSubscriptionId,
        stripeCustomerId,
        "active",
        null, // No trial
        "starter"
      );
      mockCreateSubscription.mockResolvedValue({
        id: "sub_internal_123",
        clerkOrgId,
        stripeCustomerId,
        stripeSubscriptionId,
        planCode: "starter",
        stripePriceId: "price_1SF55w33pr8E7tWLQJNWOvxd",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialEndsAt: null,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await createSubscriptionForOrganization(orgId, "starter");

      // Assert
      expect(result.status).toBe("active");
      expect(result.trialEndsAt).toBeNull();
    });

    test("maps Stripe status correctly to local status", async () => {
      // Arrange
      const mockOrg = {
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const statuses: Array<{ stripe: string; local: string }> = [
        { stripe: "trialing", local: "trialing" },
        { stripe: "active", local: "active" },
        { stripe: "past_due", local: "past_due" },
        { stripe: "canceled", local: "canceled" },
      ];

      for (const { stripe: stripeStatus, local: localStatus } of statuses) {
        mockFindOrganizationById.mockResolvedValue(mockOrg);
        mockStripeSubscriptionCreate(
          stripeSubscriptionId,
          stripeCustomerId,
          stripeStatus as any,
          null,
          "starter"
        );
        mockCreateSubscription.mockResolvedValue({
          id: "sub_internal_123",
          clerkOrgId,
          stripeCustomerId,
          stripeSubscriptionId,
          planCode: "starter",
          stripePriceId: "price_1SF55w33pr8E7tWLQJNWOvxd",
          status: localStatus,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          trialEndsAt: null,
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Act
        const result = await createSubscriptionForOrganization(orgId, "starter");

        // Assert
        expect(result.status).toBe(localStatus);
      }
    });
  });
});

