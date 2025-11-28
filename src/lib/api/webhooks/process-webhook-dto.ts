/**
 * Webhook Processor DTOs
 * 
 * Request/response schemas and types for webhook processing endpoint.
 * 
 * @module lib/api/webhooks/process-webhook-dto
 */

import { z } from "zod";

/**
 * Process webhook event request schema
 */
export const processWebhookRequestSchema = z.object({
  eventId: z.string().min(1, "eventId is required"),
});

/**
 * Process webhook event response schema
 */
export const processWebhookResponseSchema = z.object({
  converged: z.boolean(),
});

/**
 * Request type for processing webhook event
 */
export type ProcessWebhookRequest = z.infer<typeof processWebhookRequestSchema>;

/**
 * Response type for processing webhook event
 */
export type ProcessWebhookResponse = z.infer<typeof processWebhookResponseSchema>;

