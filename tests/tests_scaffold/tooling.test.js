import { describe, it, expect } from 'vitest'
import { ensureIds } from '../../lib/scaffold/correlation.js'
import { wrapSuccess, wrapError, ApiError, ErrorCode } from '../../lib/scaffold/envelope.js'
import { db, ping, withTx } from '../../lib/scaffold/db.js'

describe('tooling utilities', () => {
  describe('correlation helpers', () => {
    it('should generate request ID when not provided', () => {
      const headers = new Headers()
      const ids = ensureIds(headers)

      expect(ids.requestId).toBeDefined()
      expect(typeof ids.requestId).toBe('string')
      expect(ids.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('should use provided request ID', () => {
      const headers = new Headers({ 'x-request-id': 'custom-req-id' })
      const ids = ensureIds(headers)

      expect(ids.requestId).toBe('custom-req-id')
    })

    it('should use request ID as correlation ID when not provided', () => {
      const headers = new Headers({ 'x-request-id': 'req-123' })
      const ids = ensureIds(headers)

      expect(ids.correlationId).toBe('req-123')
    })

    it('should use provided correlation ID', () => {
      const headers = new Headers({
        'x-request-id': 'req-123',
        'x-correlation-id': 'cor-456',
      })
      const ids = ensureIds(headers)

      expect(ids.correlationId).toBe('cor-456')
    })

    it('should extract tenant ID', () => {
      const headers = new Headers({ 'x-tenant-id': 'tenant-789' })
      const ids = ensureIds(headers)

      expect(ids.tenantId).toBe('tenant-789')
    })

    it('should respect custom tenant header', () => {
      const headers = new Headers({ 'x-custom-tenant': 'custom-tenant-123' })
      const ids = ensureIds(headers, 'x-custom-tenant')

      expect(ids.tenantId).toBe('custom-tenant-123')
    })
  })

  describe('envelope helpers', () => {
    it('should wrap success with data', () => {
      const data = { result: 'success' }
      const envelope = wrapSuccess(data)

      expect(envelope.ok).toBe(true)
      expect(envelope.data).toEqual(data)
    })

    it('should include meta when provided', () => {
      const data = { result: 'success' }
      const meta = { page: 1, total: 100 }
      const envelope = wrapSuccess(data, meta)

      expect(envelope.meta).toEqual(meta)
    })

    it('should include correlation ID when provided', () => {
      const data = { result: 'success' }
      const envelope = wrapSuccess(data, undefined, 'cor-123')

      expect(envelope.correlationId).toBe('cor-123')
    })

    it('should wrap API error', () => {
      const error = new ApiError(ErrorCode.NOT_FOUND, 'Resource not found', 404)
      const envelope = wrapError(error)

      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe(ErrorCode.NOT_FOUND)
      expect(envelope.message).toBe('Resource not found')
    })

    it('should include error detail when provided', () => {
      const error = new ApiError(ErrorCode.BAD_REQUEST, 'Invalid input', 400, { field: 'email' })
      const envelope = wrapError(error)

      expect(envelope.detail).toEqual({ field: 'email' })
    })

    it('should wrap generic error as INTERNAL', () => {
      const error = new Error('Something went wrong')
      const envelope = wrapError(error)

      expect(envelope.ok).toBe(false)
      expect(envelope.code).toBe(ErrorCode.INTERNAL)
      expect(envelope.message).toBe('Something went wrong')
    })

    it('should include correlation ID in error envelope', () => {
      const error = new Error('Test error')
      const envelope = wrapError(error, 'cor-456')

      expect(envelope.correlationId).toBe('cor-456')
    })
  })

  describe('ApiError', () => {
    it('should create error with code and message', () => {
      const error = new ApiError(ErrorCode.UNAUTHORIZED, 'Access denied')

      expect(error.code).toBe(ErrorCode.UNAUTHORIZED)
      expect(error.message).toBe('Access denied')
      expect(error.httpStatus).toBe(400)
    })

    it('should accept custom HTTP status', () => {
      const error = new ApiError(ErrorCode.NOT_FOUND, 'Not found', 404)

      expect(error.httpStatus).toBe(404)
    })

    it('should accept detail object', () => {
      const detail = { field: 'username', reason: 'already exists' }
      const error = new ApiError(ErrorCode.CONFLICT, 'Conflict', 409, detail)

      expect(error.detail).toEqual(detail)
    })

    it('should be instance of Error', () => {
      const error = new ApiError(ErrorCode.BAD_REQUEST, 'Bad request')

      expect(error instanceof Error).toBe(true)
      expect(error.name).toBe('ApiError')
    })
  })

  describe('ErrorCode enum', () => {
    it('should have all required error codes', () => {
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST')
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN')
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND')
      expect(ErrorCode.CONFLICT).toBe('CONFLICT')
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED')
      expect(ErrorCode.INTERNAL).toBe('INTERNAL')
    })
  })

  describe('database client', () => {
    it('should have ping function', async () => {
      const result = await ping()
      expect(result).toBe(true)
    })

    it('should have db client with Prisma methods', () => {
      expect(db).toBeDefined()
      expect(db.$queryRaw).toBeDefined()
      expect(db.$transaction).toBeDefined()
    })

    it('should execute function in withTx', async () => {
      const result = await withTx((tx) => 'test-result')
      expect(result).toBe('test-result')
    })

    it('should pass through async function result', async () => {
      const result = await withTx(async (tx) => {
        return { data: 'async-result' }
      })
      expect(result).toEqual({ data: 'async-result' })
    })
  })
})
