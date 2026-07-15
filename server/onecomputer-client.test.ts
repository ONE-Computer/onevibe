import { describe, expect, it, vi } from 'vitest'
import { OneComputerClient } from './onecomputer-client.js'

describe('OneComputerClient', () => {
  it('provisions through the authenticated production sandbox route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'sandbox-1', state: 'started', provider: 'kasm-local' }), { status: 201 }))
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example/', serviceToken: 'server-only', fetcher })
    await expect(client.createSandbox('onevibe-test')).resolves.toMatchObject({ id: 'sandbox-1', state: 'started' })
    expect(fetcher).toHaveBeenCalledWith('https://onecomputer.example/v1/sandboxes', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer server-only' }),
    }))
  })

  it('has no portal approval decision method', () => {
    const client = new OneComputerClient({ baseUrl: 'https://onecomputer.example', serviceToken: 'server-only' })
    expect('decideApproval' in client).toBe(false)
  })
})
