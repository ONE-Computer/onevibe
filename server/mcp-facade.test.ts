import { describe, expect, it } from 'vitest'
import { McpCapabilityFacade, probeMcpConfig } from './mcp-facade.js'

const fixtureServer = `
process.stdin.setEncoding('utf8')
let buffer = ''
const writeResponse = (response, framed) => {
  const body = JSON.stringify(response)
  process.stdout.write(framed ? 'Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body : body + '\\n')
}
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    const request = JSON.parse(line)
    if (request.id === undefined) continue
    let result
    if (request.method === 'initialize') {
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } }
    } else if (request.method === 'tools/list') {
      result = { tools: [{ name: 'lookup_record', description: 'Look up a customer record', inputSchema: { type: 'object' } }] }
    } else if (request.method === 'tools/call') {
      result = { content: [{ type: 'text', text: 'fixture executed' }], isError: false }
    } else {
      writeResponse({ jsonrpc: '2.0', id: request.id, error: { message: 'unknown method' } }, false)
      continue
    }
    writeResponse({ jsonrpc: '2.0', id: request.id, result }, request.method === 'tools/list')
  }
})
`

describe('MCP capability facade', () => {
  it('searches and executes only a capability returned by the catalog', async () => {
    const facade = new McpCapabilityFacade([{
      id: 'fixture', name: 'Fixture MCP', command: process.execPath, args: ['-e', fixtureServer], env: { SECRET: 'must-not-be-forwarded' },
    }])
    try {
      const matches = await facade.search('customer lookup')
      expect(matches).toEqual([expect.objectContaining({ id: 'fixture:lookup_record', name: 'lookup_record', server: 'Fixture MCP' })])
      await expect(facade.execute('fixture:lookup_record', { customerId: 'cus_123' })).resolves.toEqual({
        content: [{ type: 'text', text: 'fixture executed' }], isError: false,
      })
      await expect(facade.execute('fixture:unknown', {})).rejects.toThrow(/not found/)
    } finally {
      facade.close()
    }
  })

  it('rejects an aborted search before spawning work', async () => {
    const controller = new AbortController()
    controller.abort()
    const facade = new McpCapabilityFacade([])
    await expect(facade.search('lookup', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    facade.close()
  })

  it('probes a server without returning process output or retaining a client', async () => {
    const result = await probeMcpConfig({
      id: 'fixture', name: 'Fixture MCP', command: process.execPath, args: ['-e', fixtureServer], env: { SECRET: 'must-not-be-forwarded' },
    })
    expect(result).toMatchObject({ status: 'online', toolCount: 1 })
    expect(result.detail).not.toContain('fixture executed')
  })
})
