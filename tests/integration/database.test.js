import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, ping, withTx, disconnect } from '../../lib/scaffold/db.js'

describe('Database Integration', () => {
  beforeAll(async () => {
    // Verify database connection before running tests
    const canConnect = await ping()
    if (!canConnect) {
      throw new Error('Cannot connect to database')
    }
  })

  afterAll(async () => {
    // Clean up test data and disconnect
    await disconnect()
  })

  describe('Connection', () => {
    it('should ping database successfully', async () => {
      const result = await ping()
      expect(result).toBe(true)
    })

    it('should have Prisma client available', () => {
      expect(db).toBeDefined()
      expect(db.$queryRaw).toBeDefined()
      expect(db.$transaction).toBeDefined()
    })
  })

  describe('Organization CRUD', () => {
    let testOrg

    afterEach(async () => {
      // Clean up test organization
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should create an organization', async () => {
      testOrg = await db.organization.create({
        data: {
          name: 'Test Org',
        },
      })

      expect(testOrg).toBeDefined()
      expect(testOrg.id).toBeDefined()
      expect(testOrg.name).toBe('Test Org')
      expect(testOrg.stripeCustomerId).toBeNull()
      expect(testOrg.createdAt).toBeInstanceOf(Date)
    })

    it('should find organization by id', async () => {
      testOrg = await db.organization.create({
        data: { name: 'Find Test Org' },
      })

      const found = await db.organization.findUnique({
        where: { id: testOrg.id },
      })

      expect(found).toBeDefined()
      expect(found.id).toBe(testOrg.id)
      expect(found.name).toBe('Find Test Org')
    })

    it('should update organization', async () => {
      testOrg = await db.organization.create({
        data: { name: 'Update Test Org' },
      })

      const updated = await db.organization.update({
        where: { id: testOrg.id },
        data: { stripeCustomerId: 'cus_test_123' },
      })

      expect(updated.stripeCustomerId).toBe('cus_test_123')
    })

    it('should delete organization', async () => {
      testOrg = await db.organization.create({
        data: { name: 'Delete Test Org' },
      })

      await db.organization.delete({
        where: { id: testOrg.id },
      })

      const found = await db.organization.findUnique({
        where: { id: testOrg.id },
      })

      expect(found).toBeNull()
      testOrg = null
    })
  })

  describe('User CRUD', () => {
    let testOrg
    let testUser

    beforeEach(async () => {
      testOrg = await db.organization.create({
        data: { name: 'User Test Org' },
      })
    })

    afterEach(async () => {
      // Clean up test user and organization
      if (testUser) {
        await db.user.delete({ where: { id: testUser.id } }).catch(() => {})
        testUser = null
      }
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should create a user with organization', async () => {
      testUser = await db.user.create({
        data: {
          clerkId: 'clerk_test_123',
          email: 'test@example.com',
          organizationId: testOrg.id,
        },
      })

      expect(testUser).toBeDefined()
      expect(testUser.clerkId).toBe('clerk_test_123')
      expect(testUser.email).toBe('test@example.com')
      expect(testUser.organizationId).toBe(testOrg.id)
    })

    it('should find user with organization relation', async () => {
      testUser = await db.user.create({
        data: {
          clerkId: 'clerk_test_456',
          email: 'relation@example.com',
          organizationId: testOrg.id,
        },
      })

      const found = await db.user.findUnique({
        where: { id: testUser.id },
        include: { organization: true },
      })

      expect(found.organization).toBeDefined()
      expect(found.organization.id).toBe(testOrg.id)
      expect(found.organization.name).toBe('User Test Org')
    })

    it('should cascade delete users when organization is deleted', async () => {
      testUser = await db.user.create({
        data: {
          clerkId: 'clerk_cascade_test',
          email: 'cascade@example.com',
          organizationId: testOrg.id,
        },
      })

      await db.organization.delete({ where: { id: testOrg.id } })

      const foundUser = await db.user.findUnique({
        where: { id: testUser.id },
      })

      expect(foundUser).toBeNull()
      testUser = null
      testOrg = null
    })
  })

  describe('Subscription CRUD', () => {
    let testOrg
    let testSub

    beforeEach(async () => {
      testOrg = await db.organization.create({
        data: { name: 'Subscription Test Org' },
      })
    })

    afterEach(async () => {
      if (testSub) {
        await db.subscription.delete({ where: { id: testSub.id } }).catch(() => {})
        testSub = null
      }
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should create subscription with trial', async () => {
      const now = new Date()
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

      testSub = await db.subscription.create({
        data: {
          organizationId: testOrg.id,
          stripeSubscriptionId: 'sub_test_123',
          stripePriceId: 'price_test_456',
          planCode: 'starter',
          status: 'trialing',
          trialStart: now,
          trialEnd: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
      })

      expect(testSub.planCode).toBe('starter')
      expect(testSub.status).toBe('trialing')
      expect(testSub.trialEnd).toBeInstanceOf(Date)
    })

    it('should find active subscriptions for organization', async () => {
      const now = new Date()
      testSub = await db.subscription.create({
        data: {
          organizationId: testOrg.id,
          stripeSubscriptionId: 'sub_active_test',
          stripePriceId: 'price_test',
          planCode: 'pro',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      const subscriptions = await db.subscription.findMany({
        where: {
          organizationId: testOrg.id,
          status: 'active',
        },
      })

      expect(subscriptions).toHaveLength(1)
      expect(subscriptions[0].planCode).toBe('pro')
    })
  })

  describe('UsageCounter CRUD', () => {
    let testOrg
    let testCounter

    beforeEach(async () => {
      testOrg = await db.organization.create({
        data: { name: 'Usage Counter Test Org' },
      })
    })

    afterEach(async () => {
      if (testCounter) {
        await db.usageCounter.delete({ where: { id: testCounter.id } }).catch(() => {})
        testCounter = null
      }
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should create usage counter', async () => {
      const periodStart = new Date()
      const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)

      testCounter = await db.usageCounter.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          periodStart,
          periodEnd,
          currentValue: 0,
          limit: 10000,
        },
      })

      expect(testCounter.metric).toBe('api_calls')
      expect(testCounter.currentValue).toBe(0)
      expect(testCounter.limit).toBe(10000)
    })

    it('should increment usage counter', async () => {
      const periodStart = new Date()
      const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)

      testCounter = await db.usageCounter.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          periodStart,
          periodEnd,
          currentValue: 0,
        },
      })

      const updated = await db.usageCounter.update({
        where: { id: testCounter.id },
        data: { currentValue: { increment: 100 } },
      })

      expect(updated.currentValue).toBe(100)
    })

    it('should enforce unique constraint on orgId, metric, periodStart', async () => {
      const periodStart = new Date()
      const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)

      testCounter = await db.usageCounter.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          periodStart,
          periodEnd,
        },
      })

      await expect(
        db.usageCounter.create({
          data: {
            organizationId: testOrg.id,
            metric: 'api_calls',
            periodStart,
            periodEnd,
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('UsageRecord CRUD', () => {
    let testOrg
    let testRecords = []

    beforeEach(async () => {
      testOrg = await db.organization.create({
        data: { name: 'Usage Record Test Org' },
      })
    })

    afterEach(async () => {
      // Clean up test records
      if (testRecords.length > 0) {
        await db.usageRecord.deleteMany({
          where: { id: { in: testRecords.map((r) => r.id) } },
        })
        testRecords = []
      }
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should create usage record', async () => {
      const record = await db.usageRecord.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          quantity: 10,
          metadata: { endpoint: '/api/test' },
        },
      })
      testRecords.push(record)

      expect(record.metric).toBe('api_calls')
      expect(record.quantity).toBe(10)
      expect(record.metadata).toEqual({ endpoint: '/api/test' })
    })

    it('should query usage records by time range', async () => {
      const now = new Date()
      const record1 = await db.usageRecord.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          quantity: 5,
          timestamp: new Date(now.getTime() - 1000),
        },
      })
      const record2 = await db.usageRecord.create({
        data: {
          organizationId: testOrg.id,
          metric: 'api_calls',
          quantity: 10,
          timestamp: now,
        },
      })
      testRecords.push(record1, record2)

      const records = await db.usageRecord.findMany({
        where: {
          organizationId: testOrg.id,
          timestamp: { gte: new Date(now.getTime() - 2000) },
        },
        orderBy: { timestamp: 'desc' },
      })

      expect(records).toHaveLength(2)
      expect(records[0].quantity).toBe(10)
    })
  })

  describe('Transactions', () => {
    let testOrg

    afterEach(async () => {
      if (testOrg) {
        await db.organization.delete({ where: { id: testOrg.id } }).catch(() => {})
        testOrg = null
      }
    })

    it('should commit transaction on success', async () => {
      await withTx(async (tx) => {
        testOrg = await tx.organization.create({
          data: { name: 'Transaction Test Org' },
        })
      })

      const found = await db.organization.findUnique({
        where: { id: testOrg.id },
      })

      expect(found).toBeDefined()
    })

    it('should rollback transaction on error', async () => {
      let orgId

      await expect(
        withTx(async (tx) => {
          const org = await tx.organization.create({
            data: { name: 'Rollback Test Org' },
          })
          orgId = org.id

          // Force an error
          throw new Error('Transaction rollback test')
        })
      ).rejects.toThrow('Transaction rollback test')

      const found = await db.organization.findUnique({
        where: { id: orgId },
      })

      expect(found).toBeNull()
    })
  })
})
