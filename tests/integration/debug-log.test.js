import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../../lib/scaffold/db.js'
import { writeDebugLog } from '../../lib/scaffold/debug-log.js'

describe('Debug Log Integration Tests', () => {
  beforeAll(async () => {
    // Clear debug logs before tests
    await db.debugLog.deleteMany({})
  })

  afterAll(async () => {
    // Cleanup after tests
    await db.debugLog.deleteMany({})
  })

  describe('writeDebugLog', () => {
    it('should write webhook log entry', async () => {
      await writeDebugLog({
        category: 'webhook',
        provider: 'clerk',
        type: 'user.created',
        path: '/api/webhooks/clerk',
        payload: {
          id: 'user_test123',
          email: 'test@example.com',
        },
      })

      const logs = await db.debugLog.findMany({
        where: { category: 'webhook' },
      })

      expect(logs.length).toBe(1)
      expect(logs[0].source).toBe('external')
      expect(logs[0].category).toBe('webhook')
      expect(logs[0].provider).toBe('clerk')
      expect(logs[0].type).toBe('user.created')
      expect(logs[0].path).toBe('/api/webhooks/clerk')
      expect(logs[0].payload).toEqual({
        id: 'user_test123',
        email: 'test@example.com',
      })
    })

    it('should write rest_in log entry', async () => {
      await writeDebugLog({
        category: 'rest_in',
        type: 'POST',
        path: '/api/entitlements',
        payload: {
          method: 'POST',
          path: '/api/entitlements',
          query: {},
          headers: {
            'user-agent': 'test-client',
            'content-type': 'application/json',
          },
        },
      })

      const logs = await db.debugLog.findMany({
        where: { category: 'rest_in' },
      })

      expect(logs.length).toBe(1)
      expect(logs[0].category).toBe('rest_in')
      expect(logs[0].type).toBe('POST')
      expect(logs[0].path).toBe('/api/entitlements')
    })

    it('should write rest_out log entry', async () => {
      await writeDebugLog({
        category: 'rest_out',
        type: 'POST',
        path: 'https://api.stripe.com/v1/customers',
        payload: {
          method: 'POST',
          url: 'https://api.stripe.com/v1/customers',
          headers: {
            authorization: '[REDACTED]',
          },
          body: 'email=test@example.com',
        },
      })

      const logs = await db.debugLog.findMany({
        where: { category: 'rest_out' },
      })

      expect(logs.length).toBe(1)
      expect(logs[0].category).toBe('rest_out')
      expect(logs[0].type).toBe('POST')
      expect(logs[0].path).toBe('https://api.stripe.com/v1/customers')
    })

    it('should handle write failures gracefully', async () => {
      // Try to write invalid data - should not throw
      await expect(
        writeDebugLog({
          category: 'webhook',
          // Missing required payload field
        })
      ).resolves.not.toThrow()
    })
  })

  describe('Query filtering', () => {
    beforeAll(async () => {
      // Clear and seed test data
      await db.debugLog.deleteMany({})

      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      // Seed multiple log entries
      await db.debugLog.createMany({
        data: [
          // Recent webhooks
          {
            source: 'external',
            category: 'webhook',
            provider: 'clerk',
            type: 'user.created',
            path: '/api/webhooks/clerk',
            payload: { id: 'user_1' },
            timestamp: now,
          },
          {
            source: 'external',
            category: 'webhook',
            provider: 'stripe',
            type: 'customer.created',
            path: '/api/webhooks/stripe',
            payload: { id: 'cus_1' },
            timestamp: now,
          },
          // Old webhook (should be filtered by time)
          {
            source: 'external',
            category: 'webhook',
            provider: 'clerk',
            type: 'user.updated',
            path: '/api/webhooks/clerk',
            payload: { id: 'user_2' },
            timestamp: yesterday,
          },
          // REST API logs
          {
            source: 'external',
            category: 'rest_in',
            type: 'GET',
            path: '/api/entitlements',
            payload: {},
            timestamp: now,
          },
          {
            source: 'external',
            category: 'rest_out',
            type: 'POST',
            path: 'https://api.stripe.com/v1/customers',
            payload: {},
            timestamp: now,
          },
        ],
      })
    })

    it('should filter webhooks by category', async () => {
      const logs = await db.debugLog.findMany({
        where: { category: 'webhook' },
      })

      expect(logs.length).toBe(3)
    })

    it('should filter webhooks by provider', async () => {
      const logs = await db.debugLog.findMany({
        where: {
          category: 'webhook',
          provider: 'clerk',
        },
      })

      expect(logs.length).toBe(2)
    })

    it('should filter webhooks by type', async () => {
      const logs = await db.debugLog.findMany({
        where: {
          category: 'webhook',
          type: 'user.created',
        },
      })

      expect(logs.length).toBe(1)
      expect(logs[0].payload).toEqual({ id: 'user_1' })
    })

    it('should filter by timestamp', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      const logs = await db.debugLog.findMany({
        where: {
          category: 'webhook',
          timestamp: {
            gte: oneHourAgo,
          },
        },
      })

      expect(logs.length).toBe(2) // Only recent ones
    })

    it('should respect limit', async () => {
      const logs = await db.debugLog.findMany({
        where: { category: 'webhook' },
        take: 2,
      })

      expect(logs.length).toBe(2)
    })

    it('should order by timestamp desc', async () => {
      const logs = await db.debugLog.findMany({
        where: { category: 'webhook' },
        orderBy: {
          timestamp: 'desc',
        },
      })

      // Most recent first
      expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        logs[logs.length - 1].timestamp.getTime()
      )
    })
  })
})
