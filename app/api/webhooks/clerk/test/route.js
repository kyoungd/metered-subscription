import { NextResponse } from 'next/server'

/**
 * POST /api/webhooks/clerk/test
 *
 * Test endpoint to simulate Clerk webhooks with sample payloads
 * Only works in development mode
 */
export async function POST(request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { eventType } = await request.json()

  // Sample payloads based on captured Clerk webhook data
  const samplePayloads = {
    'user.created': {
      id: 'user_test123',
      email_addresses: [{ email_address: 'test@example.com' }],
      public_metadata: {},
      private_metadata: {},
      unsafe_metadata: {},
      created_at: Date.now(),
    },
    'organization.created': {
      id: 'org_test123',
      name: 'Test Organization',
      created_by: 'user_test123',
      public_metadata: {},
      private_metadata: {},
      created_at: Date.now(),
    },
    'organizationMembership.created': {
      id: 'orgmem_test123',
      organization: {
        id: 'org_test123',
        name: 'Test Organization',
      },
      public_user_data: {
        user_id: 'user_test123',
        identifier: 'test@example.com',
      },
      role: 'org:admin',
      created_at: Date.now(),
    },
    'user.updated': {
      id: 'user_test123',
      email_addresses: [{ email_address: 'updated@example.com' }],
      updated_at: Date.now(),
    },
    'organization.updated': {
      id: 'org_test123',
      name: 'Updated Organization Name',
      updated_at: Date.now(),
    },
    'user.deleted': {
      id: 'user_test123',
      deleted: true,
    },
    'organization.deleted': {
      id: 'org_test123',
      deleted: true,
    },
  }

  const payload = samplePayloads[eventType]

  if (!payload) {
    return NextResponse.json(
      {
        error: 'Unknown event type',
        availableTypes: Object.keys(samplePayloads),
      },
      { status: 400 }
    )
  }

  // Call the actual webhook handler
  const webhookUrl = new URL('/api/webhooks/clerk', request.url)

  // Create a mock Svix signature (webhook handler will skip verification in test mode)
  const mockHeaders = {
    'svix-id': `msg_test_${Date.now()}`,
    'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
    'svix-signature': 'test_signature',
    'content-type': 'application/json',
  }

  const webhookPayload = {
    type: eventType,
    data: payload,
    timestamp: Date.now(),
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: mockHeaders,
    body: JSON.stringify(webhookPayload),
  })

  const result = await response.json()

  return NextResponse.json({
    message: 'Test webhook sent',
    eventType,
    payload: webhookPayload,
    response: result,
    status: response.status,
  })
}

/**
 * GET /api/webhooks/clerk/test
 *
 * Returns available test event types
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  return NextResponse.json({
    message: 'Clerk webhook test endpoint',
    usage: 'POST with { "eventType": "user.created" }',
    availableEvents: [
      'user.created',
      'user.updated',
      'user.deleted',
      'organization.created',
      'organization.updated',
      'organization.deleted',
      'organizationMembership.created',
    ],
    examples: [
      {
        description: 'Test user creation',
        curl: 'curl -X POST http://localhost:3000/api/webhooks/clerk/test -H "Content-Type: application/json" -d \'{"eventType":"user.created"}\'',
      },
      {
        description: 'Test organization creation',
        curl: 'curl -X POST http://localhost:3000/api/webhooks/clerk/test -H "Content-Type: application/json" -d \'{"eventType":"organization.created"}\'',
      },
      {
        description: 'Test complete signup flow',
        curl: 'curl -X POST http://localhost:3000/api/webhooks/clerk/test -H "Content-Type: application/json" -d \'{"eventType":"user.created"}\' && curl -X POST http://localhost:3000/api/webhooks/clerk/test -H "Content-Type: application/json" -d \'{"eventType":"organization.created"}\' && curl -X POST http://localhost:3000/api/webhooks/clerk/test -H "Content-Type: application/json" -d \'{"eventType":"organizationMembership.created"}\'',
      },
    ],
  })
}
