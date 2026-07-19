export type SseFrame = { event: string; data: unknown }

/** Parses one SSE block into a frame; the data payload is JSON-parsed when possible. */
export const parseSseBlock = (block: string): SseFrame | null => {
  const lines = block.split('\n')
  let event = 'message'
  const data: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!data.length) return null
  const raw = data.join('\n')
  try {
    return { event, data: JSON.parse(raw) as unknown }
  } catch {
    return { event, data: raw }
  }
}

/** Yields JSON-parsed `data:` payloads from an SSE body; `[DONE]` and non-JSON keepalives are skipped. */
export const sseFrames = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try { yield JSON.parse(data) as unknown } catch { /* Ignore non-JSON provider keepalives. */ }
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}
