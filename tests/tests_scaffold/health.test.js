import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../../app/api/health/route.js'

describe('health endpoint', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.MTR_SERVICE = 'test-service'
    process.env.MTR_VERSION = '1.0.0'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return 200 with ok status', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.data.status).toBe('ok')
  })

  it('should include service name and version', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const body = await response.json()
    expect(body.data.service).toBe('test-service')
    expect(body.data.version).toBe('1.0.0')
  })

  it('should include correlation ID', async () => {
    const request = new Request('http://localhost:3000/api/health', {
      headers: {
        'x-correlation-id': 'test-correlation-123',
      },
    })
    const response = await GET(request)

    const body = await response.json()
    expect(body.correlationId).toBe('test-correlation-123')
  })

  it('should generate correlation ID if not provided', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const body = await response.json()
    expect(body.correlationId).toBeDefined()
    expect(typeof body.correlationId).toBe('string')
  })

  it('should use request ID as correlation ID when correlation ID not provided', async () => {
    const request = new Request('http://localhost:3000/api/health', {
      headers: {
        'x-request-id': 'test-request-456',
      },
    })
    const response = await GET(request)

    const body = await response.json()
    expect(body.correlationId).toBe('test-request-456')
  })

  it('should handle tenant header', async () => {
    const request = new Request('http://localhost:3000/api/health', {
      headers: {
        'x-tenant-id': 'tenant-789',
      },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  it('should not include database check', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const body = await response.json()
    expect(body.data).not.toHaveProperty('database')
    expect(body.data).not.toHaveProperty('db')
  })

  it('should return consistent response structure', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const body = await response.json()
    expect(body).toHaveProperty('ok')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('correlationId')
    expect(body.data).toHaveProperty('status')
    expect(body.data).toHaveProperty('service')
    expect(body.data).toHaveProperty('version')
  })

  it('should return json response', async () => {
    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const contentType = response.headers.get('content-type')
    expect(contentType).toContain('application/json')

    const body = await response.json()
    expect(typeof body).toBe('object')
  })

  it('should work with custom service configuration', async () => {
    process.env.MTR_SERVICE = 'custom-api'
    process.env.MTR_VERSION = '2.3.4'

    const request = new Request('http://localhost:3000/api/health')
    const response = await GET(request)

    const body = await response.json()
    expect(body.data.service).toBe('custom-api')
    expect(body.data.version).toBe('2.3.4')
  })
})
