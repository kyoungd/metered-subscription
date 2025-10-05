import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getEnv } from '../../lib/scaffold/config.js'

describe('config', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getEnv', () => {
    it('should return frozen config with defaults', () => {
      process.env.NODE_ENV = 'test'
      const config = getEnv()

      expect(config.service).toBe('metered-subscriptions')
      expect(config.version).toBe('0.1.0')
      expect(config.nodeEnv).toBe('test')
      expect(config.httpPort).toBe(3000)
      expect(config.logLevel).toBe('info')
      expect(config.tenantHeader).toBe('x-tenant-id')
      expect(config.betterStackToken).toBeUndefined()
      expect(Object.isFrozen(config)).toBe(true)
    })

    it('should load custom values from environment', () => {
      process.env.NODE_ENV = 'production'
      process.env.MTR_SERVICE = 'custom-service'
      process.env.MTR_VERSION = '1.2.3'
      process.env.MTR_HTTP_PORT = '8080'
      process.env.MTR_LOG_LEVEL = 'debug'
      process.env.MTR_TENANT_HEADER = 'x-custom-tenant'
      process.env.MTR_BETTERSTACK_TOKEN = 'test-token'

      const config = getEnv()

      expect(config.service).toBe('custom-service')
      expect(config.version).toBe('1.2.3')
      expect(config.nodeEnv).toBe('production')
      expect(config.httpPort).toBe(8080)
      expect(config.logLevel).toBe('debug')
      expect(config.tenantHeader).toBe('x-custom-tenant')
      expect(config.betterStackToken).toBe('test-token')
    })

    it('should validate NODE_ENV', () => {
      process.env.NODE_ENV = 'invalid'
      expect(() => getEnv()).toThrow('Invalid NODE_ENV: invalid')
    })

    it('should validate log level', () => {
      process.env.NODE_ENV = 'test'
      process.env.MTR_LOG_LEVEL = 'invalid'
      expect(() => getEnv()).toThrow('Invalid MTR_LOG_LEVEL: invalid')
    })

    it('should validate HTTP port', () => {
      process.env.NODE_ENV = 'test'
      process.env.MTR_HTTP_PORT = 'invalid'
      expect(() => getEnv()).toThrow('Invalid MTR_HTTP_PORT: invalid')
    })

    it('should validate HTTP port range', () => {
      process.env.NODE_ENV = 'test'
      process.env.MTR_HTTP_PORT = '70000'
      expect(() => getEnv()).toThrow('Invalid MTR_HTTP_PORT: 70000')
    })

    it('should accept all valid log levels', () => {
      process.env.NODE_ENV = 'test'
      const levels = ['debug', 'info', 'warn', 'error']

      levels.forEach((level) => {
        process.env.MTR_LOG_LEVEL = level
        const config = getEnv()
        expect(config.logLevel).toBe(level)
      })
    })

    it('should accept all valid node environments', () => {
      const envs = ['development', 'test', 'production']

      envs.forEach((env) => {
        process.env.NODE_ENV = env
        const config = getEnv()
        expect(config.nodeEnv).toBe(env)
      })
    })
  })
})
