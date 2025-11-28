/**
 * Usage Repository
 * 
 * Data access layer for usage operations.
 * Handles database interactions for usage counters and records.
 * 
 * @module lib/db/repositories/usage-repository
 */

import { db } from "../../db";
import { OrgCreationError } from "../../errors/org-errors";

export interface UsageCounterRecord {
  id: string;
  clerkOrgId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  metric: string;
  included: number;
  used: number;
  organizationId: string;
  subscriptionId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Formats a date to period key (YYYY-MM format)
 * 
 * @param date - Date to format
 * @returns Period key string (YYYY-MM)
 */
export function formatPeriodKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Upserts a usage counter
 * 
 * If a counter exists for the given clerkOrgId, periodKey, and metric,
 * it updates the included value but preserves the used value.
 * If it doesn't exist, it creates a new counter with used: 0.
 * 
 * @param data - Usage counter data
 * @returns Created or updated usage counter record
 * @throws OrgCreationError if database operation fails
 */
export async function upsertUsageCounter(data: {
  organizationId: string;
  clerkOrgId: string;
  subscriptionId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  metric: string;
  included: number;
}): Promise<UsageCounterRecord> {
  try {
    // Upsert: update if exists, create if not
    // Preserve existing 'used' value if counter already exists
    const counter = await db.usageCounter.upsert({
      where: {
        clerkOrgId_periodKey_metric: {
          clerkOrgId: data.clerkOrgId,
          periodKey: data.periodKey,
          metric: data.metric,
        },
      },
      update: {
        // Update included quota but preserve used value
        included: data.included,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        subscriptionId: data.subscriptionId,
        organizationId: data.organizationId,
      },
      create: {
        organizationId: data.organizationId,
        clerkOrgId: data.clerkOrgId,
        subscriptionId: data.subscriptionId,
        periodKey: data.periodKey,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        metric: data.metric,
        included: data.included,
        used: 0, // Start with 0 used
      },
    });

    return counter;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to upsert usage counter: ${data.clerkOrgId}/${data.periodKey}/${data.metric}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Finds a usage counter by unique key
 * 
 * @param clerkOrgId - Clerk organization ID
 * @param periodKey - Period key (YYYY-MM)
 * @param metric - Metric name (e.g., 'api_call')
 * @returns Usage counter record or null if not found
 */
export async function findUsageCounter(
  clerkOrgId: string,
  periodKey: string,
  metric: string
): Promise<UsageCounterRecord | null> {
  return db.usageCounter.findUnique({
    where: {
      clerkOrgId_periodKey_metric: {
        clerkOrgId,
        periodKey,
        metric,
      },
    },
  });
}

/**
 * Finds usage counters for an organization
 * 
 * @param organizationId - Internal organization ID
 * @returns Array of usage counter records
 */
export async function findUsageCountersByOrganizationId(
  organizationId: string
): Promise<UsageCounterRecord[]> {
  return db.usageCounter.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      periodKey: "desc",
    },
  });
}

export interface UsageRecordRecord {
  id: string;
  clerkOrgId: string;
  metric: string;
  value: number;
  occurredAt: Date;
  metadata: unknown;
  organizationId: string;
  subscriptionId: string;
  usageCounterId: string;
  createdAt: Date;
}

/**
 * Atomically increments the used value of a usage counter
 * 
 * @param counterId - Usage counter ID
 * @param value - Value to increment by (must be positive)
 * @returns Updated usage counter record
 * @throws OrgCreationError if database operation fails
 */
export async function incrementUsageCounter(
  counterId: string,
  value: number
): Promise<UsageCounterRecord> {
  if (value <= 0) {
    throw new OrgCreationError(
      `Invalid increment value: ${value}. Must be positive.`,
      { counterId, value }
    );
  }

  try {
    // Use Prisma's atomic increment
    const counter = await db.usageCounter.update({
      where: { id: counterId },
      data: {
        used: {
          increment: value,
        },
      },
    });

    return counter;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to increment usage counter: ${counterId}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Creates a usage record with metadata for idempotency
 * 
 * @param data - Usage record data
 * @returns Created usage record
 * @throws OrgCreationError if database operation fails
 */
export async function createUsageRecord(data: {
  organizationId: string;
  clerkOrgId: string;
  subscriptionId: string;
  usageCounterId: string;
  metric: string;
  value: number;
  occurredAt: Date;
  metadata: { request_id: string };
}): Promise<UsageRecordRecord> {
  try {
    const record = await db.usageRecord.create({
      data: {
        organizationId: data.organizationId,
        clerkOrgId: data.clerkOrgId,
        subscriptionId: data.subscriptionId,
        usageCounterId: data.usageCounterId,
        metric: data.metric,
        value: data.value,
        occurredAt: data.occurredAt,
        metadata: data.metadata,
      },
    });

    return record;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to create usage record: ${data.metadata.request_id}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Finds a usage record by request_id in metadata
 * 
 * @param requestId - Request ID to search for
 * @returns Usage record or null if not found
 */
export async function findUsageRecordByRequestId(
  requestId: string
): Promise<UsageRecordRecord | null> {
  try {
    // Query UsageRecord where metadata.request_id equals requestId
    const records = await db.usageRecord.findMany({
      where: {
        metadata: {
          path: ["request_id"],
          equals: requestId,
        },
      },
      take: 1,
    });

    return records.length > 0 ? records[0] : null;
  } catch (error) {
    // If JSON path query fails, return null (record doesn't exist)
    return null;
  }
}

