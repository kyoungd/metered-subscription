/**
 * Organization Creation DTOs
 * 
 * Request/response schemas and types for organization creation endpoint.
 * 
 * @module lib/api/orgs/create-org-dto
 */

import { z } from "zod";

/**
 * Create organization request schema
 * Note: clerkOrgId is extracted from session, not from request body
 */
export const createOrgRequestSchema = z.object({
  // Empty object - no body parameters required
  // clerkOrgId comes from Clerk session via auth middleware
}).optional();

/**
 * Create organization response schema
 */
export const createOrgResponseSchema = z.object({
  orgId: z.string(),
});

/**
 * Request type for organization creation
 */
export type CreateOrgRequest = z.infer<typeof createOrgRequestSchema>;

/**
 * Response type for organization creation
 */
export type CreateOrgResponse = z.infer<typeof createOrgResponseSchema>;

