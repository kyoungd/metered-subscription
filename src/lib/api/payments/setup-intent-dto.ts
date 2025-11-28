/**
 * SetupIntent DTOs
 * 
 * Request/response schemas and types for SetupIntent creation endpoint.
 * 
 * @module lib/api/payments/setup-intent-dto
 */

import { z } from "zod";

/**
 * Create SetupIntent request schema
 */
export const createSetupIntentRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

/**
 * Create SetupIntent response schema
 */
export const createSetupIntentResponseSchema = z.object({
  clientSecret: z.string().min(1, "clientSecret is required"),
});

/**
 * Request type for creating SetupIntent
 */
export type CreateSetupIntentRequest = z.infer<typeof createSetupIntentRequestSchema>;

/**
 * Response type for creating SetupIntent
 */
export type CreateSetupIntentResponse = z.infer<typeof createSetupIntentResponseSchema>;

