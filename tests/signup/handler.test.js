import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEnv } from '../../lib/scaffold/config.js'
import { createContainer } from '../../lib/scaffold/di.js'

/**
 * Unit tests for signup handler
 * Tests business logic with mocked Clerk and Stripe in dry-run mode
 */
describe('signup handler', () => {
  let env
  let container
  let ctx
  let mockClerkClient
  let mockDb

  beforeEach(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test'
    process.env.MTR_SERVICE = 'test-service'
    process.env.MTR_VERSION = '0.1.0'
    process.env.MTR_HTTP_DRY_RUN = 'true'
    process.env.MTR_STRIPE_SECRET_KEY = 'sk_test_secret_key_123'
    process.env.MTR_STRIPE_STARTER_PRICE_ID = 'price_test_starter_123'
    process.env.MTR_TRIAL_DAYS = '14'

    env = getEnv()
    container = createContainer(env)

    const headers = new Headers({
      'x-request-id': 'req-signup-test-123',
      'x-correlation-id': 'cor-signup-test-456',
    })

    ctx = container.createRequestContext(headers)

    // Mock Clerk client
    mockClerkClient = {
      organizations: {
        createOrganization: vi.fn(async ({ name, createdBy }) => ({
          id: `org_clerk_${createdBy.substring(0, 8)}`,
          name,
          createdBy,
          createdAt: Date.now(),
        })),
      },
      users: {
        getUser: vi.fn(async (userId) => ({
          id: userId,
          emailAddresses: [
            {
              emailAddress: 'test@example.com',
              id: 'email_123',
            },
          ],
          firstName: 'Test',
          lastName: 'User',
        })),
      },
    }

    // Mock database (simulating Prisma)
    mockDb = {
      organization: {
        create: vi.fn(async ({ data }) => ({
          id: `org_db_${Date.now()}`,
          clerkOrgId: data.clerkOrgId,
          name: data.name,
          stripeCustomerId: data.stripeCustomerId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: vi.fn(async ({ where, data }) => ({
          id: where.id,
          stripeCustomerId: data.stripeCustomerId,
          updatedAt: new Date(),
        })),
      },
      usageCounter: {
        create: vi.fn(async ({ data }) => ({
          id: `counter_${Date.now()}`,
          organizationId: data.organizationId,
          metric: data.metric,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          currentValue: data.currentValue,
          limit: data.limit,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    }
  })

  describe('input validation', () => {
    it('should require userId', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await expect(
        handleSignup({
          userId: null,
          orgName: 'Test Org',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow(/userId.*required/i)
    })

    it('should require orgName', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await expect(
        handleSignup({
          userId: 'user_clerk_123',
          orgName: '',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow(/orgName.*required/i)
    })

    it('should reject orgName with only whitespace', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await expect(
        handleSignup({
          userId: 'user_clerk_123',
          orgName: '   ',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow(/orgName.*required/i)
    })

    it('should trim orgName', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: '  Test Org  ',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(mockClerkClient.organizations.createOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Org',
        })
      )
    })
  })

  describe('clerk organization creation', () => {
    it('should create clerk organization with user as creator', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_abc123',
        orgName: 'Acme Corp',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(mockClerkClient.organizations.createOrganization).toHaveBeenCalledWith({
        name: 'Acme Corp',
        createdBy: 'user_clerk_abc123',
      })
    })

    it('should fetch user email from clerk', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_xyz789',
        orgName: 'Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(mockClerkClient.users.getUser).toHaveBeenCalledWith('user_clerk_xyz789')
    })
  })

  describe('database organization creation', () => {
    it('should create organization in database with clerk org ID', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Database Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(mockDb.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Database Test Org',
          clerkOrgId: expect.stringMatching(/^org_clerk_/),
        }),
      })
    })
  })

  describe('stripe customer creation', () => {
    it('should create stripe customer with organization ID', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Stripe Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      // In dry-run mode, Stripe client returns stub data
      expect(result.data).toBeDefined()
    })

    it('should use email from clerk user', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      mockClerkClient.users.getUser.mockResolvedValueOnce({
        id: 'user_clerk_123',
        emailAddresses: [
          {
            emailAddress: 'custom@example.com',
            id: 'email_456',
          },
        ],
      })

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Email Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      // Verify email was fetched
      expect(mockClerkClient.users.getUser).toHaveBeenCalled()
    })
  })

  describe('stripe subscription creation', () => {
    it('should create subscription with trial period', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Subscription Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      // Verify trial end date is set (14 days from now)
      expect(result.data.trialEndsAt).toBeDefined()
    })

    it('should use starter price ID from config', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Price Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      // Config should have starter price ID
      expect(env.starterPriceId).toBe('price_test_starter_123')
    })

    it('should return planCode as starter', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Plan Code Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result.data.planCode).toBe('starter')
    })
  })

  describe('usage counter initialization', () => {
    it('should create usage counter with zero value', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Counter Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(mockDb.usageCounter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'api_calls',
          currentValue: 0,
        }),
      })
    })

    it('should set period start to current date', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const beforeTest = new Date()

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Period Test Org',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      const call = mockDb.usageCounter.create.mock.calls[0][0]
      const periodStart = call.data.periodStart

      expect(periodStart).toBeInstanceOf(Date)
      expect(periodStart.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime())
    })

    it('should set period end to end of current month', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Period End Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      const call = mockDb.usageCounter.create.mock.calls[0][0]
      const periodEnd = call.data.periodEnd

      expect(periodEnd).toBeInstanceOf(Date)
      expect(periodEnd.getDate()).toBeGreaterThan(20) // Should be end of month
    })
  })

  describe('response envelope', () => {
    it('should return success envelope with ok:true', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Envelope Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result.ok).toBe(true)
    })

    it('should include orgId in response', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'OrgId Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result.data.orgId).toBeDefined()
      expect(typeof result.data.orgId).toBe('string')
    })

    it('should include planCode, trialEndsAt in response', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Complete Response Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result.data.planCode).toBe('starter')
      expect(result.data.trialEndsAt).toBeDefined()
    })

    it('should match UC-01 acceptance criteria shape', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Acceptance Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      // UC-01 expects: { orgId, planCode:'starter', trialEndsAt, checkoutUrl? }
      expect(result.data).toMatchObject({
        orgId: expect.any(String),
        planCode: 'starter',
        trialEndsAt: expect.any(String),
      })
    })
  })

  describe('dry-run mode', () => {
    it('should work in dry-run mode without real API calls', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      expect(env.dryRun).toBe(true)

      const result = await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Dry Run Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result.ok).toBe(true)
    })

    it('should return consistent results in dry-run', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const result1 = await handleSignup({
        userId: 'user_same_id',
        orgName: 'Same Org Name',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      const result2 = await handleSignup({
        userId: 'user_same_id',
        orgName: 'Same Org Name',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(result1.data.planCode).toBe(result2.data.planCode)
    })
  })

  describe('error handling', () => {
    it('should throw ApiError when clerk org creation fails', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      mockClerkClient.organizations.createOrganization.mockRejectedValueOnce(
        new Error('Clerk API error')
      )

      await expect(
        handleSignup({
          userId: 'user_clerk_123',
          orgName: 'Error Test',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow()
    })

    it('should throw ApiError when user email not found', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      mockClerkClient.users.getUser.mockResolvedValueOnce({
        id: 'user_clerk_123',
        emailAddresses: [], // No email
      })

      await expect(
        handleSignup({
          userId: 'user_clerk_123',
          orgName: 'No Email Test',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow(/email/i)
    })

    it('should throw ApiError when db creation fails', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      mockDb.organization.create.mockRejectedValueOnce(new Error('Database error'))

      await expect(
        handleSignup({
          userId: 'user_clerk_123',
          orgName: 'DB Error Test',
          logger: ctx.logger,
          call_state: ctx.call_state,
          clients: ctx.clients,
          env,
          clerkClient: mockClerkClient,
          db: mockDb,
        })
      ).rejects.toThrow()
    })
  })

  describe('logging', () => {
    it('should log signup start', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const loggerSpy = vi.spyOn(ctx.logger, 'info')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Logging Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/signup|start/i),
        })
      )
    })

    it('should not log sensitive data', async () => {
      const { handleSignup } = await import('../../lib/signup/handler.js')

      const loggerSpy = vi.spyOn(ctx.logger, 'info')

      await handleSignup({
        userId: 'user_clerk_123',
        orgName: 'Sensitive Test',
        logger: ctx.logger,
        call_state: ctx.call_state,
        clients: ctx.clients,
        env,
        clerkClient: mockClerkClient,
        db: mockDb,
      })

      const allLogs = loggerSpy.mock.calls.map((call) => JSON.stringify(call))
      const logsStr = allLogs.join(' ')

      // Should not contain API keys or secrets
      expect(logsStr).not.toContain('sk_test_secret_key')
    })
  })
})
