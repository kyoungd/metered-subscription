/**
 * Unit Tests: Organization Repository
 * 
 * Tests data access layer for organization operations
 */

import {
  upsertOrganizationByClerkOrgId,
  findOrganizationById,
  findOrganizationByClerkOrgId,
} from "@/lib/db/repositories/org-repository";
import { OrgCreationError } from "@/lib/errors/org-errors";
import { mockDb, createMockOrganization } from "../../helpers/mock-db";

describe("Organization Repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("upsertOrganizationByClerkOrgId", () => {
    test("creates new organization when not exists", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_new_123",
        clerkOrgId: "org_test_new_456",
      });
      mockDb.organization.upsert.mockResolvedValue(mockOrg);

      // Act
      const result = await upsertOrganizationByClerkOrgId("org_test_new_456");

      // Assert
      expect(result).toEqual(mockOrg);
      expect(mockDb.organization.upsert).toHaveBeenCalledWith({
        where: {
          clerkOrgId: "org_test_new_456",
        },
        update: {},
        create: {
          clerkOrgId: "org_test_new_456",
          name: "Organization org_test_new_456",
        },
      });
    });

    test("returns existing organization when already exists", async () => {
      // Arrange
      const existingOrg = createMockOrganization({
        id: "org_internal_existing_123",
        clerkOrgId: "org_test_existing_456",
      });
      mockDb.organization.upsert.mockResolvedValue(existingOrg);

      // Act
      const result = await upsertOrganizationByClerkOrgId("org_test_existing_456");

      // Assert
      expect(result).toEqual(existingOrg);
      expect(result.id).toBe("org_internal_existing_123");
    });

    test("is idempotent - multiple calls return same org", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_stable_123",
        clerkOrgId: "org_test_stable_456",
      });
      mockDb.organization.upsert.mockResolvedValue(mockOrg);

      // Act
      const result1 = await upsertOrganizationByClerkOrgId("org_test_stable_456");
      const result2 = await upsertOrganizationByClerkOrgId("org_test_stable_456");

      // Assert
      expect(result1.id).toBe(result2.id);
      expect(result1.clerkOrgId).toBe(result2.clerkOrgId);
      expect(mockDb.organization.upsert).toHaveBeenCalledTimes(2);
    });

    test("throws OrgCreationError on database failure", async () => {
      // Arrange
      const dbError = new Error("Database connection failed");
      mockDb.organization.upsert.mockRejectedValue(dbError);

      // Act & Assert
      await expect(upsertOrganizationByClerkOrgId("org_test_456")).rejects.toThrow(
        OrgCreationError
      );
      await expect(upsertOrganizationByClerkOrgId("org_test_456")).rejects.toThrow(
        /Failed to create or retrieve organization/
      );
    });

    test("includes clerkOrgId in error message on failure", async () => {
      // Arrange
      mockDb.organization.upsert.mockRejectedValue(new Error("DB error"));

      // Act & Assert
      try {
        await upsertOrganizationByClerkOrgId("org_specific_test_789");
        fail("Should have thrown OrgCreationError");
      } catch (error) {
        expect(error).toBeInstanceOf(OrgCreationError);
        expect((error as OrgCreationError).message).toContain("org_specific_test_789");
      }
    });
  });

  describe("findOrganizationById", () => {
    test("returns organization when found", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_123",
      });
      mockDb.organization.findUnique.mockResolvedValue(mockOrg);

      // Act
      const result = await findOrganizationById("org_internal_123");

      // Assert
      expect(result).toEqual(mockOrg);
      expect(mockDb.organization.findUnique).toHaveBeenCalledWith({
        where: {
          id: "org_internal_123",
        },
      });
    });

    test("returns null when not found", async () => {
      // Arrange
      mockDb.organization.findUnique.mockResolvedValue(null);

      // Act
      const result = await findOrganizationById("non_existent_id");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("findOrganizationByClerkOrgId", () => {
    test("returns organization when found", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        clerkOrgId: "org_test_456",
      });
      mockDb.organization.findUnique.mockResolvedValue(mockOrg);

      // Act
      const result = await findOrganizationByClerkOrgId("org_test_456");

      // Assert
      expect(result).toEqual(mockOrg);
      expect(mockDb.organization.findUnique).toHaveBeenCalledWith({
        where: {
          clerkOrgId: "org_test_456",
        },
      });
    });

    test("returns null when not found", async () => {
      // Arrange
      mockDb.organization.findUnique.mockResolvedValue(null);

      // Act
      const result = await findOrganizationByClerkOrgId("org_non_existent");

      // Assert
      expect(result).toBeNull();
    });
  });
});

