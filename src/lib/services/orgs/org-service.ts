/**
 * Organization Service
 * 
 * Business logic layer for organization operations.
 * Validates input, enforces domain rules, and coordinates repository calls.
 * 
 * @module lib/services/orgs/org-service
 */

import { upsertOrganizationByClerkOrgId } from "../../db/repositories/org-repository";
import { OrgValidationError } from "../../errors/org-errors";
import { logger } from "../../utils/logger";

export interface CreateOrganizationResult {
  orgId: string;
}

/**
 * Validates Clerk organization ID format
 * Clerk org IDs follow the pattern: org_[a-zA-Z0-9_]+
 * Note: Clerk IDs can contain underscores in the random portion
 * 
 * @param clerkOrgId - Clerk organization ID to validate
 * @returns True if valid format
 */
export function isValidClerkOrgId(clerkOrgId: string): boolean {
  // Matches org_ followed by at least one alphanumeric or underscore character
  return /^org_[a-zA-Z0-9_]+$/.test(clerkOrgId);
}

/**
 * Creates or retrieves an organization by Clerk org ID
 * Idempotent operation - returns existing org if already created
 * 
 * @param clerkOrgId - Clerk organization ID from authenticated session
 * @returns Object containing internal orgId
 * @throws OrgValidationError if clerkOrgId format is invalid
 */
export async function createOrganization(
  clerkOrgId: string
): Promise<CreateOrganizationResult> {
  // Validate Clerk org ID format
  if (!isValidClerkOrgId(clerkOrgId)) {
    logger.warn("Invalid Clerk org ID format", { clerkOrgId });
    throw new OrgValidationError(
      `Invalid Clerk organization ID format: ${clerkOrgId}. Expected format: org_[alphanumeric]`
    );
  }

  logger.info("Creating or retrieving organization", { clerkOrgId });

  // Upsert organization (idempotent)
  const organization = await upsertOrganizationByClerkOrgId(clerkOrgId);

  logger.info("Organization created or retrieved successfully", {
    orgId: organization.id,
    clerkOrgId,
  });

  return {
    orgId: organization.id,
  };
}

/**
 * Retrieves organization by Clerk org ID
 * 
 * @param clerkOrgId - Clerk organization ID
 * @returns Organization ID or null if not found
 */
export async function getOrganizationByClerkOrgId(
  clerkOrgId: string
): Promise<string | null> {
  if (!isValidClerkOrgId(clerkOrgId)) {
    return null;
  }

  const { findOrganizationByClerkOrgId } = await import("../../db/repositories/org-repository");
  const organization = await findOrganizationByClerkOrgId(clerkOrgId);

  return organization?.id ?? null;
}

