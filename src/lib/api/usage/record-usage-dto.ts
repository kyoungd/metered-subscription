/**
 * Record Usage DTOs
 * 
 * Zod schemas and TypeScript types for usage recording API.
 * 
 * @module lib/api/usage/record-usage-dto
 */

import { z } from "zod";

/**
 * Request schema for POST /api/usage/record
 */
export const RecordUsageRequestSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
  metric: z.string().min(1, "Metric is required").default("api_call"),
  value: z.number().int().positive("Value must be a positive integer"),
  occurredAt: z.string().datetime("Invalid ISO 8601 datetime format").or(z.date()),
  request_id: z.string().min(1, "Request ID is required for idempotency"),
});

/**
 * Response schema for POST /api/usage/record
 */
export const RecordUsageResponseSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/, "Period key must be in YYYY-MM format"),
  used: z.number().int().nonnegative(),
  remaining: z.number().int(),
});

export type RecordUsageRequest = z.infer<typeof RecordUsageRequestSchema>;
export type RecordUsageResponse = z.infer<typeof RecordUsageResponseSchema>;

