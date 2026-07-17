import { Activity, ExternalLink, Eye, MonitorCog, Plus, ShieldCheck, TerminalSquare, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { getRuntimeDiagnostics, testMcpConfig, testRuntime } from '../lib/api'
import type { McpHealth, RuntimeDiagnostics, RuntimeHealth, RuntimeMcpConfig, RuntimeReadiness, Task } from '../types'
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
  const [mcpHealth, setMcpHealth] = useState<Record<string, McpHealth>>({})
  const [mcpTesting, setMcpTesting] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>()
  const computers = tasks.filter((task) => task.securityContext).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  useEffect(() => { void getRuntimeDiagnostics().then(setDiagnostics).catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : 'Unable to load execution diagnostics')) }, [])
  const runHealthCheck = async (provider: Task['provider']) => {
    setTesting(provider)
    try {
      const result = await testRuntime(provider)
      setHealth((current) => ({ ...current, [provider]: result.health }))
    } catch (reason) {
      setHealth((current) => ({ ...current, [provider]: { status: 'offline', detail: 'Health request failed at the ONEVibe API.' } }))
      toast.error(reason instanceof Error ? reason.message : 'Runtime health check failed')
    } finally {
      setTesting(null)
    }
  }
  const getHealthCheckAge = (checkedAt: string | undefined) => {
    if (!checkedAt) return null
    const age = (Date.now() - new Date(checkedAt).getTime()) / 1000 / 60 // age in minutes
    return age > 2 ? age : null
  }
  const allProvidersNotConfigured = runtime && runtime.providers.every((provider) => {
    const status = health[provider.id]?.status ?? provider.healthStatus ?? (provider.available ? 'unknown' : 'not_configured')
    return status === 'not_configured'
  })
  const submitMcp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!mcpName.trim() || !mcpCommand.trim()) return
    setMcpSaving(true)
    try {
      await onCreateMcpConfig({ name: mcpName.trim(), command: mcpCommand.trim(), args: mcpArgs.trim() ? mcpArgs.trim().split(/\s+/) : [] })
      setMcpName(''); setMcpCommand(''); setMcpArgs('')
    } finally { setMcpSaving(false) }
  }
  const runMcpHealth = async (config: RuntimeMcpConfig) => {
    setMcpTesting(config.id)
    try {
      const result = await testMcpConfig(config.id)
      setMcpHealth((current) => ({ ...current, [config.id]: result }))
    } catch (reason) {
      setMcpHealth((current) => ({ ...current, [config.id]: { id: config.id, status: 'offline', detail: 'Health request failed at the ONEVibe API.' } }))
      toast.error(reason instanceof Error ? reason.message : 'MCP health check failed')
    } finally { setMcpTesting(null) }
  }
  return <section className="computers-view">
    <header><div><span className="task-kicker">Runtimes</span><h1>Computers</h1><p>Task-derived inventory of the runtimes ONEVibe has observed. This view is read-only: it does not provision, restart, terminate, or otherwise control an infrastructure provider.</p></div><MonitorCog size={28} /></header>
    {runtime && <section className="runtime-health-panel" aria-label="Runtime health"><header><div><span>Runtime registry</span><strong>Connectivity checks</strong></div><small>Server-side probes only · no model prompt is sent</small></header>{allProvidersNotConfigured ? <p className="empty-state">No runtimes configured. Set ONEVIBE_LITELLM_URL in your .env file to connect a model provider.</p> : <div className="runtime-health-grid">{runtime.providers.map((provider) => { const result = health[provider.id]; const status = result?.status ?? provider.healthStatus ?? (provider.available ? 'unknown' : 'not_configured'); const staleAge = getHealthCheckAge(provider.healthCheckedAt); return <article key={provider.id}><div><span className={`runtime-health-dot ${status}`} /><strong>{provider.label}</strong></div><small>{result?.detail ?? provider.detail}</small>{result?.latencyMs !== undefined && <span>{result.latencyMs} ms</span>}{staleAge ? <time dateTime={provider.healthCheckedAt} title="Click Test again to refresh">Last checked {Math.round(staleAge)} min ago — click Test again to refresh</time> : provider.healthCheckedAt && !result && <time dateTime={provider.healthCheckedAt}>Checked {new Date(provider.healthCheckedAt).toLocaleTimeString()}</time>}<button type="button" disabled={testing === provider.id} onClick={() => void runHealthCheck(provider.id)}>{testing === provider.id ? 'Testing…' : result || provider.healthStatus ? 'Test again' : 'Test runtime'}</button></article> })}</div>}</section>}
    {diagnostics && <section className="diagnostics-panel" aria-labelledby="diagnostics-title"><header><div><span>System status</span><strong id="diagnostics-title">Execution path</strong></div><small>Truthful server-side readiness; credentials and prompts are never displayed.</small></header><div className="diagnostics-grid"><article><strong>LiteLLM</strong><span className={diagnostics.modelBoundary.configured ? 'diagnostic-ok' : 'diagnostic-warn'}>{diagnostics.modelBoundary.configured ? 'Configured' : 'Needs configuration'}</span><small>{diagnostics.modelBoundary.detail}</small></article><article><strong>Session</strong><span>{diagnostics.auth.enabled ? diagnostics.auth.sessionScoped ? 'Scoped' : 'No session' : 'Local mode'}</span><small>{diagnostics.auth.detail}</small></article><article><strong>Persistence</strong><span>{diagnostics.persistence.active}</span><small>{diagnostics.persistence.detail}</small></article><article><strong>Sandbox</strong><span>{diagnostics.sandbox.reachable === true ? 'Reachable' : diagnostics.sandbox.configured ? 'Configured' : 'Not configured'}</span><small>{diagnostics.sandbox.detail}</small></article><article><strong>MCP</strong><span>{diagnostics.mcp.configuredCount ? `${diagnostics.mcp.healthyCount}/${diagnostics.mcp.configuredCount} healthy` : 'None configured'}</span><small>{diagnostics.mcp.detail}</small></article></div></section>}
    <section className="mcp-config-panel" aria-labelledby="mcp-config-title">
      <header><div><span>Tool connections</span><strong id="mcp-config-title">MCP servers</strong></div><small>Declarations are stored locally and injected only into tool-capable runtimes.</small></header>
      <p className="mcp-config-note">Credentials are never accepted here. Secret references and multi-user ownership belong to the upcoming authenticated server boundary.</p>
      <form className="mcp-config-form" onSubmit={(event) => void submitMcp(event)}>
        <label>Display name<input value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="Internal tools" maxLength={80} /></label>
        <label>Command<input value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} placeholder="npx" maxLength={200} /></label>
        <label>Arguments<input value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} placeholder="-y @example/mcp-server" maxLength={2_000} /></label>
        <button type="submit" disabled={mcpSaving || !mcpName.trim() || !mcpCommand.trim()}><Plus size={14} /> {mcpSaving ? 'Saving…' : 'Add server'}</button>
      </form>
      {mcpConfigs.length ? <ul className="mcp-config-list">{mcpConfigs.map((config) => { const result = mcpHealth[config.id]; return <li key={config.id}><div><strong>{config.name}</strong><code>{config.command}{config.args.length ? ` ${config.args.join(' ')}` : ''}</code>{result && <small className={`mcp-health-status ${result.status}`}>{result.status === 'online' ? `${result.toolCount ?? 0} tools · ${result.latencyMs ?? 0} ms` : result.detail}</small>}</div><div className="mcp-config-actions"><button type="button" disabled={mcpTesting === config.id} onClick={() => void runMcpHealth(config)}>{mcpTesting === config.id ? 'Testing…' : 'Test'}</button><button type="button" onClick={() => void onDeleteMcpConfig(config)} aria-label={`Remove ${config.name}`} title="Remove MCP server"><Trash2 size={14} /></button></div></li> })}</ul> : <div className="mcp-config-empty">No MCP servers configured. Add a declaration to make it available to the next Claude tool-use turn.</div>}
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
