/**
 * Unit Tests: Usage Recording Service
 * 
 * Tests the usage recording service layer business logic.
 */

import { recordUsage } from "@/lib/services/usage/usage-recording-service";
import {
  findOrganizationByClerkOrgId,
} from "@/lib/db/repositories/org-repository";
import {
  findActiveSubscriptionByOrganizationId,
} from "@/lib/db/repositories/subscription-repository";
import {
  findUsageCounter,
  incrementUsageCounter,
  createUsageRecord,
  findUsageRecordByRequestId,
  upsertUsageCounter,
} from "@/lib/db/repositories/usage-repository";
import { ApplicationError } from "@/lib/utils/errors";

// Mock repositories
jest.mock("@/lib/db/repositories/org-repository");
jest.mock("@/lib/db/repositories/subscription-repository");
jest.mock("@/lib/db/repositories/usage-repository", () => ({
  ...jest.requireActual("@/lib/db/repositories/usage-repository"),
  findUsageCounter: jest.fn(),
  incrementUsageCounter: jest.fn(),
  createUsageRecord: jest.fn(),
  findUsageRecordByRequestId: jest.fn(),
  upsertUsageCounter: jest.fn(),
}));

const mockFindOrganizationByClerkOrgId = findOrganizationByClerkOrgId as jest.MockedFunction<
  typeof findOrganizationByClerkOrgId
>;
const mockFindActiveSubscriptionByOrganizationId =
  findActiveSubscriptionByOrganizationId as jest.MockedFunction<
    typeof findActiveSubscriptionByOrganizationId
  >;
const mockFindUsageCounter = findUsageCounter as jest.MockedFunction<
  typeof findUsageCounter
>;
const mockIncrementUsageCounter = incrementUsageCounter as jest.MockedFunction<
  typeof incrementUsageCounter
>;
const mockCreateUsageRecord = createUsageRecord as jest.MockedFunction<
  typeof createUsageRecord
>;
const mockFindUsageRecordByRequestId = findUsageRecordByRequestId as jest.MockedFunction<
  typeof findUsageRecordByRequestId
>;
const mockUpsertUsageCounter = upsertUsageCounter as jest.MockedFunction<
  typeof upsertUsageCounter
>;

