/**
 * Mock Clerk Auth Helper
 * 
 * Utilities for mocking Clerk authentication in tests
 */

import { auth } from "@clerk/nextjs/server";

export interface MockAuthContext {
  userId: string | null;
  orgId: string | null;
}

/**
 * Mocks Clerk auth() to return specified context
 * 
 * @param context - Auth context to mock
 */
export function mockClerkAuth(context: MockAuthContext): void {
  (auth as jest.Mock).mockResolvedValue(context);
}

/**
 * Mocks authenticated user with org context
 * 
 * @param userId - User ID (defaults to test user)
 * @param orgId - Organization ID (defaults to test org)
 */
export function mockAuthenticatedWithOrg(
  userId: string = "user_test123",
  orgId: string = "org_test456"
): void {
  mockClerkAuth({ userId, orgId });
}

/**
 * Mocks authenticated user without org context
 * 
 * @param userId - User ID (defaults to test user)
 */
export function mockAuthenticatedWithoutOrg(
  userId: string = "user_test123"
): void {
  mockClerkAuth({ userId, orgId: null });
}

/**
 * Mocks unauthenticated state (no user)
 */
export function mockUnauthenticated(): void {
  mockClerkAuth({ userId: null, orgId: null });
}

/**
 * Resets Clerk auth mock
 */
export function resetClerkAuthMock(): void {
  (auth as jest.Mock).mockReset();
}

