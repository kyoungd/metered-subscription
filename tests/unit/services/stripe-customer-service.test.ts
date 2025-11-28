/**
 * Unit Tests: Stripe Customer Service
 * 
 * Tests business logic for Stripe customer operations
 */

import { ensureCustomer } from "@/lib/services/stripe/stripe-customer-service";
import { findOrganizationById, updateOrganizationStripeCustomerId } from "@/lib/db/repositories/org-repository";
import {
  StripeOrgNotFoundError,
  StripeApiError,
  StripeCustomerCreationError,
} from "@/lib/errors/stripe-errors";
import {
  mockStripeCustomerList,
  mockStripeCustomerListEmpty,
  mockStripeCustomerCreate,
  mockStripeCustomerListError,
  mockStripeCustomerCreateError,
  resetStripeMocks,
} from "../../helpers/mock-stripe";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");

const mockFindOrganizationById = findOrganizationById as jest.MockedFunction<
  typeof findOrganizationById
>;
const mockUpdateOrganizationStripeCustomerId = updateOrganizationStripeCustomerId as jest.MockedFunction<
  typeof updateOrganizationStripeCustomerId
>;

describe("Stripe Customer Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks();
  });

  describe("ensureCustomer", () => {
    test("returns existing stripeCustomerId from local DB (idempotency)", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const existingStripeCustomerId = "cus_existing_456";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: existingStripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await ensureCustomer(orgId, email);

      // Assert
      expect(result.stripeCustomerId).toBe(existingStripeCustomerId);
      expect(mockFindOrganizationById).toHaveBeenCalledWith(orgId);
      // Should not call Stripe API or update DB
      expect(mockUpdateOrganizationStripeCustomerId).not.toHaveBeenCalled();
    });

    test("searches Stripe and uses existing customer if found", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const existingStripeCustomerId = "cus_stripe_existing_789";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockStripeCustomerList(existingStripeCustomerId, email);
      mockUpdateOrganizationStripeCustomerId.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: existingStripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await ensureCustomer(orgId, email);

      // Assert
      expect(result.stripeCustomerId).toBe(existingStripeCustomerId);
      expect(mockUpdateOrganizationStripeCustomerId).toHaveBeenCalledWith(
        orgId,
        existingStripeCustomerId
      );
    });

    test("creates new Stripe customer if not found locally or in Stripe", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const newStripeCustomerId = "cus_new_123";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockStripeCustomerListEmpty(); // No customer found in Stripe
      mockStripeCustomerCreate(newStripeCustomerId, email, { orgId });
      mockUpdateOrganizationStripeCustomerId.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: newStripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await ensureCustomer(orgId, email);

      // Assert
      expect(result.stripeCustomerId).toBe(newStripeCustomerId);
      expect(mockUpdateOrganizationStripeCustomerId).toHaveBeenCalledWith(
        orgId,
        newStripeCustomerId
      );
    });

    test("throws StripeOrgNotFoundError if organization not found", async () => {
      // Arrange
      const orgId = "org_nonexistent";
      const email = "test@example.com";

      mockFindOrganizationById.mockResolvedValue(null);

      // Act & Assert
      await expect(ensureCustomer(orgId, email)).rejects.toThrow(
        StripeOrgNotFoundError
      );
      expect(mockUpdateOrganizationStripeCustomerId).not.toHaveBeenCalled();
    });

    test("throws StripeApiError if Stripe search fails", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stripeError = new Error("Stripe API error");
      mockStripeCustomerListError(stripeError);

      // Act & Assert
      await expect(ensureCustomer(orgId, email)).rejects.toThrow(StripeApiError);
      expect(mockUpdateOrganizationStripeCustomerId).not.toHaveBeenCalled();
    });

    test("throws StripeCustomerCreationError if Stripe create fails", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockStripeCustomerListEmpty(); // No customer found
      const stripeError = new Error("Stripe creation error");
      mockStripeCustomerCreateError(stripeError);

      // Act & Assert
      await expect(ensureCustomer(orgId, email)).rejects.toThrow(
        StripeCustomerCreationError
      );
      expect(mockUpdateOrganizationStripeCustomerId).not.toHaveBeenCalled();
    });

    test("is idempotent - multiple calls return same customer ID", async () => {
      // Arrange
      const orgId = "org_internal_123";
      const email = "test@example.com";
      const stripeCustomerId = "cus_stable_456";

      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockStripeCustomerList(stripeCustomerId, email);
      mockUpdateOrganizationStripeCustomerId.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act - First call
      const result1 = await ensureCustomer(orgId, email);

      // Reset mocks for second call
      mockFindOrganizationById.mockResolvedValue({
        id: orgId,
        clerkOrgId: "org_test123",
        name: "Test Org",
        stripeCustomerId, // Now exists in DB
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result2 = await ensureCustomer(orgId, email);

      // Assert
      expect(result1.stripeCustomerId).toBe(stripeCustomerId);
      expect(result2.stripeCustomerId).toBe(stripeCustomerId);
      expect(result1.stripeCustomerId).toBe(result2.stripeCustomerId);
    });
  });
});

