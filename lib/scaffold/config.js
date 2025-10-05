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
 * @property {boolean} dryRun - HTTP dry-run mode (no network calls)
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

  const dryRun = process.env.MTR_HTTP_DRY_RUN !== 'false'

  const trialDays = parseInt(process.env.MTR_TRIAL_DAYS || '14', 10)
  if (isNaN(trialDays) || trialDays < 0) {
    throw new Error(`Invalid MTR_TRIAL_DAYS: ${process.env.MTR_TRIAL_DAYS}`)
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
    dryRun,
  }

  return Object.freeze(config)
}
