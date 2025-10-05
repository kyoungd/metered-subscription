import { describe, it, expect, beforeEach } from 'vitest'
import { createContainer } from '../../lib/scaffold/di.js'

describe('di', () => {
  let env

  beforeEach(() => {
    env = {
      service: 'test-service',
      version: '1.0.0',
      nodeEnv: 'test',
      httpPort: 3000,
      logLevel: 'info',
      tenantHeader: 'x-tenant-id',
    }
  })

  describe('createContainer', () => {
    it('should create container with env', () => {
      const container = createContainer(env)

      expect(container).toBeDefined()
      expect(container.env).toBe(env)
      expect(container.service).toBe('test-service')
      expect(container.version).toBe('1.0.0')
    })

    it('should create request context with headers', () => {
      const container = createContainer(env)
      const headers = new Headers({
        'x-request-id': 'req-123',
        'x-correlation-id': 'cor-456',
        'x-tenant-id': 'tenant-789',
      })

      const ctx = container.createRequestContext(headers)

      expect(ctx).toBeDefined()
      expect(ctx.logger).toBeDefined()
      expect(ctx.call_state).toBeDefined()
    })

    it('should include correlation IDs in call_state', () => {
      const container = createContainer(env)
      const headers = new Headers({
        'x-request-id': 'req-abc',
        'x-correlation-id': 'cor-xyz',
      })

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.requestId).toBe('req-abc')
      expect(call_state.correlationId).toBe('cor-xyz')
    })

    it('should generate IDs when not provided', () => {
      const container = createContainer(env)
      const headers = new Headers()

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.requestId).toBeDefined()
      expect(call_state.correlationId).toBeDefined()
      expect(call_state.requestId).toBe(call_state.correlationId)
    })

    it('should include tenant ID in call_state', () => {
      const container = createContainer(env)
      const headers = new Headers({
        'x-tenant-id': 'tenant-123',
      })

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.tenantId).toBe('tenant-123')
    })

    it('should respect custom tenant header', () => {
      const customEnv = {
        ...env,
        tenantHeader: 'x-custom-tenant',
      }
      const container = createContainer(customEnv)
      const headers = new Headers({
        'x-custom-tenant': 'custom-tenant-456',
      })

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.tenantId).toBe('custom-tenant-456')
    })

    it('should include issuedAt timestamp in call_state', () => {
      const container = createContainer(env)
      const headers = new Headers()

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.issuedAt).toBeDefined()
      expect(typeof call_state.issuedAt).toBe('string')
      expect(new Date(call_state.issuedAt).toISOString()).toBe(call_state.issuedAt)
    })

    it('should include logger in call_state', () => {
      const container = createContainer(env)
      const headers = new Headers()

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.logger).toBeDefined()
      expect(typeof call_state.logger.info).toBe('function')
    })

    it('should include env in call_state', () => {
      const container = createContainer(env)
      const headers = new Headers()

      const { call_state } = container.createRequestContext(headers)

      expect(call_state.env).toBe(env)
    })

    it('should create separate contexts for different requests', () => {
      const container = createContainer(env)
      const headers1 = new Headers({ 'x-request-id': 'req-1' })
      const headers2 = new Headers({ 'x-request-id': 'req-2' })

      const ctx1 = container.createRequestContext(headers1)
      const ctx2 = container.createRequestContext(headers2)

      expect(ctx1.call_state.requestId).toBe('req-1')
      expect(ctx2.call_state.requestId).toBe('req-2')
      expect(ctx1.call_state).not.toBe(ctx2.call_state)
    })

    it('should bind request IDs to logger', () => {
      const container = createContainer(env)
      const headers = new Headers({
        'x-request-id': 'req-123',
        'x-correlation-id': 'cor-456',
      })

      const { logger } = container.createRequestContext(headers)
      const bindings = logger.bindings()

      expect(bindings.request_id).toBe('req-123')
      expect(bindings.correlation_id).toBe('cor-456')
    })
  })
})
