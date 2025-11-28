/**
 * Provision DTOs
 * 
 * Request/response schemas and types for Stigg provisioning endpoint.
 * 
 * @module lib/api/stigg/provision-dto
 */

import { z } from "zod";

/**
 * Provision request schema
 */
export const provisionRequestSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  subscriptionId: z.string().min(1, "subscriptionId is required"),
});

/**
 * Provision response schema
 */
export const provisionResponseSchema = z.object({
  provisioned: z.boolean(),
});

/**
 * Request type for provisioning
 */
export type ProvisionRequest = z.infer<typeof provisionRequestSchema>;

/**
 * Response type for provisioning
 */
export type ProvisionResponse = z.infer<typeof provisionResponseSchema>;