describe("Usage Recording Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("recordUsage", () => {
    const clerkOrgId = "org_test_123";
    const orgId = "org_internal_123";
    const subscriptionId = "sub_123";
    const counterId = "counter_123";
    const requestId = "req_123";
    const occurredAt = new Date(2025, 0, 15, 10, 30, 0);

    const mockOrganization = {
      id: orgId,
      clerkOrgId,
      name: "Test Org",
      stripeCustomerId: "cus_test",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSubscription = {
      id: subscriptionId,
      clerkOrgId,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_stripe_test",
      planCode: "starter",
      stripePriceId: "price_test",
      status: "active",
      currentPeriodStart: new Date(2025, 0, 15),
      currentPeriodEnd: new Date(2025, 1, 15),
      trialEndsAt: null,
      organizationId: orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockUsageCounter = {
      id: counterId,
      clerkOrgId,
      periodKey: "2025-01",
      periodStart: new Date(2025, 0, 1),
      periodEnd: new Date(2025, 1, 1),
      metric: "api_call",
      included: 60,
      used: 15,
      organizationId: orgId,
      subscriptionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    test("records usage successfully", async () => {
      // Arrange
      mockFindUsageRecordByRequestId.mockResolvedValue(null); // No existing record
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(mockUsageCounter);
      mockIncrementUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 20, // 15 + 5
      });
      mockCreateUsageRecord.mockResolvedValue({
        id: "record_123",
        clerkOrgId,
        metric: "api_call",
        value: 5,
        occurredAt,
        metadata: { request_id: requestId },
        organizationId: orgId,
        subscriptionId,
        usageCounterId: counterId,
        createdAt: new Date(),
      });

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert
      expect(result).toEqual({
        periodKey: "2025-01",
        used: 20,
        remaining: 40, // 60 - 20
      });

      expect(mockFindUsageRecordByRequestId).toHaveBeenCalledWith(requestId);
      expect(mockIncrementUsageCounter).toHaveBeenCalledWith(counterId, 5);
      expect(mockCreateUsageRecord).toHaveBeenCalledWith({
        organizationId: orgId,
        clerkOrgId,
        subscriptionId,
        usageCounterId: counterId,
        metric: "api_call",
        value: 5,
        occurredAt,
        metadata: { request_id: requestId },
      });
    });

    test("returns existing result when request_id already exists (idempotent)", async () => {
      // Arrange
      const existingRecord = {
        id: "record_existing_123",
        clerkOrgId,
        metric: "api_call",
        value: 5,
        occurredAt,
        metadata: { request_id: requestId },
        organizationId: orgId,
        subscriptionId,
        usageCounterId: counterId,
        createdAt: new Date(),
      };

      mockFindUsageRecordByRequestId.mockResolvedValue(existingRecord);
      mockFindUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 20, // Already recorded
      });

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert
      expect(result).toEqual({
        periodKey: "2025-01",
        used: 20,
        remaining: 40,
      });

      // Should not increment or create new record
      expect(mockIncrementUsageCounter).not.toHaveBeenCalled();
      expect(mockCreateUsageRecord).not.toHaveBeenCalled();
    });

    test("creates usage counter if it doesn't exist", async () => {
      // Arrange
      mockFindUsageRecordByRequestId.mockResolvedValue(null);
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue(null); // Counter doesn't exist
      
      const newCounter = {
        ...mockUsageCounter,
        used: 0,
      };
      mockUpsertUsageCounter.mockResolvedValue(newCounter);
      mockIncrementUsageCounter.mockResolvedValue({
        ...newCounter,
        used: 5,
      });
      mockCreateUsageRecord.mockResolvedValue({
        id: "record_123",
        clerkOrgId,
        metric: "api_call",
        value: 5,
        occurredAt,
        metadata: { request_id: requestId },
        organizationId: orgId,
        subscriptionId,
        usageCounterId: counterId,
        createdAt: new Date(),
      });

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        5,
        occurredAt,
        requestId
      );

      // Assert
      expect(mockUpsertUsageCounter).toHaveBeenCalledWith({
        organizationId: orgId,
        clerkOrgId,
        subscriptionId,
        periodKey: "2025-01",
        periodStart: mockSubscription.currentPeriodStart,
        periodEnd: mockSubscription.currentPeriodEnd,
        metric: "api_call",
        included: 60, // From starter plan
      });
      expect(result.used).toBe(5);
    });

    test("throws error when organization not found", async () => {
      // Arrange
      mockFindUsageRecordByRequestId.mockResolvedValue(null);
      mockFindOrganizationByClerkOrgId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        recordUsage(clerkOrgId, "api_call", 5, occurredAt, requestId)
      ).rejects.toThrow(ApplicationError);
      await expect(
        recordUsage(clerkOrgId, "api_call", 5, occurredAt, requestId)
      ).rejects.toThrow("Organization not found");
    });

    test("throws error when no active subscription", async () => {
      // Arrange
      mockFindUsageRecordByRequestId.mockResolvedValue(null);
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        recordUsage(clerkOrgId, "api_call", 5, occurredAt, requestId)
      ).rejects.toThrow(ApplicationError);
      await expect(
        recordUsage(clerkOrgId, "api_call", 5, occurredAt, requestId)
      ).rejects.toThrow("No active subscription found");
    });

    test("handles negative remaining when over quota", async () => {
      // Arrange
      mockFindUsageRecordByRequestId.mockResolvedValue(null);
      mockFindOrganizationByClerkOrgId.mockResolvedValue(mockOrganization);
      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue(
        mockSubscription
      );
      mockFindUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 58, // Close to limit
      });
      mockIncrementUsageCounter.mockResolvedValue({
        ...mockUsageCounter,
        used: 65, // Over quota (60 included)
      });
      mockCreateUsageRecord.mockResolvedValue({
        id: "record_123",
        clerkOrgId,
        metric: "api_call",
        value: 7,
        occurredAt,
        metadata: { request_id: requestId },
        organizationId: orgId,
        subscriptionId,
        usageCounterId: counterId,
        createdAt: new Date(),
      });

      // Act
      const result = await recordUsage(
        clerkOrgId,
        "api_call",
        7,
        occurredAt,
        requestId
      );

      // Assert
      expect(result.used).toBe(65);
      expect(result.remaining).toBe(-5); // Negative remaining indicates over-quota
    });
  });
});

