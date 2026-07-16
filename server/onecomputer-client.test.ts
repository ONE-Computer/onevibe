import { describe, expect, it, vi } from 'vitest'
import { OneComputerApiError, OneComputerClient } from './onecomputer-client.js'

describe('OneComputerClient', () => {
  it('provisions through the authenticated production sandbox route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'sandbox-1', state: 'started', provider: 'kasm-local' }), { status: 201 }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example/', serviceToken: 'oc_org_server-only', projectId: 'project_abc', fetcher })
    await expect(client.createSandbox('onevibe-test')).resolves.toMatchObject({ id: 'sandbox-1', state: 'started' })
    expect(fetcher).toHaveBeenCalledWith('https://onecomputer.example/v1/sandboxes', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer oc_org_server-only', 'X-Project-Id': 'project_abc' }),
    }))
  })

  it('has no portal approval decision method', () => {
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'server-only' })
    expect('decideApproval' in client).toBe(false)
  })

  it('performs a short authenticated provider health probe without projecting credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', version: '2026.07' }), { status: 200 }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'server-only-health', projectId: 'project_abc', fetcher })
    await expect(client.health()).resolves.toEqual({ status: 'ok', version: '2026.07' })
    expect(fetcher).toHaveBeenCalledWith('https://onecomputer.example/v1/health', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-only-health', 'X-Project-Id': 'project_abc' }) }))
  })

  it('executes and tears down through authenticated sandbox routes', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ exitCode: 0, output: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'server-only', fetcher })

    await expect(client.exec('sandbox/unsafe', 'pwd')).resolves.toEqual({ exitCode: 0, output: 'ok' })
    await expect(client.deleteSandbox('sandbox/unsafe')).resolves.toBeUndefined()

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://onecomputer.example/v1/sandboxes/sandbox%2Funsafe/exec')
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://onecomputer.example/v1/sandboxes/sandbox%2Funsafe')
  })

  it('retrieves X11 screenshots without exposing the service token', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'X-OneComputer-Captured-At': '2026-07-16T00:00:00.000Z' } }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'oc_org_visual-secret', projectId: 'project_abc', fetcher })

    await expect(client.getVisualScreenshot('sandbox-1')).resolves.toEqual({ png, capturedAt: '2026-07-16T00:00:00.000Z' })
    expect(fetcher).toHaveBeenCalledWith('https://onecomputer.example/v1/sandboxes/sandbox-1/visual/screenshot', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer oc_org_visual-secret', Accept: 'image/png', 'X-Project-Id': 'project_abc' }),
    }))
  })

  it('does not propagate provider response bodies into caller-visible errors', async () => {
    const fetcher = vi.fn(async () => new Response('<html>upstream=internal token=never-project-this</html>', { status: 504 })) as unknown as typeof fetch
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'server-secret', fetcher })

    const error = await client.createSandbox('bounded-name').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OneComputerApiError)
    expect(error).toMatchObject({ status: 504, operation: '/v1/sandboxes' })
    expect(String(error)).toBe('OneComputerApiError: ONEComputer /v1/sandboxes returned HTTP 504')
    expect(String(error)).not.toContain('internal')
    expect(String(error)).not.toContain('never-project-this')
    expect(String(error)).not.toContain('server-secret')
  })
})
