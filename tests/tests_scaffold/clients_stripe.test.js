import { describe, it, expect, beforeEach } from 'vitest'
import { getEnv } from '../../lib/scaffold/config.js'
import { createContainer } from '../../lib/scaffold/di.js'
import { buildHeaders, http } from '../../lib/scaffold/clients/http.js'

describe('Stripe client', () => {
  let env
  let container
  let ctx

  beforeEach(() => {
    // Set up test environment with dry-run enabled
    process.env.NODE_ENV = 'test'
    process.env.MTR_SERVICE = 'test-service'
    process.env.MTR_VERSION = '0.1.0'
    process.env.MTR_HTTP_DRY_RUN = 'true'
    process.env.MTR_STRIPE_SECRET_KEY = 'sk_test_secret_key_123'

    env = getEnv()
    container = createContainer(env)

    const headers = new Headers({
      'x-request-id': 'req-test-123',
      'x-correlation-id': 'cor-test-456',
      'x-tenant-id': 'tenant-789',
    })

    ctx = container.createRequestContext(headers)
  })

  describe('HTTP helpers', () => {
    it('should build headers with correlation IDs', () => {
      const callState = {
        requestId: 'req-abc',
        correlationId: 'cor-xyz',
        tenantId: 'tenant-123',
      }

      const headers = buildHeaders({ env, callState })

      expect(headers['x-request-id']).toBe('req-abc')
      expect(headers['x-correlation-id']).toBe('cor-xyz')
      expect(headers['x-tenant-id']).toBe('tenant-123')
    })

    it('should include user-agent header', () => {
      const callState = {
        requestId: 'req-123',
        correlationId: 'cor-456',
      }

      const headers = buildHeaders({ env, callState })

      expect(headers['user-agent']).toBe('test-service/0.1.0')
    })

    it('should include authorization when provided in extra', () => {
      const callState = {
        requestId: 'req-123',
        correlationId: 'cor-456',
      }

      const headers = buildHeaders({
        env,
        callState,
        extra: { authorization: 'Bearer secret-token' },
      })

      expect(headers.authorization).toBe('Bearer secret-token')
    })

    it('should not include tenant header when tenantId is undefined', () => {
      const callState = {
        requestId: 'req-123',
        correlationId: 'cor-456',
      }

      const headers = buildHeaders({ env, callState })

      expect(headers['x-tenant-id']).toBeUndefined()
    })

    it('should scrub authorization tokens in dry-run response', async () => {
      const httpClient = http(env)

      const response = await httpClient.post('https://api.example.com/test', {
        headers: {
          authorization: 'Bearer secret-token-123',
          'x-request-id': 'req-123',
        },
      })

      expect(response.json.headers.authorization).toBe('[REDACTED]')
      expect(response.json.headers['x-request-id']).toBe('req-123')
    })

    it('should return stub data in dry-run mode', async () => {
      const httpClient = http(env)

      const response = await httpClient.get('https://api.example.com/test')

      expect(response.status).toBe(200)
      expect(response.json.stub).toBe(true)
      expect(response.json.method).toBe('GET')
      expect(response.json.url).toBe('https://api.example.com/test')
    })

    it('should include body in dry-run response', async () => {
      const httpClient = http(env)

      const body = { test: 'data' }
      const response = await httpClient.post('https://api.example.com/test', { body })

      expect(response.json.body).toEqual(body)
    })
  })

  describe('DI integration', () => {
    it('should provide stripe client in context', () => {
      expect(ctx.clients).toBeDefined()
      expect(ctx.clients.stripe).toBeDefined()
    })

    it('should have customers methods', () => {
      expect(ctx.clients.stripe.customers).toBeDefined()
      expect(typeof ctx.clients.stripe.customers.createOrAttach).toBe('function')
    })

    it('should have payments methods', () => {
      expect(ctx.clients.stripe.payments).toBeDefined()
      expect(typeof ctx.clients.stripe.payments.createSetupIntent).toBe('function')
      expect(typeof ctx.clients.stripe.payments.attachMethod).toBe('function')
    })
  })

  describe('customers.createOrAttach', () => {
    it('should return ok:true envelope', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-123',
        email: 'test@example.com',
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should return customer ID starting with cus_test_', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-abc-123',
        email: 'test@example.com',
      })

      expect(result.data.customer.id).toMatch(/^cus_test_/)
    })

    it('should echo externalId in customer data', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-xyz-789',
        email: 'user@test.com',
      })

      expect(result.data.customer.externalId).toBe('user-xyz-789')
      expect(result.data.customer.email).toBe('user@test.com')
    })

    it('should include debug field in test environment', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-123',
        email: 'test@example.com',
      })

      expect(result.debug).toBeDefined()
      expect(result.debug.stub).toBe(true)
      expect(result.debug.externalId).toBe('user-123')
    })

    it('should generate stable customer ID based on externalId', async () => {
      const result1 = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-stable-id',
        email: 'test1@example.com',
      })

      const result2 = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-stable-id',
        email: 'test2@example.com',
      })

      expect(result1.data.customer.id).toBe(result2.data.customer.id)
    })

    it('should work without email', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-no-email',
      })

      expect(result.ok).toBe(true)
      expect(result.data.customer.id).toMatch(/^cus_test_/)
    })
  })

  describe('payments.createSetupIntent', () => {
    it('should return ok:true envelope', async () => {
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-123',
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should return setup intent ID starting with seti_test_', async () => {
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-abc-123',
      })

      expect(result.data.setupIntent.id).toMatch(/^seti_test_/)
    })

    it('should include status field', async () => {
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-123',
      })

      expect(result.data.setupIntent.status).toBe('requires_confirmation')
    })

    it('should include client secret', async () => {
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-123',
      })

      expect(result.data.setupIntent.clientSecret).toBeDefined()
      expect(result.data.setupIntent.clientSecret).toContain('_secret_stub')
    })

    it('should include debug field in test environment', async () => {
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-123',
      })

      expect(result.debug).toBeDefined()
      expect(result.debug.stub).toBe(true)
    })

    it('should generate stable setup intent ID', async () => {
      const result1 = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-stable',
      })

      const result2 = await ctx.clients.stripe.payments.createSetupIntent({
        externalId: 'user-stable',
      })

      expect(result1.data.setupIntent.id).toBe(result2.data.setupIntent.id)
    })
  })

  describe('payments.attachMethod', () => {
    it('should return ok:true envelope', async () => {
      const result = await ctx.clients.stripe.payments.attachMethod({
        externalId: 'user-123',
        paymentMethodId: 'pm_test_456',
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should return attachment with customer ID', async () => {
      const result = await ctx.clients.stripe.payments.attachMethod({
        externalId: 'user-abc-123',
        paymentMethodId: 'pm_test_789',
      })

      expect(result.data.attachment.customerId).toMatch(/^cus_test_/)
      expect(result.data.attachment.paymentMethodId).toBe('pm_test_789')
    })

    it('should return attached:true', async () => {
      const result = await ctx.clients.stripe.payments.attachMethod({
        externalId: 'user-123',
        paymentMethodId: 'pm_test_456',
      })

      expect(result.data.attachment.attached).toBe(true)
    })

    it('should include debug field in test environment', async () => {
      const result = await ctx.clients.stripe.payments.attachMethod({
        externalId: 'user-123',
        paymentMethodId: 'pm_test_456',
      })

      expect(result.debug).toBeDefined()
      expect(result.debug.stub).toBe(true)
      expect(result.debug.paymentMethodId).toBe('pm_test_456')
    })

    it('should match customer ID with same externalId', async () => {
      const customerResult = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-match-test',
        email: 'test@example.com',
      })

      const attachResult = await ctx.clients.stripe.payments.attachMethod({
        externalId: 'user-match-test',
        paymentMethodId: 'pm_test_123',
      })

      expect(attachResult.data.attachment.customerId).toBe(customerResult.data.customer.id)
    })
  })

  describe('correlation and headers', () => {
    it('should not leak auth tokens in debug output', async () => {
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-security-test',
        email: 'test@example.com',
      })

      // Debug object should not contain authorization header
      const debugStr = JSON.stringify(result.debug)
      expect(debugStr).not.toContain('sk_test_secret_key')
      expect(debugStr).not.toContain('Bearer')
    })

    it('should use correlation IDs from call_state', () => {
      expect(ctx.call_state.requestId).toBe('req-test-123')
      expect(ctx.call_state.correlationId).toBe('cor-test-456')
      expect(ctx.call_state.tenantId).toBe('tenant-789')
    })

    it('should create separate client instances per request', () => {
      const headers2 = new Headers({
        'x-request-id': 'req-different',
      })

      const ctx2 = container.createRequestContext(headers2)

      expect(ctx.clients.stripe).not.toBe(ctx2.clients.stripe)
      expect(ctx.call_state.requestId).not.toBe(ctx2.call_state.requestId)
    })
  })

  describe('dry-run mode', () => {
    it('should confirm env.dryRun is true', () => {
      expect(env.dryRun).toBe(true)
    })

    it('should not make real network calls', async () => {
      // This test verifies no actual network call happens
      // If it did, it would fail or timeout
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: 'user-no-network',
        email: 'no-network@example.com',
      })

      expect(result.ok).toBe(true)
      expect(result.debug.stub).toBe(true)
    })

    it('should work when dryRun is explicitly set to false then true', () => {
      process.env.MTR_HTTP_DRY_RUN = 'false'
      const env1 = getEnv()
      expect(env1.dryRun).toBe(false)

      process.env.MTR_HTTP_DRY_RUN = 'true'
      const env2 = getEnv()
      expect(env2.dryRun).toBe(true)
    })
  })

  describe('config integration', () => {
    it('should load stripe secret key from env', () => {
      expect(env.stripeSecretKey).toBe('sk_test_secret_key_123')
    })

    it('should handle missing stripe secret key', () => {
      delete process.env.MTR_STRIPE_SECRET_KEY
      const envNoKey = getEnv()

      expect(envNoKey.stripeSecretKey).toBeUndefined()
    })

    it('should default dryRun to true when not set', () => {
      delete process.env.MTR_HTTP_DRY_RUN
      const envDefault = getEnv()

      expect(envDefault.dryRun).toBe(true)
    })
  })
})
