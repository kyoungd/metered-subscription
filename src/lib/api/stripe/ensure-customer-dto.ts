/**
 * Ensure Stripe Customer DTOs
 * 
 * Request/response schemas and types for Stripe customer ensure endpoint.
 * 
 * @module lib/api/stripe/ensure-customer-dto
 */

import { z } from "zod";

/**
 * Ensure Stripe customer request schema
 */
export const ensureCustomerRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("Invalid email format"),
});

/**
 * Ensure Stripe customer response schema
 */
export const ensureCustomerResponseSchema = z.object({
  stripeCustomerId: z.string(),
});

/**
 * Request type for ensuring Stripe customer
 */
export type EnsureCustomerRequest = z.infer<typeof ensureCustomerRequestSchema>;

/**
 * Response type for ensuring Stripe customer
 */
export type EnsureCustomerResponse = z.infer<typeof ensureCustomerResponseSchema>;

