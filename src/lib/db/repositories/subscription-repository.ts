/**
 * Subscription Repository
 * 
 * Data access layer for subscription operations.
 * Handles database interactions for subscription entities.
 * 
 * @module lib/db/repositories/subscription-repository
 */

import { db } from "../../db";
import { OrgCreationError } from "../../errors/org-errors";

export interface SubscriptionRecord {
  id: string;
  clerkOrgId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planCode: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a new subscription record
 * 
 * @param data - Subscription data to create
 * @returns Created subscription record
 * @throws OrgCreationError if database operation fails
 */
export async function createSubscription(data: {
  organizationId: string;
  clerkOrgId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planCode: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
}): Promise<SubscriptionRecord> {
  try {
    const subscription = await db.subscription.create({
      data: {
        organizationId: data.organizationId,
        clerkOrgId: data.clerkOrgId,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        planCode: data.planCode,
        stripePriceId: data.stripePriceId,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialEndsAt: data.trialEndsAt,
      },
    });

    return subscription;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error && 'code' in error ? { code: (error as any).code, meta: (error as any).meta } : {};
    throw new OrgCreationError(
      `Failed to create subscription: ${data.stripeSubscriptionId}`,
      { originalError: errorMessage, ...errorDetails }
    );
  }
}

/**
 * Finds a subscription by internal ID
 * 
 * @param id - Internal subscription ID
 * @returns Subscription record or null if not found
 */
export async function findSubscriptionById(
  id: string
): Promise<SubscriptionRecord | null> {
  return db.subscription.findUnique({
    where: {
      id,
    },
  });
}

/**
 * Finds a subscription by Stripe subscription ID
 * 
 * @param stripeSubscriptionId - Stripe subscription ID
 * @returns Subscription record or null if not found
 */
export async function findSubscriptionByStripeSubscriptionId(
  stripeSubscriptionId: string
): Promise<SubscriptionRecord | null> {
  return db.subscription.findUnique({
    where: {
      stripeSubscriptionId,
    },
  });
}

/**
 * Finds subscriptions by organization ID
 * 
 * @param organizationId - Internal organization ID
 * @returns Array of subscription records
 */
export async function findSubscriptionsByOrganizationId(
  organizationId: string
): Promise<SubscriptionRecord[]> {
  return db.subscription.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Finds active subscription for organization
 * 
 * @param organizationId - Internal organization ID
 * @returns Active subscription or null if not found
 */
export async function findActiveSubscriptionByOrganizationId(
  organizationId: string
): Promise<SubscriptionRecord | null> {
  return db.subscription.findFirst({
    where: {
      organizationId,
      status: {
        in: ["active", "trialing"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Updates a subscription from Stripe webhook event data
 * 
 * @param stripeSubscriptionId - Stripe subscription ID
 * @param data - Subscription update data from Stripe
 * @returns Updated subscription record
 */
export async function updateSubscriptionFromStripe(
  stripeSubscriptionId: string,
  data: {
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEndsAt?: Date | null;
  }
): Promise<SubscriptionRecord> {
  try {
    const subscription = await db.subscription.update({
      where: {
        stripeSubscriptionId,
      },
      data: {
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialEndsAt: data.trialEndsAt ?? null,
        updatedAt: new Date(),
      },
    });
    return subscription;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to update subscription from Stripe: ${stripeSubscriptionId}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

