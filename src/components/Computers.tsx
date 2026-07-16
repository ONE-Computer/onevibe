import { Activity, ExternalLink, Eye, MonitorCog, Plus, ShieldCheck, TerminalSquare, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useState, type FormEvent } from 'react'
import { getRuntimeDiagnostics, testRuntime } from '../lib/api'
import type { RuntimeDiagnostics, RuntimeHealth, RuntimeMcpConfig, RuntimeReadiness, Task } from '../types'
import { statusLabel } from '../lib/runtime-labels'

type Props = { tasks: Task[]; onOpenTask: (taskId: string) => void; runtime?: RuntimeReadiness; mcpConfigs: RuntimeMcpConfig[]; onCreateMcpConfig: (input: Pick<RuntimeMcpConfig, 'name' | 'command' | 'args'>) => Promise<void>; onDeleteMcpConfig: (config: RuntimeMcpConfig) => Promise<void> }

const boundaryLabel = (task: Task) => task.securityContext?.executionBoundary === 'onecomputer_sandbox'
  ? 'ONEComputer sandbox'
  : task.securityContext?.executionBoundary === 'remote_runtime'
    ? 'Remote runtime'
    : 'Local host process'

const lifecycleLabel = (task: Task) => task.securityContext?.destroyedAt
  ? 'Destroyed'
  : task.securityContext?.sandboxState
    ? task.securityContext.sandboxState.replaceAll('_', ' ')
    : statusLabel(task.status)

