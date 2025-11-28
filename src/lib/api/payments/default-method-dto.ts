/**
 * Default Payment Method DTOs
 * 
 * Request/response schemas and types for setting default payment method endpoint.
 * 
 * @module lib/api/payments/default-method-dto
 */

import { z } from "zod";

/**
 * Set default payment method request schema
 */
export const setDefaultPaymentMethodRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  paymentMethodId: z.string().min(1, "paymentMethodId is required"),
});

/**
 * Set default payment method response schema
 */
export const setDefaultPaymentMethodResponseSchema = z.object({
  ok: z.boolean(),
});

/**
 * Request type for setting default payment method
 */
export type SetDefaultPaymentMethodRequest = z.infer<typeof setDefaultPaymentMethodRequestSchema>;

/**
 * Response type for setting default payment method
 */
export type SetDefaultPaymentMethodResponse = z.infer<typeof setDefaultPaymentMethodResponseSchema>;

