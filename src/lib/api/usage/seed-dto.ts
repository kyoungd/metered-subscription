/**
 * Usage Seed DTOs
 * 
 * Request/response schemas and types for usage counter seeding endpoint.
 * 
 * @module lib/api/usage/seed-dto
 */

import { z } from "zod";

/**
 * Seed usage counter request schema
 */
export const seedUsageRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

/**
 * Seed usage counter response schema
 */
export const seedUsageResponseSchema = z.object({
  periodKey: z.string(),
  remaining: z.number(),
});

/**
 * Request type for seeding usage counter
 */
export type SeedUsageRequest = z.infer<typeof seedUsageRequestSchema>;

/**
 * Response type for seeding usage counter
 */
export type SeedUsageResponse = z.infer<typeof seedUsageResponseSchema>;

