import { db } from '../scaffold/db.js'
import { clerkClient } from '@clerk/nextjs/server'

/**
 * Check if user already has an organization in Clerk
 *
 * @param {string} clerkUserId - Clerk user ID
 * @returns {Promise<Object|null>} Organization if exists, null otherwise
 */
export async function getUserOrganization(clerkUserId) {
  if (!clerkUserId) {
    return null
  }

  // Check if user exists in our DB
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  })

  // If user doesn't exist in DB, they haven't completed onboarding
  if (!user) {
    return null
  }

  // Check if user has organization in Clerk
  const clerk = await clerkClient()
  const orgMemberships = await clerk.users.getOrganizationMembershipList({
    userId: clerkUserId,
  })

  // Return first organization if exists
  if (orgMemberships.data && orgMemberships.data.length > 0) {
    return {
      id: orgMemberships.data[0].organization.id,
      name: orgMemberships.data[0].organization.name,
    }
  }

  return null
}
