/**
 * Entitlements DTOs
 * 
 * Zod schemas and TypeScript types for entitlements API.
 * 
 * @module lib/api/entitlements/entitlements-dto
 */

import { z } from "zod";

/**
 * Response schema for GET /api/me/entitlements.read
 */
export const GetEntitlementsResponseSchema = z.object({
  planCode: z.string(),
  included: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int(),
  periodKey: z.string().regex(/^\d{4}-\d{2}$/, "Period key must be in YYYY-MM format"),
});

export type GetEntitlementsResponse = z.infer<typeof GetEntitlementsResponseSchema>;

