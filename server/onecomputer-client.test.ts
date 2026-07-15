import { describe, expect, it, vi } from 'vitest'
import { OneComputerClient } from './onecomputer-client.js'

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
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'oc_org_visual-secret', projectId: 'project_abc', fetcher })

    await expect(client.getVisualScreenshot('sandbox-1')).resolves.toEqual(png)
    expect(fetcher).toHaveBeenCalledWith('https://onecomputer.example/v1/sandboxes/sandbox-1/visual/screenshot', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer oc_org_visual-secret', Accept: 'image/png', 'X-Project-Id': 'project_abc' }),
    }))
  })
})
