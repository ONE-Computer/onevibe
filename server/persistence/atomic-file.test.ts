import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicWriteFile, atomicWriteJson } from './atomic-file.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('atomic file persistence', () => {
  it('replaces JSON as one complete same-directory write and removes its temporary file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-atomic-file-'))
    roots.push(root)
    const filePath = path.join(root, 'nested', 'state.json')
    await atomicWriteJson(filePath, { version: 1, status: 'old' })
    await atomicWriteJson(filePath, { version: 2, status: 'complete' })

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ version: 2, status: 'complete' })
    expect((await readdir(path.dirname(filePath))).filter((entry) => entry.includes('.tmp-'))).toEqual([])
  })

  it('supports binary payloads without changing the final path contract', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-atomic-bytes-'))
    roots.push(root)
    const filePath = path.join(root, 'payload.bin')
    await atomicWriteFile(filePath, Uint8Array.from([0, 1, 2, 255]))
    expect([...await readFile(filePath)]).toEqual([0, 1, 2, 255])
  })
})
