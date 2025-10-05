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

/**
 * Create HTTP client factory
 * @param {import('../config.js').EnvConfig} env - Environment config
 * @returns {Object} HTTP client with get, post, put, del methods
 */
export function http(env) {
  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async function request(method, url, options = {}) {
    const { headers = {}, body } = options

    if (env.dryRun) {
      // Dry-run mode: return stub without network call
      return {
        status: 200,
        json: {
          stub: true,
          method,
          url,
          body: body || undefined,
          headers: scrubAuthTokens(headers),
        },
      }
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

      return {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        json: data,
      }
    } catch (error) {
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
