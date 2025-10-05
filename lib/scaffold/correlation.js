/**
 * Generate a simple UUIDv4
 * @returns {string} UUID string
 */
function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * @typedef {Object} CorrelationIds
 * @property {string} requestId - Unique request ID
 * @property {string} correlationId - Correlation ID for tracking across services
 * @property {string} [tenantId] - Tenant ID if present
 */

/**
 * Ensure correlation IDs are present, generating if missing
 * @param {Headers} headers - Request headers
 * @param {string} tenantHeaderName - Name of tenant header
 * @returns {CorrelationIds} Correlation IDs
 */
export function ensureIds(headers, tenantHeaderName = 'x-tenant-id') {
  const requestId = headers.get('x-request-id') || generateUuid()
  const correlationId = headers.get('x-correlation-id') || requestId
  const tenantId = headers.get(tenantHeaderName) || undefined

  return {
    requestId,
    correlationId,
    tenantId,
  }
}
