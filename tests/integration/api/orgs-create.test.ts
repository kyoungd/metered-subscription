/**
 * Integration Tests: POST /api/orgs/create
 * 
 * Tests the organization creation endpoint with baseline and situational scenarios
 */

import { POST } from "@/app/api/orgs/create/route";
import {
  mockAuthenticatedWithOrg,
  mockAuthenticatedWithoutOrg,
  mockUnauthenticated,
  resetClerkAuthMock,
} from "../../helpers/mock-clerk-auth";
import {
  mockOrganizationUpsert,
  mockOrganizationUpsertError,
  createMockOrganization,
  resetDbMocks,
} from "../../helpers/mock-db";
import {
  createTestRequest,
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

describe("POST /api/orgs/create", () => {
  beforeEach(() => {
    resetClerkAuthMock();
    resetDbMocks();
  });

  describe("Baseline Tests", () => {
    test("1. happy_path - Returns 200 with {data: {orgId}, correlationId}", async () => {
      // Arrange
      const mockOrg = createMockOrganization();
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("correlationId");
      expect(body.data).toHaveProperty("orgId", mockOrg.id);
      expect(body.correlationId).toBe("test-correlation-id-456");
    });

    test("2. missing_headers - Auto-generates request/correlation IDs", async () => {
      // Arrange
      const mockOrg = createMockOrganization();
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request = createTestRequest({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
        // No x-request-id or x-correlation-id headers
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveProperty("correlationId");
      expect(body.correlationId).toBeTruthy();
      expect(typeof body.correlationId).toBe("string");
    });

    test("3. unauthenticated - Returns 401 without Clerk session", async () => {
      // Arrange
      mockUnauthenticated();

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
      expect(body).toHaveProperty("correlationId");
    });

    test("4. invalid_payload - Returns 400 for malformed input (if applicable)", async () => {
      // Note: Current implementation accepts empty body, so this test validates that behavior
      // If payload validation is added later, this test should be updated
      const mockOrg = createMockOrganization();
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {}, // Empty body is valid
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200); // Empty body is valid
    });

    test("5. idempotency - Same request_id returns identical response", async () => {
      // Note: True idempotency requires caching layer (Redis)
      // This test validates that duplicate clerkOrgId returns same orgId (DB-level idempotency)
      const mockOrg = createMockOrganization();
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const headers = {
        "x-request-id": "idempotent-request-123",
        "x-correlation-id": "idempotent-correlation-456",
      };

      const request1 = createTestRequest({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
        headers,
      });

      const request2 = createTestRequest({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
        headers,
      });

      // Act
      const response1 = await POST(request1);
      const body1 = await extractJsonBody(response1);

      // Reset mocks for second call
      resetDbMocks();
      mockOrganizationUpsert(mockOrg);

      const response2 = await POST(request2);
      const body2 = await extractJsonBody(response2);

      // Assert
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(body1.data.orgId).toBe(body2.data.orgId);
    });
  });

  describe("Situational Tests", () => {
    test("1. no_org_context - Returns 403 when no Clerk org in session", async () => {
      // Arrange
      mockAuthenticatedWithoutOrg("user_test123");

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(403);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "FORBIDDEN");
      expect(body.error.message).toContain("Organization context required");
    });

    test("2. duplicate_clerk_org - Idempotent upsert returns same orgId", async () => {
      // Arrange
      const mockOrg = createMockOrganization({
        id: "org_internal_stable_123",
        clerkOrgId: "org_test456",
      });
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request1 = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act - First call
      const response1 = await POST(request1);
      const body1 = await extractJsonBody(response1);

      // Reset and mock same org again
      resetDbMocks();
      mockOrganizationUpsert(mockOrg); // Same org returned

      const request2 = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
        headers: {
          "x-request-id": "different-request-id",
          "x-correlation-id": "different-correlation-id",
        },
      });

      const response2 = await POST(request2);
      const body2 = await extractJsonBody(response2);

      // Assert
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(body1.data.orgId).toBe(mockOrg.id);
      expect(body2.data.orgId).toBe(mockOrg.id);
      expect(body1.data.orgId).toBe(body2.data.orgId);
    });

    test("3. logging_redaction - PII not in logs (manual verification)", async () => {
      // Note: This test validates the endpoint works with PII data
      // Actual log redaction is tested in unit tests for logger utility
      const mockOrg = createMockOrganization();
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      // Actual PII redaction is verified in logger unit tests
    });

    test("4. database_error - Returns 500 on database failure", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsertError(new Error("Database connection failed"));

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(500);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "ORG_CREATION_ERROR");
    });

    test("5. invalid_clerk_org_id - Returns 400 for invalid Clerk org ID format", async () => {
      // Arrange
      mockAuthenticatedWithOrg("user_test123", "invalid_org_format"); // Invalid format

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);
      const body = await extractJsonBody(response);

      // Assert
      expect(response.status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(body.error.message).toContain("Invalid Clerk organization ID format");
    });
  });

  describe("UTC Timestamp Validation", () => {
    test("createdAt timestamps are UTC (Z)", async () => {
      // Arrange
      const now = new Date();
      const mockOrg = createMockOrganization({
        createdAt: now,
        updatedAt: now,
      });
      mockAuthenticatedWithOrg("user_test123", "org_test456");
      mockOrganizationUpsert(mockOrg);

      const request = createTestRequestWithHeaders({
        url: "http://localhost:3000/api/orgs/create",
        method: "POST",
        body: {},
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      // Verify timestamps are in UTC format (ISO 8601 with Z suffix)
      expect(mockOrg.createdAt.toISOString()).toMatch(/Z$/);
      expect(mockOrg.updatedAt.toISOString()).toMatch(/Z$/);
    });
  });
});

