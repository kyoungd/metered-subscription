import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkService } from "@/lib/services/clerk-service";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  const eventType = evt.type;

  console.log(`Received webhook with type ${eventType}`);

  try {
    switch (eventType) {
      case "organization.created":
      case "organization.updated":
        await clerkService.syncOrganization({
          id: evt.data.id,
          name: evt.data.name,
          slug: evt.data.slug,
          created_at: evt.data.created_at,
          updated_at: evt.data.updated_at,
        });
        break;

      case "organization.deleted":
        if (evt.data.id) {
          await clerkService.deleteOrganization(evt.data.id);
        }
        break;

      case "organizationMembership.created":
        // @ts-ignore - Types might be slightly off for membership events in the SDK vs Reality
        await clerkService.addMember(evt.data);
        break;

      case "organizationMembership.deleted":
        // @ts-ignore
        await clerkService.removeMember(evt.data);
        break;

      default:
        console.log(`Unhandled webhook type: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error processing webhook ${eventType}:`, error);
    return new Response("Error processing webhook", { status: 500 });
  }

  return new Response("", { status: 200 });
}
