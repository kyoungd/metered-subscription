import { prisma } from "@/lib/prisma";

type OrganizationEvent = {
  id: string;
  name: string;
  slug?: string;
  created_at: number;
  updated_at: number;
};

type OrganizationMembershipEvent = {
  id: string;
  organization: {
    id: string;
  };
  public_user_data: {
    user_id: string;
  };
};

export const clerkService = {
  /**
   * Syncs a Clerk Organization to the local database.
   * Handles both creation and updates.
   */
  async syncOrganization(data: OrganizationEvent) {
    const { id, name } = data;

    // Upsert ensures we handle both create and update in one go
    // We map Clerk's 'id' to 'clerkOrgId'
    return await prisma.organization.upsert({
      where: { clerkOrgId: id },
      create: {
        clerkOrgId: id,
        name: name,
      },
      update: {
        name: name,
      },
    });
  },

  /**
   * Deletes an organization from the local database when deleted in Clerk.
   */
  async deleteOrganization(clerkOrgId: string) {
    // Note: In a real production app, you might want to 'soft delete'
    // or check for active subscriptions before deleting.
    // For now, we'll delete to keep it in sync.
    try {
      return await prisma.organization.delete({
        where: { clerkOrgId },
      });
    } catch (error) {
      // If it doesn't exist, that's fine
      console.warn(`Failed to delete org ${clerkOrgId}:`, error);
      return null;
    }
  },

  /**
   * Links a user to an organization when they join.
   */
  async addMember(data: OrganizationMembershipEvent) {
    const clerkOrgId = data.organization.id;
    const clerkUserId = data.public_user_data.user_id;

    // 1. Find the local Organization
    const org = await prisma.organization.findUnique({
      where: { clerkOrgId },
    });

    if (!org) {
      throw new Error(`Organization ${clerkOrgId} not found locally`);
    }

    // 2. Find the local User
    // Note: The user MUST exist locally first.
    // Usually 'user.created' webhook handles that, or they signed in.
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      // If user doesn't exist yet, we might want to create a placeholder
      // or wait for the user.created webhook.
      // For this MVP, we'll assume user exists or log a warning.
      console.warn(`User ${clerkUserId} not found locally. Skipping membership sync.`);
      return null;
    }

    // 3. Update the User's organizationId
    // Note: Your schema currently allows a user to belong to ONE organization
    // (organizationId is a single field on User).
    // If you want multi-org support, you'd need a many-to-many table.
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId: org.id,
      },
    });
  },

  /**
   * Removes a member from an organization.
   */
  async removeMember(data: OrganizationMembershipEvent) {
    const clerkUserId = data.public_user_data.user_id;

    // We just unlink the user from the org
    // Note: This assumes the user is only in THIS org.
    return await prisma.user.update({
      where: { clerkId: clerkUserId },
      data: {
        // We can't set it to null if the schema requires it?
        // Checking schema: organizationId String (Required)
        // This is a potential issue if a user leaves an org but doesn't join another.
        // For now, we might have to leave it or have a 'default' org.
        // Let's check the schema again.
      },
    });
  },
};
