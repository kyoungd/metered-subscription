/**
 * @typedef {'BAD_REQUEST'|'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'RATE_LIMITED'|'INTERNAL'} ErrorCode
 */

/**
 * Error codes enum
 * @type {Record<ErrorCode, ErrorCode>}
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
}

/**
 * API Error class
 */
export class ApiError extends Error {
  /**
   * @param {ErrorCode} code - Error code
   * @param {string} message - Error message
   * @param {number} [httpStatus=400] - HTTP status code
   * @param {any} [detail] - Additional error details
   */
  constructor(code, message, httpStatus = 400, detail = undefined) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
    this.detail = detail
  }
}

/**
 * Wrap successful response
 * @param {any} data - Response data
 * @param {any} [meta] - Optional metadata
 * @param {string} [correlationId] - Correlation ID
 * @returns {Object} Success envelope
 */
export function wrapSuccess(data, meta = undefined, correlationId = undefined) {
  const envelope = {
    ok: true,
    data,
  }

  if (meta !== undefined) envelope.meta = meta
  if (correlationId) envelope.correlationId = correlationId

  return envelope
}

/**
 * Wrap error response
 * @param {Error|ApiError} err - Error object
 * @param {string} [correlationId] - Correlation ID
 * @returns {Object} Error envelope
 */
export function wrapError(err, correlationId = undefined) {
  const envelope = {
    ok: false,
    code: err instanceof ApiError ? err.code : ErrorCode.INTERNAL,
    message: err.message,
  }

  if (err instanceof ApiError && err.detail !== undefined) {
    envelope.detail = err.detail
  }

  if (correlationId) envelope.correlationId = correlationId

  return envelope
}
