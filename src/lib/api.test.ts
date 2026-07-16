import { describe, expect, it, vi } from 'vitest'
import { ApiError, getRuntimeReadiness, isBackendOfflineError } from './api'

describe('API error boundary', () => {
  it('turns an HTML SPA fallback into a typed backend-offline error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    await expect(getRuntimeReadiness()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'backend_offline',
      status: 200,
    } satisfies Partial<ApiError>)
    expect(isBackendOfflineError(new ApiError('offline', 503, 'backend_offline'))).toBe(true)
    vi.restoreAllMocks()
  })

  it('preserves structured JSON HTTP errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not allowed', code: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(getRuntimeReadiness()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'forbidden',
      status: 403,
      message: 'Not allowed',
    } satisfies Partial<ApiError>)
    vi.restoreAllMocks()
  })
})
