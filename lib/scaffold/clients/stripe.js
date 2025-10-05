import { buildHeaders } from './http.js'
import { ApiError, ErrorCode } from '../envelope.js'

/**
 * Convert Stripe request body object to URL-encoded form data
 * @param {Object} data - Data object
 * @param {string} [prefix] - Prefix for nested keys
 * @returns {string} URL-encoded form data
 */
function toFormEncoded(data, prefix = '') {
  const params = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue

    const fullKey = prefix ? `${prefix}[${key}]` : key

    if (Array.isArray(value)) {
      // Handle arrays - encode each element with indexed keys
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          params.push(toFormEncoded(item, `${fullKey}[${index}]`))
        } else {
          params.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(item)}`)
        }
      })
    } else if (typeof value === 'object') {
      // Handle objects
      params.push(toFormEncoded(value, fullKey))
    } else {
      // Handle primitives
      params.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`)
    }
  }

  return params.join('&')
}

/**
 * Map Stripe error to ApiError
 * @param {Object} error - Stripe error response
 * @param {number} status - HTTP status code
 * @returns {ApiError} Mapped API error
 */
function mapStripeError(error, status) {
  const stripeError = error.error || error

  const message = stripeError.message || 'Stripe API error'
  const code = stripeError.code
  const type = stripeError.type

  // Map Stripe error types to our ErrorCode
  if (status === 401) {
    return new ApiError(ErrorCode.UNAUTHORIZED, message, 401, { stripeCode: code })
  }

  if (status === 403) {
    return new ApiError(ErrorCode.FORBIDDEN, message, 403, { stripeCode: code })
  }

  if (status === 404) {
    return new ApiError(ErrorCode.NOT_FOUND, message, 404, { stripeCode: code })
  }

  if (status === 429 || type === 'rate_limit_error') {
    return new ApiError(ErrorCode.RATE_LIMITED, message, 429, { stripeCode: code })
  }

  if (status >= 400 && status < 500) {
    return new ApiError(ErrorCode.BAD_REQUEST, message, status, { stripeCode: code, type })
  }

  return new ApiError(ErrorCode.INTERNAL, message, status, { stripeCode: code, type })
}

/**
 * Create Stripe client
 * @param {Object} params - Parameters
 * @param {import('../config.js').EnvConfig} params.env - Environment config
 * @param {Object} params.call_state - Call state with correlation IDs
 * @param {Object} params.http - HTTP client
 * @returns {Object} Stripe client with methods
 */
