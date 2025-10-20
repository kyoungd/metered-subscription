/**
 * Unit Tests: Organization Service
 * 
 * Tests business logic for organization operations
 */

import { createOrganization, isValidClerkOrgId } from "@/lib/services/orgs/org-service";
import { upsertOrganizationByClerkOrgId } from "@/lib/db/repositories/org-repository";
import { OrgValidationError } from "@/lib/errors/org-errors";
import { createMockOrganization } from "../../helpers/mock-db";

// Mock repository
jest.mock("@/lib/db/repositories/org-repository");

const mockUpsertOrganizationByClerkOrgId = upsertOrganizationByClerkOrgId as jest.MockedFunction<
  typeof upsertOrganizationByClerkOrgId
>;

describe("Organization Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isValidClerkOrgId", () => {
    test("returns true for valid Clerk org ID", () => {
      expect(isValidClerkOrgId("org_test123")).toBe(true);
      expect(isValidClerkOrgId("org_ABC123xyz")).toBe(true);
      expect(isValidClerkOrgId("org_1234567890")).toBe(true);
    });

    test("returns false for invalid Clerk org ID", () => {
      expect(isValidClerkOrgId("invalid")).toBe(false);
      expect(isValidClerkOrgId("user_test123")).toBe(false);
      expect(isValidClerkOrgId("org_")).toBe(false);
      expect(isValidClerkOrgId("org_test-123")).toBe(false); // Hyphen not allowed
      expect(isValidClerkOrgId("")).toBe(false);
    });
  });

  describe("createOrganization", () => {
    test("creates organization successfully with valid clerkOrgId", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_123",
        clerkOrgId: "org_test456",
      });
      mockUpsertOrganizationByClerkOrgId.mockResolvedValue(mockOrg);

      // Act
      const result = await createOrganization("org_test456");

      // Assert
      expect(result).toEqual({ orgId: "org_internal_123" });
      expect(mockUpsertOrganizationByClerkOrgId).toHaveBeenCalledWith("org_test456");
      expect(mockUpsertOrganizationByClerkOrgId).toHaveBeenCalledTimes(1);
    });

    test("throws OrgValidationError for invalid clerkOrgId format", async () => {
      // Act & Assert
      await expect(createOrganization("invalid_format")).rejects.toThrow(OrgValidationError);
      await expect(createOrganization("user_test123")).rejects.toThrow(OrgValidationError);
      await expect(createOrganization("")).rejects.toThrow(OrgValidationError);

      // Repository should not be called
      expect(mockUpsertOrganizationByClerkOrgId).not.toHaveBeenCalled();
    });

    test("returns same orgId for duplicate clerkOrgId (idempotency)", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_stable_123",
        clerkOrgId: "org_test456",
      });
      mockUpsertOrganizationByClerkOrgId.mockResolvedValue(mockOrg);

      // Act - First call
      const result1 = await createOrganization("org_test456");

      // Act - Second call
      const result2 = await createOrganization("org_test456");

      // Assert
      expect(result1.orgId).toBe("org_internal_stable_123");
      expect(result2.orgId).toBe("org_internal_stable_123");
      expect(result1.orgId).toBe(result2.orgId);
      expect(mockUpsertOrganizationByClerkOrgId).toHaveBeenCalledTimes(2);
    });

    test("propagates repository errors", async () => {
      // Arrange
      const repositoryError = new Error("Database connection failed");
      mockUpsertOrganizationByClerkOrgId.mockRejectedValue(repositoryError);

      // Act & Assert
      await expect(createOrganization("org_test456")).rejects.toThrow();
      expect(mockUpsertOrganizationByClerkOrgId).toHaveBeenCalledWith("org_test456");
    });

    test("validates clerkOrgId before calling repository", async () => {
      // Arrange
      const invalidIds = ["", "invalid", "user_123", "org_"];

      // Act & Assert
      for (const invalidId of invalidIds) {
        await expect(createOrganization(invalidId)).rejects.toThrow(OrgValidationError);
      }

      // Repository should never be called
      expect(mockUpsertOrganizationByClerkOrgId).not.toHaveBeenCalled();
    });
  });
});

