/**
 * Webhook Repository
 * 
 * Data access layer for webhook operations.
 * Handles database interactions for webhook queue.
 * 
 * @module lib/db/repositories/webhook-repository
 */

import { db } from "../../db";
import { ApplicationError } from "../../utils/errors";

export interface WebhookQueueRecord {
  id: string;
  eventId: string;
  eventType: string;
  processed: boolean;
  payload: unknown;
  createdAt: Date;
  processedAt: Date | null;
}

/**
 * Upserts a webhook event to the queue (idempotent on eventId)
 * 
 * @param data - Webhook event data
 * @returns Webhook queue record
 */
export async function upsertWebhookEvent(data: {
  eventId: string;
  eventType: string;
  payload: unknown;
}): Promise<WebhookQueueRecord> {
  try {
    const webhookEvent = await db.webhookQueue.upsert({
      where: {
        eventId: data.eventId,
      },
      update: {
        // Don't update if already exists (idempotent)
        // Only update if payload changed (optional - for now we keep original)
      },
      create: {
        eventId: data.eventId,
        eventType: data.eventType,
        payload: data.payload as any, // Prisma Json type
        processed: false,
      },
    });
    return webhookEvent;
  } catch (error) {
    throw new ApplicationError(
      "WEBHOOK_QUEUE_UPSERT_ERROR",
      `Failed to upsert webhook event: ${data.eventId}`,
      500,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Finds a webhook event by event ID
 * 
 * @param eventId - Stripe event ID
 * @returns Webhook queue record or null if not found
 */
export async function findWebhookEvent(eventId: string): Promise<WebhookQueueRecord | null> {
  try {
    const webhookEvent = await db.webhookQueue.findUnique({
      where: {
        eventId,
      },
    });
    return webhookEvent;
  } catch (error) {
    throw new ApplicationError(
      "WEBHOOK_QUEUE_FIND_ERROR",
      `Failed to find webhook event: ${eventId}`,
      500,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Marks a webhook event as processed
 * 
 * @param eventId - Stripe event ID
 * @returns Updated webhook queue record
 */
export async function markWebhookProcessed(eventId: string): Promise<WebhookQueueRecord> {
  try {
    const webhookEvent = await db.webhookQueue.update({
      where: {
        eventId,
      },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
    return webhookEvent;
  } catch (error) {
    throw new ApplicationError(
      "WEBHOOK_QUEUE_UPDATE_ERROR",
      `Failed to mark webhook event as processed: ${eventId}`,
      500,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

