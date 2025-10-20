/**
 * Authentication Middleware
 * 
 * Clerk session validation and auth context extraction.
 * Validates bearer tokens and extracts user/org context from Clerk sessions.
 * 
 * @module lib/middleware/auth
 */

import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

export interface AuthContext {
  userId: string;
  clerkOrgId: string | null;
}

/**
 * Requires authenticated Clerk session
 * Extracts userId and clerkOrgId from session
 * 
 * @returns Auth context with userId and clerkOrgId
 * @throws UnauthorizedError if no session
 * @throws ForbiddenError if no org context in session
 */
export async function requireAuth(): Promise<AuthContext> {
  const { userId, orgId } = await auth();
  
  if (!userId) {
    throw new UnauthorizedError("Authentication required");
  }
  
  return {
    userId,
    clerkOrgId: orgId,
  };
}

/**
 * Requires authenticated Clerk session with organization context
 * 
 * @returns Auth context with userId and clerkOrgId (guaranteed non-null)
 * @throws UnauthorizedError if no session
 * @throws ForbiddenError if no org context in session
 */
export async function requireAuthWithOrg(): Promise<Required<AuthContext>> {
  const authContext = await requireAuth();
  
  if (!authContext.clerkOrgId) {
    throw new ForbiddenError("Organization context required");
  }
  
  return {
    userId: authContext.userId,
    clerkOrgId: authContext.clerkOrgId,
  };
}