export function createStripeClient({ env, call_state, http }) {
  const baseUrl = 'https://api.stripe.com/v1'

  /**
   * Build authorization header for Stripe
   * @returns {string} Bearer token
   */
  function buildAuth() {
    if (!env.stripeSecretKey) {
      throw new ApiError(ErrorCode.INTERNAL, 'Stripe secret key not configured', 500)
    }
    return `Bearer ${env.stripeSecretKey}`
  }

  /**
   * Make Stripe API request
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} [data] - Request body data
   * @returns {Promise<Object>} Stripe API response
   */
  async function stripeRequest(method, path, data = undefined) {
    const headers = buildHeaders({
      env,
      callState: call_state,
      extra: {
        authorization: buildAuth(),
        'content-type': 'application/x-www-form-urlencoded',
      },
    })

    const url = `${baseUrl}${path}`
    const httpMethod = method.toLowerCase()

    // Convert data to form-encoded string for Stripe
    const body = data ? toFormEncoded(data) : undefined

    const response = await http[httpMethod](url, { headers, body })

    // Check for errors - Stripe returns errors in JSON body even with error status codes
    if (!response.ok && response.status >= 400) {
      throw mapStripeError(response.json, response.status)
    }

    return response.json
  }

  /**
   * Build debug object for dry-run test environments
   * @param {Object} stubData - Stub data
   * @returns {Object|undefined} Debug object
   */
  function buildDebug(stubData) {
    if (env.nodeEnv === 'test' && env.dryRun) {
      return { stub: true, ...stubData }
    }
    return undefined
  }

  return {
    customers: {
      /**
       * Create or find customer by metadata
       * @param {Object} params - Parameters
       * @param {string} params.externalId - External customer ID (stored in metadata)
       * @param {string} [params.email] - Customer email
       * @returns {Promise<Object>} Customer result
       */
      async createOrAttach({ externalId, email }) {
        if (env.dryRun) {
          // Dry-run stub
          const customerId = `cus_test_${externalId.substring(0, 10)}`
          return {
            ok: true,
            data: {
              customer: {
                id: customerId,
                externalId,
                email,
              },
            },
            debug: buildDebug({ externalId, email }),
          }
        }

        // Real Stripe API call
        const customer = await stripeRequest('POST', '/customers', {
          metadata: { externalId },
          email,
        })

        return {
          ok: true,
          data: {
            customer: {
              id: customer.id,
              externalId,
              email: customer.email,
              stripeCustomer: customer,
            },
          },
        }
      },
    },

    payments: {
      /**
       * Create setup intent for payment method
       * @param {Object} params - Parameters
       * @param {string} params.externalId - External customer ID
       * @param {string} [params.customerId] - Stripe customer ID
       * @returns {Promise<Object>} Setup intent result
       */
      async createSetupIntent({ externalId, customerId }) {
        if (env.dryRun) {
          // Dry-run stub
          const setupIntentId = `seti_test_${externalId.substring(0, 10)}`
          return {
            ok: true,
            data: {
              setupIntent: {
                id: setupIntentId,
                status: 'requires_confirmation',
                clientSecret: `${setupIntentId}_secret_stub`,
              },
            },
            debug: buildDebug({ externalId }),
          }
        }

        // Real Stripe API call
        const requestData = {
          metadata: { externalId },
        }
        if (customerId) {
          requestData.customer = customerId
        }

        const setupIntent = await stripeRequest('POST', '/setup_intents', requestData)

        return {
          ok: true,
          data: {
            setupIntent: {
              id: setupIntent.id,
              status: setupIntent.status,
              clientSecret: setupIntent.client_secret,
              stripeSetupIntent: setupIntent,
            },
          },
        }
      },

      /**
       * Attach payment method to customer
       * @param {Object} params - Parameters
       * @param {string} params.externalId - External customer ID
       * @param {string} params.paymentMethodId - Payment method ID
       * @returns {Promise<Object>} Attachment result
       */
      async attachMethod({ externalId, paymentMethodId }) {
        if (env.dryRun) {
          // Dry-run stub
          const customerId = `cus_test_${externalId.substring(0, 10)}`
          return {
            ok: true,
            data: {
              attachment: {
                customerId,
                paymentMethodId,
                attached: true,
              },
            },
            debug: buildDebug({ externalId, paymentMethodId }),
          }
        }

        // Real Stripe API call
        const paymentMethod = await stripeRequest(
          'POST',
          `/payment_methods/${paymentMethodId}/attach`,
          {
            customer: externalId, // Assuming externalId is the Stripe customer ID
          }
        )

        return {
          ok: true,
          data: {
            attachment: {
              customerId: paymentMethod.customer,
              paymentMethodId: paymentMethod.id,
              attached: true,
              stripePaymentMethod: paymentMethod,
            },
          },
        }
      },
    },

    subscriptions: {
      /**
       * Create subscription
       * @param {Object} params - Parameters
       * @param {string} params.customerId - Stripe customer ID
       * @param {string} params.priceId - Stripe price ID
       * @param {number} [params.trialDays] - Trial period in days
       * @param {Object} [params.metadata] - Additional metadata
       * @param {string} [params.paymentBehavior] - Payment behavior (default_incomplete, etc)
       * @returns {Promise<Object>} Subscription result
       */
      async create({ customerId, priceId, trialDays, metadata = {}, paymentBehavior }) {
        if (env.dryRun) {
          // Dry-run stub
          const now = Date.now()
          const trialEnd = trialDays ? new Date(now + trialDays * 24 * 60 * 60 * 1000) : null

          return {
            ok: true,
            data: {
              subscription: {
                id: `sub_test_${customerId.substring(0, 10)}`,
                status: trialDays ? 'trialing' : 'active',
                customerId,
                priceId,
                trialEnd,
                currentPeriodStart: new Date(now),
                currentPeriodEnd: trialEnd || new Date(now + 30 * 24 * 60 * 60 * 1000),
              },
            },
            debug: buildDebug({ customerId, priceId, trialDays }),
          }
        }

        // Real Stripe API call
        const requestData = {
          customer: customerId,
          items: [{ price: priceId }],
          metadata,
        }

        if (trialDays) {
          requestData.trial_period_days = trialDays
        }

        if (paymentBehavior) {
          requestData.payment_behavior = paymentBehavior
        }

        const subscription = await stripeRequest('POST', '/subscriptions', requestData)

        return {
          ok: true,
          data: {
            subscription: {
              id: subscription.id,
              status: subscription.status,
              customerId: subscription.customer,
              priceId: subscription.items.data[0].price.id,
              trialStart: subscription.trial_start
                ? new Date(subscription.trial_start * 1000)
                : null,
              trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              stripeSubscription: subscription,
            },
          },
        }
      },
    },
  }
}
