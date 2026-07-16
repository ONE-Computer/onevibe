import { mkdir, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/** Replace a file through a same-directory temporary file and durable flush. */
export const atomicWriteFile = async (filePath: string, data: string | Uint8Array) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporaryPath, filePath)
  } finally {
    if (handle) await handle.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export const atomicWriteJson = async (filePath: string, value: unknown) => {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
