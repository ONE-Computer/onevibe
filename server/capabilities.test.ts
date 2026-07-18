import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('onevibe capabilities contract', () => {
  it('returns version 1 from GET /onevibe/capabilities', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-capabilities-'))
    temporaryRoots.push(root)
    const port = 47_000 + Math.floor(Math.random() * 1_000)
    const walletToken = 'capabilities-test-wallet-token-0123456789'
    const command = path.resolve(process.cwd(), 'node_modules/.bin/tsx')
    const env: NodeJS.ProcessEnv = { ...process.env, ONEVIBE_API_PORT: String(port), ONEVIBE_DATA_DIR: root, ONEVIBE_WALLET_TOKEN: walletToken }
    delete env.DATABASE_URL
    delete env.ONEVIBE_PERSISTENCE_DRIVER
    const child = spawn(command, ['server/index.ts'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('ONEVibe API server did not start')), 15_000)
        child.once('error', (error) => { clearTimeout(timeout); reject(error) })
        child.stdout.on('data', (chunk: Buffer) => {
          if (!chunk.toString().includes('ONEVibe API listening')) return
          clearTimeout(timeout); resolve()
        })
        child.stderr.on('data', (chunk: Buffer) => { clearTimeout(timeout); reject(new Error(chunk.toString())) })
      })
      const response = await fetch(`http://127.0.0.1:${port}/onevibe/capabilities`, {
        headers: { authorization: `Bearer ${walletToken}` },
      })
      expect(response.status).toBe(200)
      const body = await response.json() as { version: string }
      expect(body.version).toBe('1')
    } finally {
      child.kill()
    }
  }, 30_000)
})
