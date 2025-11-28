/**
 * Organization Repository
 * 
 * Data access layer for organization operations.
 * Handles database interactions for organization entities.
 * 
 * @module lib/db/repositories/org-repository
 */

import { db } from "../../db";
import { OrgCreationError } from "../../errors/org-errors";

export interface OrganizationRecord {
  id: string;
  clerkOrgId: string;
  name: string;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Upserts an organization by Clerk org ID
 * Creates new organization if doesn't exist, returns existing if it does
 * Idempotent operation - safe to call multiple times with same clerkOrgId
 * 
 * @param clerkOrgId - Clerk organization ID
 * @returns Organization record with internal orgId
 * @throws OrgCreationError if database operation fails
 */
export async function upsertOrganizationByClerkOrgId(
  clerkOrgId: string
): Promise<OrganizationRecord> {
  try {
    const organization = await db.organization.upsert({
      where: {
        clerkOrgId,
      },
      update: {
        // No updates needed on existing org for now
        // updatedAt is automatically updated by Prisma
      },
      create: {
        clerkOrgId,
        name: `Organization ${clerkOrgId}`, // Default name, can be updated later
      },
    });

    return organization;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to create or retrieve organization for Clerk org ID: ${clerkOrgId}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Finds an organization by internal ID
 * 
 * @param orgId - Internal organization ID
 * @returns Organization record or null if not found
 */
export async function findOrganizationById(
  orgId: string
): Promise<OrganizationRecord | null> {
  return db.organization.findUnique({
    where: {
      id: orgId,
    },
  });
}

/**
 * Finds an organization by Clerk org ID
 * 
 * @param clerkOrgId - Clerk organization ID
 * @returns Organization record or null if not found
 */
export async function findOrganizationByClerkOrgId(
  clerkOrgId: string
): Promise<OrganizationRecord | null> {
  return db.organization.findUnique({
    where: {
      clerkOrgId,
    },
  });
}

/**
 * Updates organization with Stripe customer ID
 * 
 * @param orgId - Internal organization ID
 * @param stripeCustomerId - Stripe customer ID to set
 * @returns Updated organization record
 * @throws OrgCreationError if update fails
 */
export async function updateOrganizationStripeCustomerId(
  orgId: string,
  stripeCustomerId: string
): Promise<OrganizationRecord> {
  try {
    const organization = await db.organization.update({
      where: {
        id: orgId,
      },
      data: {
        stripeCustomerId,
      },
    });

    return organization;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to update organization with Stripe customer ID: ${orgId}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

