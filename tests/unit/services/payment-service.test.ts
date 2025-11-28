/**
 * Unit Tests: Payment Service
 * 
 * Tests business logic for payment operations
 */

import {
  createSetupIntent,
  attachDefaultPaymentMethod,
} from "@/lib/services/payments/payment-service";
import { findOrganizationById } from "@/lib/db/repositories/org-repository";
import {
  StripeValidationError,
  StripeOrgNotFoundError,
  StripeApiError,
} from "@/lib/errors/stripe-errors";
import {
  mockStripeSetupIntentCreate,
  mockStripeSetupIntentCreateError,
  mockStripePaymentMethodAttach,
  mockStripePaymentMethodAttachError,
  mockStripeCustomerUpdate,
  mockStripeCustomerUpdateError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;

describe("Payment Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks();
  });

  describe("createSetupIntent", () => {
    const orgId = "org_internal_123";
    const clerkOrgId = "org_test456";
    const stripeCustomerId = "cus_test789";
    const setupIntentId = "seti_test123";
    const clientSecret = "seti_test123_secret_test456";

    test("creates SetupIntent successfully with valid org and customer", async () => {
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
      mockStripeSetupIntentCreate(setupIntentId, stripeCustomerId, clientSecret);

      // Act
      const result = await createSetupIntent(orgId);

      // Assert
      expect(result.clientSecret).toBe(clientSecret);
    });

    test("throws StripeOrgNotFoundError if organization not found", async () => {
      // Arrange
      mockFindOrganizationById.mockResolvedValue(null);

      // Act & Assert
      await expect(createSetupIntent(orgId)).rejects.toThrow(StripeOrgNotFoundError);
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
      await expect(createSetupIntent(orgId)).rejects.toThrow(StripeValidationError);
      await expect(createSetupIntent(orgId)).rejects.toThrow("does not have a Stripe customer ID");
    });

    test("throws StripeApiError if Stripe SetupIntent creation fails", async () => {
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
      mockStripeSetupIntentCreateError(new Error("Stripe API error"));

      // Act & Assert
      await expect(createSetupIntent(orgId)).rejects.toThrow(StripeApiError);
    });

    test("throws StripeApiError if SetupIntent has no client_secret", async () => {
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
      // Mock SetupIntent without client_secret
      const { mockStripe } = await import("../../helpers/mock-stripe");
      mockStripe.setupIntents.create = jest.fn().mockResolvedValue({
        id: setupIntentId,
        object: "setup_intent",
        customer: stripeCustomerId,
        client_secret: null, // Missing client secret
        status: "requires_payment_method",
      });

      // Act & Assert
      await expect(createSetupIntent(orgId)).rejects.toThrow(StripeApiError);
      await expect(createSetupIntent(orgId)).rejects.toThrow("client_secret is missing");
    });
  });

  describe("attachDefaultPaymentMethod", () => {
    const orgId = "org_internal_123";
    const clerkOrgId = "org_test456";
    const stripeCustomerId = "cus_test789";
    const paymentMethodId = "pm_test123";

    test("attaches payment method and sets as default successfully", async () => {
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
      mockStripePaymentMethodAttach(paymentMethodId, stripeCustomerId);
      mockStripeCustomerUpdate(stripeCustomerId, paymentMethodId);

      // Act
      const result = await attachDefaultPaymentMethod(orgId, paymentMethodId);

      // Assert
      expect(result.ok).toBe(true);
    });

    test("throws StripeOrgNotFoundError if organization not found", async () => {
      // Arrange
      mockFindOrganizationById.mockResolvedValue(null);

      // Act & Assert
      await expect(attachDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toThrow(
        StripeOrgNotFoundError
      );
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
      await expect(attachDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toThrow(
        StripeValidationError
      );
      await expect(attachDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toThrow(
        "does not have a Stripe customer ID"
      );
    });

    test("throws StripeApiError if payment method attach fails", async () => {
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
      mockStripePaymentMethodAttachError(new Error("Payment method attach failed"));

      // Act & Assert
      await expect(attachDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toThrow(
        StripeApiError
      );
    });

    test("throws StripeApiError if customer update fails", async () => {
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
      mockStripePaymentMethodAttach(paymentMethodId, stripeCustomerId);
      mockStripeCustomerUpdateError(new Error("Customer update failed"));

      // Act & Assert
      await expect(attachDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toThrow(
        StripeApiError
      );
    });
  });
});

