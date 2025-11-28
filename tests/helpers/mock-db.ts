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

/**
 * Mock repository functions for organization
 */
export function mockFindOrganizationByClerkOrgId(
  result: {
    id: string;
    clerkOrgId: string;
    name: string;
    stripeCustomerId: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null
): void {
  const { findOrganizationByClerkOrgId } = require("@/lib/db/repositories/org-repository");
  (findOrganizationByClerkOrgId as jest.MockedFunction<typeof findOrganizationByClerkOrgId>).mockResolvedValue(result);
}

/**
 * Mock repository functions for subscription
 */
export function mockFindActiveSubscriptionByOrganizationId(
  result: {
    id: string;
    clerkOrgId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    planCode: string;
    stripePriceId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEndsAt: Date | null;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null
): void {
  const { findActiveSubscriptionByOrganizationId } = require("@/lib/db/repositories/subscription-repository");
  (findActiveSubscriptionByOrganizationId as jest.MockedFunction<typeof findActiveSubscriptionByOrganizationId>).mockResolvedValue(result);
}

/**
 * Creates a mock subscription record
 */
export function mockSubscriptionRecord(overrides?: {
  id?: string;
  clerkOrgId?: string;
  organizationId?: string;
  planCode?: string;
  status?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialEndsAt?: Date | null;
}): {
  id: string;
  clerkOrgId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planCode: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return {
    id: "sub_123",
    clerkOrgId: "org_test456",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_stripe_test",
    planCode: "starter",
    stripePriceId: "price_test",
    status: "active",
    currentPeriodStart: new Date(2025, 0, 15),
    currentPeriodEnd: new Date(2025, 1, 15),
    trialEndsAt: null,
    organizationId: "org_internal_123",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Mock repository functions for usage counter
 */
export function mockFindUsageCounter(
  result: {
    id: string;
    clerkOrgId: string;
    periodKey: string;
    periodStart: Date;
    periodEnd: Date;
    metric: string;
    included: number;
    used: number;
    organizationId: string;
    subscriptionId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null
): void {
  const { findUsageCounter } = require("@/lib/db/repositories/usage-repository");
  (findUsageCounter as jest.MockedFunction<typeof findUsageCounter>).mockResolvedValue(result);
}

/**
 * Creates a mock usage counter record
 */
export function mockUsageCounterRecord(overrides?: {
  clerkOrgId?: string;
  periodKey?: string;
  included?: number;
  used?: number;
  organizationId?: string;
  subscriptionId?: string;
}): {
  id: string;
  clerkOrgId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  metric: string;
  included: number;
  used: number;
  organizationId: string;
  subscriptionId: string;
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return {
    id: "counter_123",
    clerkOrgId: "org_test456",
    periodKey: "2025-01",
    periodStart: new Date(2025, 0, 1),
    periodEnd: new Date(2025, 1, 1),
    metric: "api_call",
    included: 60,
    used: 0,
    organizationId: "org_internal_123",
    subscriptionId: "sub_123",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Mock organization record for repository functions
 */
export function mockOrganizationRecord(overrides?: {
  id?: string;
  clerkOrgId?: string;
  name?: string;
  stripeCustomerId?: string | null;
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

