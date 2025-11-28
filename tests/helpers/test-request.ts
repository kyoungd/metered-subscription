/**
 * Test Request Helper
 * 
 * Utilities for building HTTP requests in tests
 */

import { NextRequest } from "next/server";

export interface TestRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string; // For raw body (e.g., webhooks)
  url?: string;
}

/**
 * Creates a mock Next.js request for testing
 * 
 * @param options - Request configuration
 * @returns NextRequest instance
 */
export function createTestRequest(options: TestRequestOptions = {}): NextRequest {
  const {
    method = "POST",
    headers = {},
    body,
    rawBody,
    url = "http://localhost:3000/api/test",
  } = options;

  const requestHeaders = new Headers(headers);
  
  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (rawBody !== undefined) {
    // Use raw body as-is (for webhooks)
    requestInit.body = rawBody;
  } else if (body !== undefined) {
    // Convert body to JSON string
    requestInit.body = JSON.stringify(body);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  return new NextRequest(url, requestInit);
}

/**
 * Creates a test request with standard headers
 * 
 * @param options - Request configuration
 * @returns NextRequest with x-request-id and x-correlation-id
 */
export function createTestRequestWithHeaders(
  options: TestRequestOptions = {}
): NextRequest {
  const defaultHeaders = {
    "x-request-id": "test-request-id-123",
    "x-correlation-id": "test-correlation-id-456",
  };

  return createTestRequest({
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
}

/**
 * Extracts JSON body from Response
 * 
 * @param response - Response object
 * @returns Parsed JSON body
 */
export async function extractJsonBody<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