export const Computers = ({ tasks, onOpenTask, runtime, mcpConfigs, onCreateMcpConfig, onDeleteMcpConfig }: Props) => {
  const [health, setHealth] = useState<Record<string, RuntimeHealth>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [mcpName, setMcpName] = useState('')
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpArgs, setMcpArgs] = useState('')
  const [mcpSaving, setMcpSaving] = useState(false)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>()
  const computers = tasks.filter((task) => task.securityContext).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  useEffect(() => { void getRuntimeDiagnostics().then(setDiagnostics).catch(() => undefined) }, [])
  const runHealthCheck = async (provider: Task['provider']) => {
    setTesting(provider)
    try {
      const result = await testRuntime(provider)
      setHealth((current) => ({ ...current, [provider]: result.health }))
    } catch {
      setHealth((current) => ({ ...current, [provider]: { status: 'offline', detail: 'Health request failed at the ONEVibe API.' } }))
    } finally {
      setTesting(null)
    }
  }
  const submitMcp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!mcpName.trim() || !mcpCommand.trim()) return
    setMcpSaving(true)
    try {
      await onCreateMcpConfig({ name: mcpName.trim(), command: mcpCommand.trim(), args: mcpArgs.trim() ? mcpArgs.trim().split(/\s+/) : [] })
      setMcpName(''); setMcpCommand(''); setMcpArgs('')
    } finally { setMcpSaving(false) }
  }
  return <section className="computers-view">
    <header><div><span className="task-kicker">Runtimes</span><h1>Computers</h1><p>Task-derived inventory of the runtimes ONEVibe has observed. This view is read-only: it does not provision, restart, terminate, or otherwise control an infrastructure provider.</p></div><MonitorCog size={28} /></header>
    {runtime && <section className="runtime-health-panel" aria-label="Runtime health"><header><div><span>Runtime registry</span><strong>Connectivity checks</strong></div><small>Server-side probes only · no model prompt is sent</small></header><div className="runtime-health-grid">{runtime.providers.map((provider) => { const result = health[provider.id]; const status = result?.status ?? provider.healthStatus ?? (provider.available ? 'unknown' : 'not_configured'); return <article key={provider.id}><div><span className={`runtime-health-dot ${status}`} /><strong>{provider.label}</strong></div><small>{result?.detail ?? provider.detail}</small>{result?.latencyMs !== undefined && <span>{result.latencyMs} ms</span>}{provider.healthCheckedAt && !result && <time dateTime={provider.healthCheckedAt}>Checked {new Date(provider.healthCheckedAt).toLocaleTimeString()}</time>}<button type="button" disabled={testing === provider.id} onClick={() => void runHealthCheck(provider.id)}>{testing === provider.id ? 'Testing…' : result || provider.healthStatus ? 'Test again' : 'Test runtime'}</button></article> })}</div></section>}
    {diagnostics && <section className="diagnostics-panel" aria-labelledby="diagnostics-title"><header><div><span>System status</span><strong id="diagnostics-title">Execution path</strong></div><small>Truthful server-side readiness; credentials and prompts are never displayed.</small></header><div className="diagnostics-grid"><article><strong>LiteLLM</strong><span className={diagnostics.modelBoundary.configured ? 'diagnostic-ok' : 'diagnostic-warn'}>{diagnostics.modelBoundary.configured ? 'Configured' : 'Needs configuration'}</span><small>{diagnostics.modelBoundary.detail}</small></article><article><strong>Session</strong><span>{diagnostics.auth.enabled ? diagnostics.auth.sessionScoped ? 'Scoped' : 'No session' : 'Local mode'}</span><small>{diagnostics.auth.detail}</small></article><article><strong>Persistence</strong><span>{diagnostics.persistence.active}</span><small>{diagnostics.persistence.detail}</small></article><article><strong>Sandbox</strong><span>{diagnostics.sandbox.reachable === true ? 'Reachable' : diagnostics.sandbox.configured ? 'Configured' : 'Not configured'}</span><small>{diagnostics.sandbox.detail}</small></article><article><strong>MCP</strong><span>{diagnostics.mcp.configuredCount} configured</span><small>{diagnostics.mcp.detail}</small></article></div></section>}
    <section className="mcp-config-panel" aria-labelledby="mcp-config-title">
      <header><div><span>Tool connections</span><strong id="mcp-config-title">MCP servers</strong></div><small>Declarations are stored locally and injected only into tool-capable runtimes.</small></header>
      <p className="mcp-config-note">Credentials are never accepted here. Secret references and multi-user ownership belong to the upcoming authenticated server boundary.</p>
      <form className="mcp-config-form" onSubmit={(event) => void submitMcp(event)}>
        <label>Display name<input value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="Internal tools" maxLength={80} /></label>
        <label>Command<input value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} placeholder="npx" maxLength={200} /></label>
        <label>Arguments<input value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} placeholder="-y @example/mcp-server" maxLength={2_000} /></label>
        <button type="submit" disabled={mcpSaving || !mcpName.trim() || !mcpCommand.trim()}><Plus size={14} /> {mcpSaving ? 'Saving…' : 'Add server'}</button>
      </form>
      {mcpConfigs.length ? <ul className="mcp-config-list">{mcpConfigs.map((config) => <li key={config.id}><div><strong>{config.name}</strong><code>{config.command}{config.args.length ? ` ${config.args.join(' ')}` : ''}</code></div><button type="button" onClick={() => void onDeleteMcpConfig(config)} aria-label={`Remove ${config.name}`} title="Remove MCP server"><Trash2 size={14} /></button></li>)}</ul> : <div className="mcp-config-empty">No MCP servers configured. Add a declaration to make it available to the next Claude tool-use turn.</div>}
    </section>
    {!computers.length ? <div className="computers-empty"><MonitorCog size={22} /><strong>No governed runtimes observed</strong><span>Start a task to record its execution boundary, lifecycle evidence, and visual-runtime readiness here.</span></div> : <div className="computers-grid">{computers.map((task) => {
      const context = task.securityContext!
      return <motion.article layout key={task.id}>
        <div className="computer-card-head"><span><TerminalSquare size={12} /> {boundaryLabel(task)}</span><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time></div>
        <h2>{task.title}</h2>
        <dl>
          <div><dt>Lifecycle</dt><dd><Activity size={12} /> {lifecycleLabel(task)}</dd></div>
          <div><dt>Gateway</dt><dd className={context.gatewayEnforced ? 'attested' : 'unattested'}><ShieldCheck size={12} /> {context.gatewayEnforced ? 'Enforced' : 'Not attested'}</dd></div>
          <div><dt>Visual runtime</dt><dd><Eye size={12} /> {context.visualRuntimeReady ? 'Ready' : 'Unavailable'}</dd></div>
          <div><dt>Provider reference</dt><dd className="computer-reference">{context.sandboxId ?? context.runtimeSessionId ?? context.provider ?? 'Not reported'}</dd></div>
        </dl>
        <footer><small>Observation only · no provider controls</small><button onClick={() => onOpenTask(task.id)}>Open task <ExternalLink size={13} /></button></footer>
      </motion.article>
    })}</div>}
  </section>
}
