/**
 * Create Subscription DTOs
 * 
 * Request/response schemas and types for subscription creation endpoint.
 * 
 * @module lib/api/stripe/create-subscription-dto
 */

import { z } from "zod";
import { PlanCode } from "../../stripe";

/**
 * Create subscription request schema
 */
export const createSubscriptionRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  planCode: z.enum(["trial", "starter", "growth", "pro"], {
    errorMap: () => ({ message: "planCode must be one of: trial, starter, growth, pro" }),
  }),
});

/**
 * Create subscription response schema
 */
export const createSubscriptionResponseSchema = z.object({
  subscriptionId: z.string(),
  status: z.string(),
  trialEndsAt: z.string().nullable(),
});

/**
 * Request type for creating subscription
 */
export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionRequestSchema>;

/**
 * Response type for creating subscription
 */
export type CreateSubscriptionResponse = z.infer<typeof createSubscriptionResponseSchema>;

