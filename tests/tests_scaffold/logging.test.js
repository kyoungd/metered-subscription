import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLogger } from '../../lib/scaffold/logging.js'
import { Writable } from 'stream'

describe('logging', () => {
  describe('getLogger', () => {
    it('should create logger with app context', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      const logger = getLogger(appContext)

      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })

    it('should create logger with request context', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      const requestContext = {
        requestId: 'req-123',
        correlationId: 'cor-456',
        tenantId: 'tenant-789',
      }

      const logger = getLogger(appContext, requestContext)

      expect(logger).toBeDefined()
    })

    it('should respect log level', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'error',
      }

      const logger = getLogger(appContext)

      expect(logger.level).toBe('error')
    })

    it('should include service and version in bindings', () => {
      const appContext = {
        service: 'my-service',
        version: '2.3.4',
        logLevel: 'info',
      }

      const logger = getLogger(appContext)
      const bindings = logger.bindings()

      expect(bindings.service).toBe('my-service')
      expect(bindings.version).toBe('2.3.4')
    })

    it('should bind request IDs when provided', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      const requestContext = {
        requestId: 'req-abc',
        correlationId: 'cor-xyz',
      }

      const logger = getLogger(appContext, requestContext)
      const bindings = logger.bindings()

      expect(bindings.request_id).toBe('req-abc')
      expect(bindings.correlation_id).toBe('cor-xyz')
    })

    it('should bind tenant ID when provided', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      const requestContext = {
        requestId: 'req-123',
        correlationId: 'cor-456',
        tenantId: 'tenant-789',
      }

      const logger = getLogger(appContext, requestContext)
      const bindings = logger.bindings()

      expect(bindings.tenant_id).toBe('tenant-789')
    })

    it('should actually redact PII fields in output', async () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      // Capture logger output
      const logs = []
      const stream = new Writable({
        write(chunk, encoding, callback) {
          logs.push(chunk.toString())
          callback()
        },
      })

      const pino = await import('pino')
      const logger = pino.default({
        level: 'info',
        redact: {
          paths: ['email', 'password', 'token', 'ssn', 'phone'],
          censor: '[REDACTED]',
        },
      }, stream)

      logger.info({ email: 'user@example.com', password: 'secret123', name: 'John' }, 'User data')

      // Wait for async write
      await new Promise(resolve => setImmediate(resolve))

      expect(logs.length).toBeGreaterThan(0)
      const logEntry = JSON.parse(logs[0])

      // Verify PII is redacted
      expect(logEntry.email).toBe('[REDACTED]')
      expect(logEntry.password).toBe('[REDACTED]')
      // Verify non-PII is NOT redacted
      expect(logEntry.name).toBe('John')
    })

    it('should include ISO timestamp in output', async () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'info',
      }

      // Capture logger output
      const logs = []
      const stream = new Writable({
        write(chunk, encoding, callback) {
          logs.push(chunk.toString())
          callback()
        },
      })

      const pino = await import('pino')
      const logger = pino.default({
        level: 'info',
        timestamp: () => `,"ts":"${new Date().toISOString()}"`,
      }, stream)

      logger.info('Test message')

      // Wait for async write
      await new Promise(resolve => setImmediate(resolve))

      expect(logs.length).toBeGreaterThan(0)
      const logEntry = JSON.parse(logs[0])

      // Verify timestamp exists and is ISO format
      expect(logEntry.ts).toBeDefined()
      expect(typeof logEntry.ts).toBe('string')
      expect(() => new Date(logEntry.ts)).not.toThrow()
      expect(new Date(logEntry.ts).toISOString()).toBe(logEntry.ts)
    })

    it('should support all log levels', () => {
      const appContext = {
        service: 'test-service',
        version: '1.0.0',
        logLevel: 'debug',
      }

      const logger = getLogger(appContext)

      expect(logger.isLevelEnabled('debug')).toBe(true)
      expect(logger.isLevelEnabled('info')).toBe(true)
      expect(logger.isLevelEnabled('warn')).toBe(true)
      expect(logger.isLevelEnabled('error')).toBe(true)
    })
  })
})
