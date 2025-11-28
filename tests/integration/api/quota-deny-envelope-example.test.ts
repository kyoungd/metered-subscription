/**
 * Integration Tests: POST /api/quota/deny-envelope.example
 * 
 * Tests the quota denial envelope example endpoint.
 */

import { POST } from "@/app/api/quota/deny-envelope.example/route";
import { createTestRequest } from "../../helpers/test-request";

describe("POST /api/quota/deny-envelope.example", () => {
  test("returns 429 with standard denial envelope", async () => {
    // Arrange
    const request = createTestRequest({
      method: "POST",
      url: "http://localhost:3000/api/quota/deny-envelope.example",
      body: {},
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        message: "Usage quota exceeded",
        details: {
          metric: "api_call",
          limit: 30,
          used: 30,
          remaining: 0,
        },
      },
      correlationId: expect.any(String),
    });
    expect(response.headers.get("Retry-After")).toBe("3600");
  });

  test("always returns 429 regardless of request body", async () => {
    // Arrange
    const request = createTestRequest({
      method: "POST",
      url: "http://localhost:3000/api/quota/deny-envelope.example",
      body: {
        orgId: "org_test_123",
        metric: "api_call",
      },
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(429);
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
    expect(response.headers.get("Retry-After")).toBe("3600");
  });

  test("auto-generates correlationId if missing", async () => {
    // Arrange
    const request = createTestRequest({
      method: "POST",
      url: "http://localhost:3000/api/quota/deny-envelope.example",
      body: {},
      headers: {}, // No headers
    });

    // Act
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(429);
    expect(body.correlationId).toBeDefined();
    expect(typeof body.correlationId).toBe("string");
  });
});

