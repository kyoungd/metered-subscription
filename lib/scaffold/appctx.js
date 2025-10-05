import { ensureIds } from './correlation.js'
import { getLogger } from './logging.js'

/**
 * Build call state from request headers
 * @param {import('./config.js').EnvConfig} env - Environment config
 * @param {Headers} headers - Request headers
 * @returns {Object} Object containing call_state
 */
export function buildCallState(env, headers) {
  const { requestId, correlationId, tenantId } = ensureIds(headers, env.tenantHeader)

  const logger = getLogger(
    {
      service: env.service,
      version: env.version,
      logLevel: env.logLevel,
    },
    { requestId, correlationId, tenantId }
  )

  const call_state = {
    requestId,
    correlationId,
    issuedAt: new Date().toISOString(),
    tenantId,
    logger,
    env,
  }

  return { call_state }
}
