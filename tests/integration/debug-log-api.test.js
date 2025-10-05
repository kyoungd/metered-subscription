import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../../lib/scaffold/db.js'

const BASE_URL = 'http://localhost:3000'

describe('Debug Log API Endpoints', () => {
  beforeAll(async () => {
    // Clear and seed test data
    await db.debugLog.deleteMany({})

    const now = new Date()

    await db.debugLog.createMany({
      data: [
        // Clerk webhooks
        {
          source: 'external',
          category: 'webhook',
          provider: 'clerk',
          type: 'user.created',
          path: '/api/webhooks/clerk',
          payload: { id: 'user_test1', email: 'test1@example.com' },
          timestamp: now,
        },
        {
          source: 'external',
          category: 'webhook',
          provider: 'clerk',
          type: 'organization.created',
          path: '/api/webhooks/clerk',
          payload: { id: 'org_test1', name: 'Test Org' },
          timestamp: now,
        },
        // Stripe webhook
        {
          source: 'external',
          category: 'webhook',
          provider: 'stripe',
          type: 'customer.created',
          path: '/api/webhooks/stripe',
          payload: { id: 'cus_test1', email: 'test@example.com' },
          timestamp: now,
        },
        // Incoming REST API
        {
          source: 'external',
          category: 'rest_in',
          type: 'POST',
          path: '/api/entitlements',
          payload: { method: 'POST', path: '/api/entitlements' },
          timestamp: now,
        },
        {
          source: 'external',
          category: 'rest_in',
          type: 'GET',
          path: '/api/usage',
          payload: { method: 'GET', path: '/api/usage' },
          timestamp: now,
        },
        // Outgoing REST API
        {
          source: 'external',
          category: 'rest_out',
          type: 'POST',
          path: 'https://api.stripe.com/v1/customers',
          payload: { method: 'POST', url: 'https://api.stripe.com/v1/customers' },
          timestamp: now,
        },
        {
          source: 'external',
          category: 'rest_out',
          type: 'POST_RESPONSE',
          path: 'https://api.stripe.com/v1/customers',
          payload: { status: 200, response: { id: 'cus_123' } },
          timestamp: now,
        },
      ],
    })
  })

  afterAll(async () => {
    await db.debugLog.deleteMany({})
  })

  describe('GET /api/logs/webhooks', () => {
    it('should return all webhook logs', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/webhooks`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(3)
      expect(data.logs.length).toBe(3)
      expect(data.logs[0].category).toBe('webhook')
    })

    it('should filter by provider', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/webhooks?provider=clerk`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(2)
      expect(data.logs.every((log) => log.provider === 'clerk')).toBe(true)
    })

    it('should filter by type', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/webhooks?type=user.created`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(1)
      expect(data.logs[0].type).toBe('user.created')
      expect(data.logs[0].payload).toEqual({
        id: 'user_test1',
        email: 'test1@example.com',
      })
    })

    it('should filter by multiple params', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/webhooks?provider=clerk&type=organization.created`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(1)
      expect(data.logs[0].provider).toBe('clerk')
      expect(data.logs[0].type).toBe('organization.created')
    })

    it('should respect limit', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/webhooks?limit=2`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.logs.length).toBe(2)
    })

    it('should return 403 in production', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const response = await fetch(`${BASE_URL}/api/logs/webhooks`)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Not available in production')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('GET /api/logs/rest/in', () => {
    it('should return all incoming REST logs', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/rest/in`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(2)
      expect(data.logs.every((log) => log.category === 'rest_in')).toBe(true)
    })

    it('should filter by path', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/rest/in?path=/api/entitlements`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(1)
      expect(data.logs[0].path).toBe('/api/entitlements')
    })

    it('should filter by method', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/rest/in?method=GET`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(1)
      expect(data.logs[0].type).toBe('GET')
      expect(data.logs[0].path).toBe('/api/usage')
    })
  })

  describe('GET /api/logs/rest/out', () => {
    it('should return all outgoing REST logs', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/rest/out`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(2)
      expect(data.logs.every((log) => log.category === 'rest_out')).toBe(true)
    })

    it('should filter by url', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/rest/out?url=stripe.com`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(2)
      expect(
        data.logs.every((log) => log.path.includes('stripe.com'))
      ).toBe(true)
    })

    it('should filter by method', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/rest/out?method=POST`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(2) // Both POST request and POST_RESPONSE
      expect(
        data.logs.every((log) => log.type.startsWith('POST'))
      ).toBe(true)
    })

    it('should filter request only (not response)', async () => {
      const response = await fetch(
        `${BASE_URL}/api/logs/rest/out?method=POST&limit=10`
      )
      const data = await response.json()

      expect(response.status).toBe(200)

      // Should include both POST and POST_RESPONSE
      const requestLog = data.logs.find((log) => log.type === 'POST')
      const responseLog = data.logs.find((log) => log.type === 'POST_RESPONSE')

      expect(requestLog).toBeDefined()
      expect(responseLog).toBeDefined()
      expect(requestLog.payload.method).toBe('POST')
      expect(responseLog.payload.status).toBe(200)
    })
  })

  describe('Time-based filtering', () => {
    it('should filter by since parameter', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const response = await fetch(
        `${BASE_URL}/api/logs/webhooks?since=${futureDate}`
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBe(0) // No logs in the future
    })

    it('should default to last 24 hours', async () => {
      const response = await fetch(`${BASE_URL}/api/logs/webhooks`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.count).toBeGreaterThan(0)
    })
  })
})
