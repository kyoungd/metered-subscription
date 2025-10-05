import { getLogger } from './logging.js'
import { ensureIds } from './correlation.js'
import { http, createStripeClient } from './clients/index.js'

/**
 * @typedef {Object} CallState
 * @property {string} requestId - Request ID
 * @property {string} correlationId - Correlation ID
 * @property {string} issuedAt - ISO timestamp
 * @property {string} [orgId] - Organization ID
 * @property {string} [userId] - User ID
 * @property {string} [role] - User role
 * @property {string} [tenantId] - Tenant ID
 * @property {any} [featureFlags] - Feature flags
 * @property {import('pino').Logger} logger - Logger instance
 * @property {import('./config.js').EnvConfig} env - Environment config
 */

/**
 * @typedef {Object} RequestContext
 * @property {import('pino').Logger} logger - Request logger
 * @property {CallState} call_state - Call state
 * @property {Object} clients - External API clients
 */

/**
 * Dependency injection container
 */
export class Container {
  /**
   * @param {import('./config.js').EnvConfig} env - Environment config
   */
  constructor(env) {
    this.env = env
    this.service = env.service
    this.version = env.version

    // Register app-scope client factories (HTTP client is created per-request with logger)
    this.clientFactories = {
      stripe: ({ env, call_state, httpClient }) =>
        createStripeClient({ env, call_state, http: httpClient }),
    }
  }

  /**
   * Create request-scoped context
   * @param {Headers} headers - Request headers
   * @returns {RequestContext} Request context
   */
  createRequestContext(headers) {
    const { requestId, correlationId, tenantId } = ensureIds(headers, this.env.tenantHeader)

    const logger = getLogger(
      {
        service: this.service,
        version: this.version,
        logLevel: this.env.logLevel,
      },
      { requestId, correlationId, tenantId }
    )

    const call_state = {
      requestId,
      correlationId,
      issuedAt: new Date().toISOString(),
      tenantId,
      logger,
      env: this.env,
    }

    // Create request-scoped HTTP client with logger
    const httpClient = http(this.env, logger)

    // Create request-scoped clients
    const clients = {
      stripe: this.clientFactories.stripe({ env: this.env, call_state, httpClient }),
    }

    return {
      logger,
      call_state,
      clients,
    }
  }
}

/**
 * Create DI container
 * @param {import('./config.js').EnvConfig} env - Environment config
 * @returns {Container} DI container
 */
export function createContainer(env) {
  return new Container(env)
}
