/**
 * E2E Tests: POST /api/orgs/create
 * 
 * Tests organization creation with REAL database operations.
 * No mocks - validates actual database writes and reads.
 * 
 * Prerequisites:
 * 1. Docker test database running: docker-compose -f docker-compose.test.yml up -d
 * 2. Migrations applied (done automatically in setup)
 */

import { getTestPrismaClient, clearTestDatabase } from "../helpers/test-database";
import { upsertOrganizationByClerkOrgId, findOrganizationByClerkOrgId } from "@/lib/db/repositories/org-repository";
import { createOrganization, isValidClerkOrgId } from "@/lib/services/orgs/org-service";
import { OrgValidationError } from "@/lib/errors/org-errors";

// Override the db import to use test database
jest.mock("@/lib/db", () => {
  const { getTestPrismaClient } = require("../helpers/test-database");
  return {
    db: getTestPrismaClient(),
  };
});

describe("E2E: POST /api/orgs/create - Real Database", () => {
  beforeEach(async () => {
    // Clear database before each test for isolation
    await clearTestDatabase();
  });

  describe("Repository Layer - Real Database Operations", () => {
    test("creates new organization in database", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_test_new_123";

      // Act
      const result = await upsertOrganizationByClerkOrgId(clerkOrgId);

      // Assert - Check returned data
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.clerkOrgId).toBe(clerkOrgId);
      expect(result.name).toBe(`Organization ${clerkOrgId}`);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);

      // Assert - Verify data persisted in database
      const prisma = getTestPrismaClient();
      const dbRecord = await prisma.organization.findUnique({
        where: { clerkOrgId },
      });
      
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.id).toBe(result.id);
      expect(dbRecord!.clerkOrgId).toBe(clerkOrgId);
    });

    test("returns existing organization for duplicate clerkOrgId (idempotency)", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_test_duplicate_456";

      // Act - Create first time
      const firstResult = await upsertOrganizationByClerkOrgId(clerkOrgId);

      // Act - Create second time (should return same record)
      const secondResult = await upsertOrganizationByClerkOrgId(clerkOrgId);

      // Assert - Same org returned
      expect(firstResult.id).toBe(secondResult.id);
      expect(firstResult.clerkOrgId).toBe(secondResult.clerkOrgId);

      // Assert - Only one record in database
      const prisma = getTestPrismaClient();
      const count = await prisma.organization.count({
        where: { clerkOrgId },
      });
      expect(count).toBe(1);
    });

    test("findOrganizationByClerkOrgId returns organization after creation", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_test_find_789";
      await upsertOrganizationByClerkOrgId(clerkOrgId);

      // Act
      const result = await findOrganizationByClerkOrgId(clerkOrgId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.clerkOrgId).toBe(clerkOrgId);
    });

    test("findOrganizationByClerkOrgId returns null for non-existent org", async () => {
      // Act
      const result = await findOrganizationByClerkOrgId("org_does_not_exist");

      // Assert
      expect(result).toBeNull();
    });

    test("organization timestamps are in UTC", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_test_utc_101";
      const beforeCreate = new Date();

      // Act
      const result = await upsertOrganizationByClerkOrgId(clerkOrgId);
      const afterCreate = new Date();

      // Assert - Timestamps are valid dates
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);

      // Assert - Timestamps are within expected range
      expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
      expect(result.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000);

      // Assert - ISO string ends with Z (UTC)
      expect(result.createdAt.toISOString()).toMatch(/Z$/);
      expect(result.updatedAt.toISOString()).toMatch(/Z$/);
    });

    test("organization ID is generated as CUID", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_test_cuid_202";

      // Act
      const result = await upsertOrganizationByClerkOrgId(clerkOrgId);

      // Assert - CUID format: lowercase alphanumeric, starts with letter
      expect(result.id).toMatch(/^[a-z][a-z0-9]{24}$/);
    });
  });

  describe("Service Layer - Real Business Logic", () => {
    test("createOrganization creates org with valid clerkOrgId", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_service_valid_123";

      // Act
      const result = await createOrganization(clerkOrgId);

      // Assert - Service returns orgId
      expect(result).toBeDefined();
      expect(result.orgId).toBeDefined();

      // Assert - Data persisted in database
      const prisma = getTestPrismaClient();
      const dbRecord = await prisma.organization.findUnique({
        where: { id: result.orgId },
      });
      
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.clerkOrgId).toBe(clerkOrgId);
    });

    test("createOrganization throws OrgValidationError for invalid clerkOrgId", async () => {
      // Arrange
      const invalidClerkOrgIds = [
        "",
        "invalid",
        "user_123",
        "org_",
        "ORG_uppercase",
        "org_with-hyphen",
        "org_with.dot",
        "org_with space",
      ];

      // Act & Assert
      for (const invalidId of invalidClerkOrgIds) {
        await expect(createOrganization(invalidId)).rejects.toThrow(OrgValidationError);
        
        // Verify nothing was written to database
        const prisma = getTestPrismaClient();
        const count = await prisma.organization.count({
          where: { clerkOrgId: invalidId },
        });
        expect(count).toBe(0);
      }
    });

    test("createOrganization is idempotent - returns same orgId for same clerkOrgId", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_service_idempotent_456";

      // Act
      const firstResult = await createOrganization(clerkOrgId);
      const secondResult = await createOrganization(clerkOrgId);
      const thirdResult = await createOrganization(clerkOrgId);

      // Assert - All return same orgId
      expect(firstResult.orgId).toBe(secondResult.orgId);
      expect(secondResult.orgId).toBe(thirdResult.orgId);

      // Assert - Only one record in database
      const prisma = getTestPrismaClient();
      const count = await prisma.organization.count({
        where: { clerkOrgId },
      });
      expect(count).toBe(1);
    });

    test("multiple different organizations can be created", async () => {
      // Arrange
      const clerkOrgIds = [
        "org_e2e_multi_1",
        "org_e2e_multi_2",
        "org_e2e_multi_3",
      ];

      // Act
      const results = await Promise.all(
        clerkOrgIds.map((id) => createOrganization(id))
      );

      // Assert - All have unique orgIds
      const orgIds = results.map((r) => r.orgId);
      const uniqueOrgIds = new Set(orgIds);
      expect(uniqueOrgIds.size).toBe(clerkOrgIds.length);

      // Assert - All persisted in database
      const prisma = getTestPrismaClient();
      const count = await prisma.organization.count();
      expect(count).toBe(clerkOrgIds.length);
    });
  });

  describe("Validation - isValidClerkOrgId", () => {
    test("validates correct Clerk org ID formats", () => {
      const validIds = [
        "org_abc123",
        "org_ABC123",
        "org_1234567890",
        "org_aBcDeF123456",
        "org_a",
        "org_with_underscores",
        "org_e2e_test_123",
        "org_multiple_underscores_here",
      ];

      for (const id of validIds) {
        expect(isValidClerkOrgId(id)).toBe(true);
      }
    });

    test("rejects invalid Clerk org ID formats", () => {
      const invalidIds = [
        "",
        "org_",
        "invalid",
        "user_123",
        "org-with-hyphen",
        "org_with.dot",
        "org_with space",
        "ORG_UPPERCASE_START",
        "Org_MixedCase",
        "org_special!char",
        "org_special@char",
        "org_special#char",
      ];

      for (const id of invalidIds) {
        expect(isValidClerkOrgId(id)).toBe(false);
      }
    });
  });

  describe("Data Integrity", () => {
    test("organization unique constraint prevents duplicate clerkOrgId via direct insert", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_unique_constraint_test";
      const prisma = getTestPrismaClient();

      // Create first organization
      await prisma.organization.create({
        data: {
          clerkOrgId,
          name: "First Org",
        },
      });

      // Act & Assert - Second insert should fail
      await expect(
        prisma.organization.create({
          data: {
            clerkOrgId,
            name: "Second Org",
          },
        })
      ).rejects.toThrow();

      // Verify only one record exists
      const count = await prisma.organization.count({
        where: { clerkOrgId },
      });
      expect(count).toBe(1);
    });

    test("organization can be queried by internal ID", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_query_by_id_test";
      const { orgId } = await createOrganization(clerkOrgId);

      // Act
      const prisma = getTestPrismaClient();
      const result = await prisma.organization.findUnique({
        where: { id: orgId },
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(orgId);
      expect(result!.clerkOrgId).toBe(clerkOrgId);
    });

    test("organization updatedAt changes on update", async () => {
      // Arrange
      const clerkOrgId = "org_e2e_updated_at_test";
      const prisma = getTestPrismaClient();

      const original = await prisma.organization.create({
        data: {
          clerkOrgId,
          name: "Original Name",
        },
      });

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act - Update the organization
      const updated = await prisma.organization.update({
        where: { id: original.id },
        data: { name: "Updated Name" },
      });

      // Assert
      expect(updated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
      expect(updated.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });
});

