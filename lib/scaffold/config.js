/**
 * @typedef {Object} PlanConfig
 * @property {string} code - Plan code (e.g., 'starter', 'pro', 'trial')
 * @property {'trial'|'subscription'} type - Plan type
 * @property {string} stripePriceId - Stripe price ID
 * @property {string} name - Display name
 * @property {Object.<string, number>} limits - Usage limits per metric
 * @property {number} [trialDays] - Trial duration in days (only for trial type)
 */

/**
 * @typedef {Object} EnvConfig
 * @property {string} service - Service name
 * @property {string} version - Service version
 * @property {'development'|'test'|'production'} nodeEnv - Node environment
 * @property {number} httpPort - HTTP port
 * @property {'debug'|'info'|'warn'|'error'} logLevel - Log level
 * @property {string} tenantHeader - Tenant header name
 * @property {string} [betterStackToken] - BetterStack token (optional)
 * @property {string} [stripeSecretKey] - Stripe secret key (optional)
 * @property {string} [starterPriceId] - Stripe starter plan price ID (optional)
 * @property {number} trialDays - Trial period in days
 * @property {PlanConfig[]} plans - Plan configurations
 */

/**
 * Load and validate environment configuration
 * @returns {Readonly<EnvConfig>} Frozen configuration object
 */
export function getEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development'

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`)
  }

  const logLevel = process.env.MTR_LOG_LEVEL || 'info'
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Invalid MTR_LOG_LEVEL: ${logLevel}`)
  }

  const httpPort = parseInt(process.env.MTR_HTTP_PORT || '3000', 10)
  if (isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
    throw new Error(`Invalid MTR_HTTP_PORT: ${process.env.MTR_HTTP_PORT}`)
  }

  const trialDays = parseInt(process.env.MTR_TRIAL_DAYS || '14', 10)
  if (isNaN(trialDays) || trialDays < 0) {
    throw new Error(`Invalid MTR_TRIAL_DAYS: ${process.env.MTR_TRIAL_DAYS}`)
  }

  // Parse plans configuration
  let plans = []
  try {
    const plansJson = process.env.PLANS_CONFIG
    if (plansJson) {
      plans = JSON.parse(plansJson)
      if (!Array.isArray(plans)) {
        throw new Error('PLANS_CONFIG must be an array')
      }
    }
  } catch (err) {
    throw new Error(`Invalid PLANS_CONFIG: ${err.message}`)
  }

  const config = {
    service: process.env.MTR_SERVICE || 'metered-subscriptions',
    version: process.env.MTR_VERSION || '0.1.0',
    nodeEnv,
    httpPort,
    logLevel,
    tenantHeader: process.env.MTR_TENANT_HEADER || 'x-tenant-id',
    betterStackToken: process.env.MTR_BETTERSTACK_TOKEN,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    starterPriceId: process.env.STRIPE_TEST_PRICE_ID,
    trialDays,
    plans,
  }

  return Object.freeze(config)
}

/**
 * Get plan configuration by code
 * @param {string} planCode - Plan code to find
 * @returns {PlanConfig|undefined} Plan configuration
 */
export function getPlanByCode(planCode) {
  const env = getEnv()
  return env.plans.find((p) => p.code === planCode)
}

/**
 * Get plan configuration by Stripe price ID
 * @param {string} stripePriceId - Stripe price ID to find
 * @returns {PlanConfig|undefined} Plan configuration
 */
export function getPlanByPriceId(stripePriceId) {
  const env = getEnv()
  return env.plans.find((p) => p.stripePriceId === stripePriceId)
}

/**
 * Get trial plan configuration
 * @returns {PlanConfig|undefined} Trial plan configuration
 */
export function getTrialPlan() {
  const env = getEnv()
  return env.plans.find((p) => p.type === 'trial')
}
