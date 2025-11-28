/**
 * Quota Check DTOs
 * 
 * Zod schemas and TypeScript types for quota check API.
 * 
 * @module lib/api/quota/quota-check-dto
 */

import { z } from "zod";

/**
 * Request schema for POST /api/quota/check
 */
export const CheckQuotaRequestSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
  metric: z.string().min(1, "Metric is required").default("api_call"),
});

/**
 * Response schema for POST /api/quota/check
 * 
 * Success (200): {allow: true, remaining: number}
 * Denied (429): {allow: false, remaining: 0}
 */
export const CheckQuotaResponseSchema = z.object({
  allow: z.boolean(),
  remaining: z.number().int(),
});

export type CheckQuotaRequest = z.infer<typeof CheckQuotaRequestSchema>;
export type CheckQuotaResponse = z.infer<typeof CheckQuotaResponseSchema>;

