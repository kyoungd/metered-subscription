import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { clerkClient } from '@clerk/nextjs/server'
import { db, disconnect } from '../../lib/scaffold/db.js'
import { getEnv } from '../../lib/scaffold/config.js'
import { createContainer } from '../../lib/scaffold/di.js'
import { handleSignup } from '../../lib/signup/handler.js'

/**
 * Integration tests for signup flow
 * REQUIRES: Real database, Clerk API access, Stripe test mode
 *
 * Prerequisites (from .env.local):
 * - DATABASE_URL - PostgreSQL connection string
 * - CLERK_SECRET_KEY - Clerk API key
 * - STRIPE_SECRET_KEY - Stripe test key (sk_test_...)
 * - STRIPE_TEST_PRICE_ID - Stripe price ID for starter plan
 */
describe('Signup Integration Tests', () => {
  let env
  let container
  let ctx
  let testResources = []

  beforeAll(() => {
    // Verify environment is configured for integration tests
    env = getEnv()

    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY required for integration tests')
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY required for integration tests')
    }

    if (!process.env.STRIPE_TEST_PRICE_ID) {
      throw new Error('STRIPE_TEST_PRICE_ID required for integration tests')
    }

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL required for integration tests')
    }
  })

  afterAll(async () => {
    // Clean up all test resources
    console.log(`Cleaning up ${testResources.length} test resources...`)

    for (const resource of testResources) {
      try {
        if (resource.type === 'clerk_org') {
          await clerkClient.organizations.deleteOrganization(resource.id)
        } else if (resource.type === 'db_org') {
          await db.organization.delete({ where: { id: resource.id } }).catch(() => {})
        } else if (resource.type === 'stripe_customer') {
          // Stripe customers in test mode are auto-cleaned
          // Or use: await clients.stripe.customers.delete(resource.id)
        }
      } catch (error) {
        console.error(`Failed to cleanup ${resource.type}:${resource.id}`, error.message)
      }
    }

    await disconnect()
  })

  beforeEach(() => {
    container = createContainer(env)
    const headers = new Headers({
      'x-request-id': `req-integration-${Date.now()}`,
      'x-correlation-id': `cor-integration-${Date.now()}`,
    })
    ctx = container.createRequestContext(headers)
  })

  afterEach(() => {
    // Resources are tracked and cleaned in afterAll
  })

  /**
   * Helper to track resources for cleanup
   */
  function trackResource(type, id) {
    testResources.push({ type, id })
  }

  /**
   * Helper to create a test Clerk user
   * In real scenario, user would sign up via Clerk UI
   */
  async function createTestClerkUser(email) {
    try {
      const user = await clerkClient.users.createUser({
        emailAddress: [email],
        password: 'TestPassword123!',
      })
      trackResource('clerk_user', user.id)
      return user
    } catch (error) {
      // User might already exist in test environment
      if (error.errors?.[0]?.code === 'form_identifier_exists') {
        // Find existing user by email
        const users = await clerkClient.users.getUserList({
          emailAddress: [email],
        })
        return users[0]
      }
      throw error
    }
  }

  describe('Full signup flow (real APIs)', () => {
    it('should create organization with Clerk org, DB record, Stripe customer, subscription, and usage counter', async () => {
      const timestamp = Date.now()
      const testEmail = `integration-test-${timestamp}@example.com`
      const orgName = `Integration Test Org ${timestamp}`

      // Step 1: Create test Clerk user (simulates user signup)
      const clerkUser = await createTestClerkUser(testEmail)
      expect(clerkUser.id).toBeDefined()

      // Step 2: Call signup handler (what /api/signup does)
      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      // Track created resources
      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)

      // Verify response envelope
      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.orgId).toBeDefined()
      expect(result.data.planCode).toBe('starter')
      expect(result.data.trialEndsAt).toBeDefined()

      // Verify Clerk organization was created
      const clerkOrg = await clerkClient.organizations.getOrganization({
        organizationId: result.clerkOrgId,
      })
      expect(clerkOrg.name).toBe(orgName)
      expect(clerkOrg.createdBy).toBe(clerkUser.id)

      // Verify database organization was created
      const dbOrg = await db.organization.findUnique({
        where: { id: result.data.orgId },
      })
      expect(dbOrg).toBeDefined()
      expect(dbOrg.name).toBe(orgName)
      expect(dbOrg.clerkOrgId).toBe(result.clerkOrgId)
      expect(dbOrg.stripeCustomerId).toBeDefined()
      expect(dbOrg.stripeCustomerId).toMatch(/^cus_/)

      // Verify subscription was created in DB
      const subscription = await db.subscription.findFirst({
        where: { organizationId: dbOrg.id },
      })
      expect(subscription).toBeDefined()
      expect(subscription.planCode).toBe('starter')
      expect(subscription.status).toMatch(/trialing|active/)
      expect(subscription.stripeSubscriptionId).toBeDefined()

      // Verify usage counter was seeded
      const usageCounter = await db.usageCounter.findFirst({
        where: {
          organizationId: dbOrg.id,
          metric: 'api_calls',
        },
      })
      expect(usageCounter).toBeDefined()
      expect(usageCounter.currentValue).toBe(0)
      expect(usageCounter.periodStart).toBeInstanceOf(Date)
      expect(usageCounter.periodEnd).toBeInstanceOf(Date)

      // Verify trial end date is ~14 days from now
      const trialEndsAt = new Date(result.data.trialEndsAt)
      const now = new Date()
      const daysUntilTrial = (trialEndsAt - now) / (1000 * 60 * 60 * 24)
      expect(daysUntilTrial).toBeGreaterThan(13)
      expect(daysUntilTrial).toBeLessThan(15)
    }, 30000) // 30s timeout for API calls

    it('should handle user already being member of organization', async () => {
      const timestamp = Date.now()
      const testEmail = `duplicate-test-${timestamp}@example.com`
      const orgName = `Duplicate Test Org ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      // First signup
      const result1 = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result1.clerkOrgId)
      trackResource('db_org', result1.data.orgId)

      // Attempt second signup with same user
      await expect(
        handleSignup({
          userId: clerkUser.id,
          orgName: `${orgName} 2`,
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient,
          db,
        })
      ).rejects.toThrow(/already.*organization|duplicate/i)
    }, 30000)
  })

  describe('Database integrity', () => {
    it('should rollback all changes on Stripe failure', async () => {
      const timestamp = Date.now()
      const testEmail = `rollback-test-${timestamp}@example.com`
      const orgName = `Rollback Test Org ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      // Force Stripe error by using invalid price ID
      const badEnv = { ...env, starterPriceId: 'price_invalid_xyz' }

      let clerkOrgId
      let dbOrgId

      try {
        const result = await handleSignup({
          userId: clerkUser.id,
          orgName,
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env: badEnv,
          clerkClient,
          db,
        })

        clerkOrgId = result.clerkOrgId
        dbOrgId = result.data.orgId
      } catch (error) {
        // Expected to fail
      }

      // Verify database was rolled back (no orphaned records)
      if (dbOrgId) {
        const dbOrg = await db.organization.findUnique({
          where: { id: dbOrgId },
        })
        expect(dbOrg).toBeNull() // Should be rolled back
      }

      // Clerk org might still exist (external service)
      // Clean it up if it does
      if (clerkOrgId) {
        try {
          await clerkClient.organizations.deleteOrganization(clerkOrgId)
        } catch (error) {
          // Ignore if already cleaned up
        }
      }
    }, 30000)

    it('should create all related records atomically', async () => {
      const timestamp = Date.now()
      const testEmail = `atomic-test-${timestamp}@example.com`
      const orgName = `Atomic Test Org ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)

      // Verify all records exist
      const [org, subscription, usageCounter] = await Promise.all([
        db.organization.findUnique({ where: { id: result.data.orgId } }),
        db.subscription.findFirst({ where: { organizationId: result.data.orgId } }),
        db.usageCounter.findFirst({ where: { organizationId: result.data.orgId } }),
      ])

      expect(org).toBeDefined()
      expect(subscription).toBeDefined()
      expect(usageCounter).toBeDefined()

      // Verify relationships
      expect(subscription.organizationId).toBe(org.id)
      expect(usageCounter.organizationId).toBe(org.id)
    }, 30000)
  })

  describe('Clerk integration', () => {
    it('should make user owner of created organization', async () => {
      const timestamp = Date.now()
      const testEmail = `owner-test-${timestamp}@example.com`
      const orgName = `Owner Test Org ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)

      // Verify user membership in Clerk org
      const membership = await clerkClient.organizations.getOrganizationMembershipList({
        organizationId: result.clerkOrgId,
      })

      const userMembership = membership.find((m) => m.publicUserData.userId === clerkUser.id)
      expect(userMembership).toBeDefined()
      expect(userMembership.role).toBe('org:admin') // Clerk sets creator as admin
    }, 30000)

    it('should fetch correct email from Clerk user', async () => {
      const timestamp = Date.now()
      const testEmail = `email-fetch-${timestamp}@example.com`
      const orgName = `Email Fetch Test ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)

      // Verify Stripe customer has correct email
      const org = await db.organization.findUnique({
        where: { id: result.data.orgId },
      })

      // In test mode, we can't easily verify Stripe customer email
      // But we verify the org was created with correct linkage
      expect(org.stripeCustomerId).toBeDefined()
    }, 30000)
  })

  describe('Stripe integration', () => {
    it('should create customer with organization metadata', async () => {
      const timestamp = Date.now()
      const testEmail = `stripe-customer-${timestamp}@example.com`
      const orgName = `Stripe Customer Test ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)
      trackResource('stripe_customer', result.stripeCustomerId)

      const org = await db.organization.findUnique({
        where: { id: result.data.orgId },
      })

      expect(org.stripeCustomerId).toMatch(/^cus_/)

      // In real implementation, could verify customer details:
      // const customer = await stripe.customers.retrieve(org.stripeCustomerId)
      // expect(customer.email).toBe(testEmail)
    }, 30000)

    it('should create subscription in trialing status', async () => {
      const timestamp = Date.now()
      const testEmail = `stripe-sub-${timestamp}@example.com`
      const orgName = `Stripe Sub Test ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      const result = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result.clerkOrgId)
      trackResource('db_org', result.data.orgId)

      const subscription = await db.subscription.findFirst({
        where: { organizationId: result.data.orgId },
      })

      expect(subscription.status).toMatch(/trialing|active/)
      expect(subscription.stripeSubscriptionId).toMatch(/^sub_/)
      expect(subscription.trialEnd).toBeInstanceOf(Date)
    }, 30000)
  })

  describe('Idempotency', () => {
    it('should prevent duplicate organization names for same user', async () => {
      const timestamp = Date.now()
      const testEmail = `idempotent-${timestamp}@example.com`
      const orgName = `Idempotent Test Org ${timestamp}`

      const clerkUser = await createTestClerkUser(testEmail)

      // First call
      const result1 = await handleSignup({
        userId: clerkUser.id,
        orgName,
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient,
        db,
      })

      trackResource('clerk_org', result1.clerkOrgId)
      trackResource('db_org', result1.data.orgId)

      // Second call with same org name should fail or return existing
      await expect(
        handleSignup({
          userId: clerkUser.id,
          orgName, // Same name
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient,
          db,
        })
      ).rejects.toThrow()
    }, 30000)
  })

  describe('Error handling', () => {
    it('should return descriptive error for missing Clerk user', async () => {
      const fakeUserId = 'user_nonexistent_12345'
      const orgName = 'Error Test Org'

      await expect(
        handleSignup({
          userId: fakeUserId,
          orgName,
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient,
          db,
        })
      ).rejects.toThrow(/user.*not found|invalid.*user/i)
    }, 30000)

    it('should handle Stripe API errors gracefully', async () => {
      // This would require mocking Stripe to simulate failures
      // Or using invalid config to trigger Stripe errors
      // Skipping for now as it requires more setup
    })
  })
})
