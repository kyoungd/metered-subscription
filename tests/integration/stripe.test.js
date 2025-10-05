import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getEnv } from '../../lib/scaffold/config.js'
import { createContainer } from '../../lib/scaffold/di.js'

describe('Stripe Integration', () => {
  let env
  let container
  let ctx
  let testCustomerId
  let testSetupIntentId
  let testSubscriptionId

  beforeAll(() => {
    const baseEnv = getEnv()

    // Verify Stripe is configured
    if (!baseEnv.stripeSecretKey) {
      throw new Error('MTR_STRIPE_SECRET_KEY not configured')
    }

    // Force real API mode for integration tests
    env = { ...baseEnv, dryRun: false }

    container = createContainer(env)
    const headers = new Headers({
      'x-request-id': 'stripe-integration-test',
      'x-correlation-id': 'stripe-integration-test',
    })
    ctx = container.createRequestContext(headers)
  })

  afterAll(async () => {
    // Clean up Stripe resources
    if (testSubscriptionId) {
      try {
        await fetch(`https://api.stripe.com/v1/subscriptions/${testSubscriptionId}`, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${env.stripeSecretKey}`,
          },
        })
      } catch (error) {
        console.warn('Failed to clean up test subscription:', error.message)
      }
    }

    if (testCustomerId) {
      try {
        await fetch(`https://api.stripe.com/v1/customers/${testCustomerId}`, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${env.stripeSecretKey}`,
          },
        })
      } catch (error) {
        console.warn('Failed to clean up test customer:', error.message)
      }
    }
  })

  describe('customers.createOrAttach', () => {
    it('should create customer on Stripe', async () => {
      const externalId = `test-${Date.now()}`
      const email = `test-${Date.now()}@example.com`

      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId,
        email,
      })

      expect(result.ok).toBe(true)
      expect(result.data.customer).toBeDefined()
      expect(result.data.customer.id).toMatch(/^cus_/)
      expect(result.data.customer.externalId).toBe(externalId)
      expect(result.data.customer.email).toBe(email)
      expect(result.data.customer.stripeCustomer).toBeDefined()

      // Save for cleanup
      testCustomerId = result.data.customer.id
    })

    it('should include externalId in customer metadata', async () => {
      const externalId = `test-metadata-${Date.now()}`
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId,
        email: `metadata-${Date.now()}@example.com`,
      })

      expect(result.data.customer.stripeCustomer.metadata).toBeDefined()
      expect(result.data.customer.stripeCustomer.metadata.externalId).toBe(externalId)
    })
  })

  describe('payments.createSetupIntent', () => {
    it('should create setup intent without customer', async () => {
      const externalId = `test-setup-${Date.now()}`

      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId,
      })

      expect(result.ok).toBe(true)
      expect(result.data.setupIntent).toBeDefined()
      expect(result.data.setupIntent.id).toMatch(/^seti_/)
      expect(result.data.setupIntent.status).toBeDefined()
      expect(result.data.setupIntent.clientSecret).toBeDefined()
      expect(result.data.setupIntent.clientSecret).toMatch(/^seti_.*_secret_/)

      testSetupIntentId = result.data.setupIntent.id
    })

    it('should create setup intent with customer', async () => {
      const externalId = `test-setup-customer-${Date.now()}`

      // First create a customer
      const customerResult = await ctx.clients.stripe.customers.createOrAttach({
        externalId,
        email: `setup-${Date.now()}@example.com`,
      })

      const customerId = customerResult.data.customer.id

      // Create setup intent with customer
      const result = await ctx.clients.stripe.payments.createSetupIntent({
        externalId,
        customerId,
      })

      expect(result.ok).toBe(true)
      expect(result.data.setupIntent.stripeSetupIntent.customer).toBe(customerId)
    })
  })

  describe('subscriptions.create', () => {
    it('should create subscription with trial', async () => {
      const externalId = `test-sub-${Date.now()}`

      // Create customer first
      const customerResult = await ctx.clients.stripe.customers.createOrAttach({
        externalId,
        email: `sub-${Date.now()}@example.com`,
      })

      const customerId = customerResult.data.customer.id

      // Get price ID from environment (should be price_xxx, not prod_xxx)
      const priceId = process.env.STRIPE_TEST_PRICE_ID
      if (!priceId) {
        throw new Error('STRIPE_TEST_PRICE_ID not configured. Please set a Stripe price ID.')
      }

      // Create subscription with trial
      const result = await ctx.clients.stripe.subscriptions.create({
        customerId,
        priceId,
        trialDays: 14,
        metadata: { test: 'integration' },
      })

      expect(result.ok).toBe(true)
      expect(result.data.subscription).toBeDefined()
      expect(result.data.subscription.id).toMatch(/^sub_/)
      expect(result.data.subscription.status).toMatch(/^(trialing|active)$/)
      expect(result.data.subscription.customerId).toBe(customerId)
      expect(result.data.subscription.priceId).toBeDefined()
      expect(result.data.subscription.currentPeriodStart).toBeInstanceOf(Date)
      expect(result.data.subscription.currentPeriodEnd).toBeInstanceOf(Date)

      // Trial dates should be set
      if (result.data.subscription.status === 'trialing') {
        expect(result.data.subscription.trialStart).toBeInstanceOf(Date)
        expect(result.data.subscription.trialEnd).toBeInstanceOf(Date)
      }

      // Save for cleanup
      testSubscriptionId = result.data.subscription.id
    })

    it('should create subscription without trial using payment_behavior=default_incomplete', async () => {
      const externalId = `test-sub-no-trial-${Date.now()}`

      // Create customer
      const customerResult = await ctx.clients.stripe.customers.createOrAttach({
        externalId,
        email: `sub-no-trial-${Date.now()}@example.com`,
      })

      const customerId = customerResult.data.customer.id

      // Get price ID
      const priceId = process.env.STRIPE_TEST_PRICE_ID
      if (!priceId) {
        throw new Error('STRIPE_TEST_PRICE_ID not configured. Please set a Stripe price ID.')
      }

      // Create subscription without trial
      // Note: payment_behavior=default_incomplete allows creating subscription without payment method
      const result = await ctx.clients.stripe.subscriptions.create({
        customerId,
        priceId,
        paymentBehavior: 'default_incomplete',
      })

      expect(result.ok).toBe(true)
      expect(result.data.subscription.status).toMatch(/^(active|incomplete|incomplete_expired|trialing)$/)
      expect(result.data.subscription.trialStart).toBeNull()
      expect(result.data.subscription.trialEnd).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('should throw ApiError for invalid API key', async () => {
      // Create container with invalid key
      const invalidEnv = { ...env, stripeSecretKey: 'sk_test_invalid', dryRun: false }
      const invalidContainer = createContainer(invalidEnv)
      const invalidCtx = invalidContainer.createRequestContext(new Headers())

      await expect(
        invalidCtx.clients.stripe.customers.createOrAttach({
          externalId: 'test',
          email: 'test@example.com',
        })
      ).rejects.toThrow()
    })

    it('should handle customers with null externalId', async () => {
      // Stripe allows null metadata, so this should succeed
      const result = await ctx.clients.stripe.customers.createOrAttach({
        externalId: null,
        email: `null-test-${Date.now()}@example.com`,
      })

      expect(result.ok).toBe(true)
      expect(result.data.customer.externalId).toBeNull()
    })
  })
})
