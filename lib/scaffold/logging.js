import pino from 'pino'

/**
 * PII fields to redact from logs
 */
const PII_FIELDS = ['email', 'phone', 'ssn', 'password', 'token']

/**
 * Create a redaction configuration for Pino
 */
function createRedaction() {
  return {
    paths: PII_FIELDS,
    censor: '[REDACTED]',
  }
}

/**
 * @typedef {Object} LoggerContext
 * @property {string} [requestId] - Request ID
 * @property {string} [correlationId] - Correlation ID
 * @property {string} [tenantId] - Tenant ID
 */

/**
 * Get a logger instance with bound context
 * @param {Object} appContext - App-level context
 * @param {string} appContext.service - Service name
 * @param {string} appContext.version - Service version
 * @param {string} appContext.logLevel - Log level
 * @param {LoggerContext} [requestContext] - Request-level context
 * @returns {import('pino').Logger} Pino logger instance
 */
export function getLogger(appContext, requestContext = {}) {
  const baseLogger = pino({
    level: appContext.logLevel || 'info',
    redact: createRedaction(),
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    base: {
      service: appContext.service,
      version: appContext.version,
    },
  })

  const bindings = {}
  if (requestContext.requestId) bindings.request_id = requestContext.requestId
  if (requestContext.correlationId) bindings.correlation_id = requestContext.correlationId
  if (requestContext.tenantId) bindings.tenant_id = requestContext.tenantId

  return Object.keys(bindings).length > 0 ? baseLogger.child(bindings) : baseLogger
}
