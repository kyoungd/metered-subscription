/**
 * Mock Database Helper
 * 
 * Utilities for mocking Prisma database operations in tests
 */

import { db } from "@/lib/db";

/**
 * Mock Prisma client type
 */
export const mockDb = db as jest.Mocked<typeof db>;

/**
 * Resets all database mocks
 */
export function resetDbMocks(): void {
  jest.clearAllMocks();
}

/**
 * Mocks organization upsert operation
 * 
 * @param result - Organization record to return
 */
export function mockOrganizationUpsert(result: {
  id: string;
  clerkOrgId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): void {
  mockDb.organization.upsert.mockResolvedValue(result);
}

/**
 * Mocks organization findUnique operation
 * 
 * @param result - Organization record to return (or null)
 */
export function mockOrganizationFindUnique(result: {
  id: string;
  clerkOrgId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
} | null): void {
  mockDb.organization.findUnique.mockResolvedValue(result);
}

/**
 * Mocks organization upsert to throw error
 * 
 * @param error - Error to throw
 */
export function mockOrganizationUpsertError(error: Error): void {
  mockDb.organization.upsert.mockRejectedValue(error);
}

/**
 * Creates a mock organization record
 * 
 * @param overrides - Optional field overrides
 * @returns Mock organization record
 */
export function createMockOrganization(overrides?: {
  id?: string;
  clerkOrgId?: string;
  name?: string;
  stripeCustomerId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}): {
  id: string;
  clerkOrgId: string;
  name: string;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return {
    id: "org_internal_123",
    clerkOrgId: "org_test456",
    name: "Test Organization",
    stripeCustomerId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

