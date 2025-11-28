/**
 * Integration Tests: POST /api/usage/record
 * 
 * Tests the usage recording API endpoint with mocked dependencies.
 */

import { POST } from "@/app/api/usage/record/route";
import { createTestRequest } from "../../helpers/test-request";
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

// Mock dependencies
jest.mock("@/lib/middleware/auth");
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

const mockRequireAuthWithOrg = require("@/lib/middleware/auth")
  .requireAuthWithOrg as jest.MockedFunction<
  typeof import("@/lib/middleware/auth").requireAuthWithOrg
>;

const mockFindOrganizationByClerkOrgId = findOrganizationByClerkOrgId as jest.MockedFunction<
  typeof findOrganizationByClerkOrgId
>;
const mockFindActiveSubscriptionByOrganizationId = findActiveSubscriptionByOrganizationId as jest.MockedFunction<
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

describe("POST /api/usage/record", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Success Cases", () => {
    test("records usage successfully", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";
      const subscriptionId = "sub_123";
      const counterId = "counter_123";
      const requestId = "req_test_123";
      const occurredAt = new Date(2025, 0, 15, 10, 30, 0);

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      mockFindUsageRecordByRequestId.mockResolvedValue(null);
      mockFindOrganizationByClerkOrgId.mockResolvedValue({
        id: orgId,
        clerkOrgId,
        name: "Test Org",
        stripeCustomerId: "cus_test",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFindActiveSubscriptionByOrganizationId.mockResolvedValue({
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
      });

      mockFindUsageCounter.mockResolvedValue({
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
      });

      mockIncrementUsageCounter.mockResolvedValue({
        id: counterId,
        clerkOrgId,
        periodKey: "2025-01",
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 1, 1),
        metric: "api_call",
        included: 60,
        used: 20, // 15 + 5
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
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

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
          value: 5,
          occurredAt: occurredAt.toISOString(),
          request_id: requestId,
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          periodKey: "2025-01",
          used: 20,
          remaining: 40,
        },
        correlationId: expect.any(String),
      });
    });

    test("returns existing result when request_id already exists (idempotent)", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";
      const orgId = "org_internal_123";
      const subscriptionId = "sub_123";
      const counterId = "counter_123";
      const requestId = "req_existing_123";
      const occurredAt = new Date(2025, 0, 15, 10, 30, 0);

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

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
        id: counterId,
        clerkOrgId,
        periodKey: "2025-01",
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 1, 1),
        metric: "api_call",
        included: 60,
        used: 20, // Already recorded
        organizationId: orgId,
        subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
          value: 5,
          occurredAt: occurredAt.toISOString(),
          request_id: requestId,
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        data: {
          periodKey: "2025-01",
          used: 20,
          remaining: 40,
        },
        correlationId: expect.any(String),
      });

      // Should not increment or create new record
      expect(mockIncrementUsageCounter).not.toHaveBeenCalled();
      expect(mockCreateUsageRecord).not.toHaveBeenCalled();
    });
  });

  describe("Error Cases", () => {
    test("returns 401 when not authenticated", async () => {
      // Arrange
      const { UnauthorizedError } = require("@/lib/utils/errors");
      mockRequireAuthWithOrg.mockRejectedValue(
        new UnauthorizedError("Authentication required")
      );

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: "org_test_123",
          metric: "api_call",
          value: 5,
          occurredAt: new Date().toISOString(),
          request_id: "req_123",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
    });

    test("returns 403 when orgId does not match authenticated orgId", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: "org_different_456", // Different from authenticated orgId
          metric: "api_call",
          value: 5,
          occurredAt: new Date().toISOString(),
          request_id: "req_123",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    test("returns 400 for missing request_id", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
          value: 5,
          occurredAt: new Date().toISOString(),
          // Missing request_id
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(body.error).toBeDefined();
    });

    test("returns 400 for invalid value (non-positive)", async () => {
      // Arrange
      const clerkOrgId = "org_test_123";

      mockRequireAuthWithOrg.mockResolvedValue({
        userId: "user_123",
        clerkOrgId,
      });

      const request = createTestRequest({
        method: "POST",
        url: "http://localhost:3000/api/usage/record",
        body: {
          orgId: clerkOrgId,
          metric: "api_call",
          value: 0, // Invalid: must be positive
          occurredAt: new Date().toISOString(),
          request_id: "req_123",
        },
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(body.error).toBeDefined();
    });
  });
});

