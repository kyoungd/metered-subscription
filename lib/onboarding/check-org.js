import { db } from '../scaffold/db.js'

/**
 * Check if user already has an organization
 *
 * @param {string} clerkUserId - Clerk user ID
 * @returns {Promise<Object|null>} Organization if exists, null otherwise
 */
export async function getUserOrganization(clerkUserId) {
  if (!clerkUserId) {
    return null
  }

  // Find user by clerkId
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      organization: true,
    },
  })

  return user?.organization || null
}
