/**
 * ID Generation Utilities
 * 
 * Provides ID generation utilities.
 * Note: Prisma uses cuid() by default in schema, this is for application-level ID generation.
 * 
 * @module lib/utils/ids
 */

import { randomUUID } from "crypto";

/**
 * Generates a new UUID v4
 * 
 * @returns A new UUID string
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Generates a new organization ID
 * Note: In practice, Prisma auto-generates this via @default(cuid())
 * This is here for consistency and potential future use cases
 * 
 * @returns A new UUID string
 */
export function generateOrganizationId(): string {
  return randomUUID();
}

/**
 * Generates a new user ID
 * 
 * @returns A new UUID string
 */
export function generateUserId(): string {
  return randomUUID();
}

/**
 * Validates if a string is a valid UUID format
 * 
 * @param id - String to validate
 * @returns True if valid UUID format
 */
export function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

