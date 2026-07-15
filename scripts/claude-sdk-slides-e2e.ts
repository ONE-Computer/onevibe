const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 10 * 60_000))

type Snapshot = {
  id: string
  status: string
  events: Array<{ type: string; label?: string; payload: Record<string, unknown> }>
  messages: Array<{ role: string; status: string; content: string }>
}

const request = async <T>(pathname: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}

const waitForTerminal = async (taskId: string) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const task = await request<Snapshot>(`/api/tasks/${taskId}`)
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Slide task ${taskId} did not finish within ${timeoutMs}ms`)
}

const download = async (taskId: string, filePath: string) => {
  const response = await fetch(`${baseUrl}/api/tasks/${taskId}/file?path=${encodeURIComponent(filePath)}&download=1`)
  if (!response.ok) throw new Error(`Unable to download ${filePath}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

const main = async () => {
  const readiness = await request<{ providers: Array<{ id: string; available: boolean; label: string }> }>('/api/runtime')
  const claude = readiness.providers.find((provider) => provider.id === 'claude_sdk')
  if (!claude?.available) throw new Error('Claude SDK is unavailable for the local slides proof')
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'claude_sdk', mode: 'slides', projectId: 'project_onevibe', references: [], attachments: [], skills: ['slides', 'security_review'],
      prompt: 'Create an eight-slide executive update about ONEVibe: the enterprise need, governed agent workspace, local Claude-through-LiteLLM architecture, durable conversations, artifact rail, security boundary, delivery roadmap, and next decision. Use concise management-ready language. Render the real deck and PDF; do not access external services.',
    }),
  })
  const task = await waitForTerminal(created.id)
  if (task.status !== 'completed') throw new Error(`Claude slide task ended ${task.status}`)
  const renderCall = task.events.find((event) => event.type === 'tool_call_started' && event.label === 'mcp__onevibe__render_slide_deck')
  if (!renderCall) throw new Error('Claude did not invoke the governed slide renderer')
  const [pptx, pdf, outline] = await Promise.all([
    download(task.id, 'deck.pptx'), download(task.id, 'deck.pdf'), request<{ content: string }>(`/api/tasks/${task.id}/file?path=outline.json`),
  ])
  if (String.fromCharCode(...pptx.subarray(0, 2)) !== 'PK') throw new Error('PPTX export is not a ZIP-based Office document')
  if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') throw new Error('PDF export has an invalid signature')
  const slides = JSON.parse(outline.content) as unknown[]
  if (slides.length !== 8) throw new Error(`Expected eight structured slides, found ${slides.length}`)
  const evidence = await request<{ valid: boolean }>(`/api/tasks/${task.id}/evidence`)
  if (!evidence.valid) throw new Error('Slide task evidence chain is invalid')
  console.log(JSON.stringify({ taskId: task.id, provider: claude.label, slides: slides.length, pptxBytes: pptx.length, pdfBytes: pdf.length, evidenceValid: true }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
