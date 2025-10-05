/**
 * Scrub authorization tokens from objects before logging
 * @param {any} obj - Object to scrub
 * @returns {any} Scrubbed object
 */
function scrubAuthTokens(obj) {
  if (!obj || typeof obj !== 'object') return obj

  const scrubbed = Array.isArray(obj) ? [...obj] : { ...obj }

  for (const key in scrubbed) {
    if (key.toLowerCase().includes('authorization') || key.toLowerCase().includes('token')) {
      scrubbed[key] = '[REDACTED]'
    } else if (typeof scrubbed[key] === 'object') {
      scrubbed[key] = scrubAuthTokens(scrubbed[key])
    }
  }

  return scrubbed
}

/**
 * Build HTTP headers for outgoing requests
 * @param {Object} params - Parameters
 * @param {import('../config.js').EnvConfig} params.env - Environment config
 * @param {Object} params.callState - Call state with correlation IDs
 * @param {Object} [params.extra] - Extra headers to include
 * @returns {Record<string, string>} Headers object
 */
export function buildHeaders({ env, callState, extra = {} }) {
  const headers = {
    'user-agent': `${env.service}/${env.version}`,
    'x-request-id': callState.requestId,
    'x-correlation-id': callState.correlationId,
  }

  if (callState.tenantId) {
    headers[env.tenantHeader] = callState.tenantId
  }

  // Add extra headers (like authorization)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null) {
      headers[key] = value
    }
  }

  return headers
}

import { writeDebugLog } from '../debug-log.js'

/**
 * Create HTTP client factory
 * @param {import('../config.js').EnvConfig} env - Environment config
 * @param {import('pino').Logger} [logger] - Optional logger instance
 * @returns {Object} HTTP client with get, post, put, del methods
 */
export function http(env, logger) {
  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async function request(method, url, options = {}) {
    const { headers = {}, body } = options

    // Log outgoing request
    if (logger) {
      logger.info({
        message: 'External API request',
        source: 'outgoing',
        method,
        url,
        headers: scrubAuthTokens(headers),
        body: body ? (typeof body === 'string' ? body.substring(0, 500) : body) : undefined,
      })
    }

    // Write outgoing request to debug log
    writeDebugLog({
      category: 'rest_out',
      type: method,
      path: url,
      payload: {
        method,
        url,
        headers: scrubAuthTokens(headers),
        body: body || null,
      },
    })

    if (env.dryRun) {
      // Dry-run mode: return stub without network call
      const stubResponse = {
        status: 200,
        ok: true,
        json: {
          stub: true,
          method,
          url,
          body: body || undefined,
          headers: scrubAuthTokens(headers),
        },
      }

      if (logger) {
        logger.info({
          message: 'External API response (dry-run)',
          source: 'incoming',
          method,
          url,
          status: stubResponse.status,
          response: stubResponse.json,
        })
      }

      return stubResponse
    }

    // Real HTTP request
    const fetchOptions = {
      method,
      headers,
    }

    if (body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    try {
      const response = await fetch(url, fetchOptions)

      // Parse response
      const contentType = response.headers.get('content-type')
      let data

      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      const result = {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        json: data,
      }

      // Log response
      if (logger) {
        logger.info({
          message: 'External API response',
          source: 'incoming',
          method,
          url,
          status: result.status,
          ok: result.ok,
          response: result.json,
        })
      }

      // Write response to debug log
      writeDebugLog({
        category: 'rest_out',
        type: `${method}_RESPONSE`,
        path: url,
        payload: {
          status: result.status,
          ok: result.ok,
          response: result.json,
        },
      })

      return result
    } catch (error) {
      if (logger) {
        logger.error({
          message: 'External API request failed',
          method,
          url,
          error: error.message,
        })
      }
      throw new Error(`HTTP ${method} ${url} failed: ${error.message}`)
    }
  }

  return {
    /**
     * HTTP GET
     * @param {string} url - URL
     * @param {Object} options - Options
     * @returns {Promise<Object>} Response
     */
    async get(url, options = {}) {
      return request('GET', url, options)
    },

    /**
     * HTTP POST
     * @param {string} url - URL
     * @param {Object} options - Options
     * @returns {Promise<Object>} Response
     */
    async post(url, options = {}) {
      return request('POST', url, options)
    },

    /**
     * HTTP PUT
     * @param {string} url - URL
     * @param {Object} options - Options
     * @returns {Promise<Object>} Response
     */
    async put(url, options = {}) {
      return request('PUT', url, options)
    },

    /**
     * HTTP DELETE
     * @param {string} url - URL
     * @param {Object} options - Options
     * @returns {Promise<Object>} Response
     */
    async del(url, options = {}) {
      return request('DELETE', url, options)
    },
  }
}
