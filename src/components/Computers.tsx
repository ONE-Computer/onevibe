import { Activity, ExternalLink, Eye, MonitorCog, Plus, ShieldCheck, TerminalSquare, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { getRuntimeDiagnostics, testMcpConfig, testRuntime } from '../lib/api'
import type { McpHealth, RuntimeDiagnostics, RuntimeHealth, RuntimeMcpConfig, RuntimeReadiness, Task } from '../types'
import { statusLabel } from '../lib/runtime-labels'
import { t, type Locale } from '../lib/i18n'

type Props = { tasks: Task[]; onOpenTask: (taskId: string) => void; runtime?: RuntimeReadiness; mcpConfigs: RuntimeMcpConfig[]; onCreateMcpConfig: (input: Pick<RuntimeMcpConfig, 'name' | 'command' | 'args'>) => Promise<void>; onDeleteMcpConfig: (config: RuntimeMcpConfig) => Promise<void>; locale?: Locale }

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

export const Computers = ({ tasks, onOpenTask, runtime, mcpConfigs, onCreateMcpConfig, onDeleteMcpConfig, locale = 'en' }: Props) => {
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
  useEffect(() => { void getRuntimeDiagnostics().then(setDiagnostics).catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : t('unableToLoadDiagnostics', locale))) }, [locale])
  const runHealthCheck = async (provider: Task['provider']) => {
    setTesting(provider)
    try {
      const result = await testRuntime(provider)
      setHealth((current) => ({ ...current, [provider]: result.health }))
    } catch (reason) {
      setHealth((current) => ({ ...current, [provider]: { status: 'offline', detail: t('healthRequestFailed', locale) } }))
      toast.error(reason instanceof Error ? reason.message : t('runtimeHealthCheckFailed', locale))
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
      setMcpHealth((current) => ({ ...current, [config.id]: { id: config.id, status: 'offline', detail: t('healthRequestFailed', locale) } }))
      toast.error(reason instanceof Error ? reason.message : t('mcpHealthCheckFailed', locale))
    } finally { setMcpTesting(null) }
  }
  return <section className="computers-view">
    <header><div><span className="view-eyebrow">{t('runtimesKicker', locale)}</span><h1>{t('computers', locale)}</h1><p>{t('computersIntro', locale)}</p></div><MonitorCog size={28} /></header>
    {runtime && <section className="runtime-health-panel" aria-label="Runtime health"><header><div><span>{t('runtimeRegistry', locale)}</span><strong>{t('connectivityChecks', locale)}</strong></div><small>{t('serverProbesOnly', locale)}</small></header>{allProvidersNotConfigured ? <p className="empty-state">{t('noRuntimesConfigured', locale)}</p> : <div className="runtime-health-grid">{runtime.providers.map((provider) => { const result = health[provider.id]; const status = result?.status ?? provider.healthStatus ?? (provider.available ? 'unknown' : 'not_configured'); const staleAge = getHealthCheckAge(provider.healthCheckedAt); return <article key={provider.id}><div><span className={`runtime-health-dot ${status}`} /><strong>{provider.label}</strong></div><small>{result?.detail ?? provider.detail}</small>{result?.latencyMs !== undefined && <span>{result.latencyMs} ms</span>}{staleAge ? <time dateTime={provider.healthCheckedAt} title={t('refreshHint', locale)}>{t('lastCheckedStale', locale).replace('{minutes}', String(Math.round(staleAge)))}</time> : provider.healthCheckedAt && !result && <time dateTime={provider.healthCheckedAt}>{t('checkedAtTime', locale).replace('{time}', new Date(provider.healthCheckedAt).toLocaleTimeString())}</time>}<button type="button" disabled={testing === provider.id} onClick={() => void runHealthCheck(provider.id)}>{testing === provider.id ? t('testing', locale) : result || provider.healthStatus ? t('testAgain', locale) : t('testRuntime', locale)}</button></article> })}</div>}</section>}
    {diagnostics && <section className="diagnostics-panel" aria-labelledby="diagnostics-title"><header><div><span>{t('systemStatus', locale)}</span><strong id="diagnostics-title">{t('executionPath', locale)}</strong></div><small>{t('diagnosticsNote', locale)}</small></header><div className="diagnostics-grid"><article><strong>LiteLLM</strong><span className={diagnostics.modelBoundary.configured ? 'diagnostic-ok' : 'diagnostic-warn'}>{diagnostics.modelBoundary.configured ? t('configured', locale) : t('needsConfiguration', locale)}</span><small>{diagnostics.modelBoundary.detail}</small></article><article><strong>{t('sessionLabel', locale)}</strong><span>{diagnostics.auth.enabled ? diagnostics.auth.sessionScoped ? t('scoped', locale) : t('noSession', locale) : t('localMode', locale)}</span><small>{diagnostics.auth.detail}</small></article><article><strong>{t('persistenceLabel', locale)}</strong><span>{diagnostics.persistence.active}</span><small>{diagnostics.persistence.detail}</small></article><article><strong>{t('sandboxLabel', locale)}</strong><span>{diagnostics.sandbox.reachable === true ? t('reachable', locale) : diagnostics.sandbox.configured ? t('configured', locale) : t('notConfigured', locale)}</span><small>{diagnostics.sandbox.detail}</small></article><article><strong>MCP</strong><span>{diagnostics.mcp.configuredCount ? t('healthyOfTotal', locale).replace('{healthy}', String(diagnostics.mcp.healthyCount)).replace('{total}', String(diagnostics.mcp.configuredCount)) : t('noneConfigured', locale)}</span><small>{diagnostics.mcp.detail}</small></article></div></section>}
    <section className="mcp-config-panel" aria-labelledby="mcp-config-title">
      <header><div><span>{t('toolConnections', locale)}</span><strong id="mcp-config-title">{t('mcpServers', locale)}</strong></div><small>{t('mcpServersNote', locale)}</small></header>
      <p className="mcp-config-note">{t('mcpCredentialsNote', locale)}</p>
      <form className="mcp-config-form" onSubmit={(event) => void submitMcp(event)}>
        <label>{t('displayName', locale)}<input value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="Internal tools" maxLength={80} /></label>
        <label>{t('commandLabel', locale)}<input value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} placeholder="npx" maxLength={200} /></label>
        <label>{t('argumentsLabel', locale)}<input value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} placeholder="-y @example/mcp-server" maxLength={2_000} /></label>
        <button type="submit" disabled={mcpSaving || !mcpName.trim() || !mcpCommand.trim()}><Plus size={14} /> {mcpSaving ? t('saving', locale) : t('addServer', locale)}</button>
      </form>
      {mcpConfigs.length ? <ul className="mcp-config-list">{mcpConfigs.map((config) => { const result = mcpHealth[config.id]; return <li key={config.id}><div><strong>{config.name}</strong><code>{config.command}{config.args.length ? ` ${config.args.join(' ')}` : ''}</code>{result && <small className={`mcp-health-status ${result.status}`}>{result.status === 'online' ? t('toolsCountMs', locale).replace('{count}', String(result.toolCount ?? 0)).replace('{latency}', String(result.latencyMs ?? 0)) : result.detail}</small>}</div><div className="mcp-config-actions"><button type="button" disabled={mcpTesting === config.id} onClick={() => void runMcpHealth(config)}>{mcpTesting === config.id ? t('testing', locale) : t('test', locale)}</button><button type="button" onClick={() => void onDeleteMcpConfig(config)} aria-label={`${t('remove', locale)} ${config.name}`} title={t('removeMcpServer', locale)}><Trash2 size={14} /></button></div></li> })}</ul> : <div className="mcp-config-empty">{t('noMcpServers', locale)}</div>}
    </section>
    {!computers.length ? <div className="computers-empty"><MonitorCog size={22} /><strong>{t('noGovernedRuntimes', locale)}</strong><span>{t('startTaskToRecord', locale)}</span></div> : <div className="computers-grid">{computers.map((task) => {
      const context = task.securityContext!
      return <motion.article layout key={task.id}>
        <div className="computer-card-head"><span><TerminalSquare size={12} /> {boundaryLabel(task)}</span><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time></div>
        <h2>{task.title}</h2>
        <dl>
          <div><dt>{t('lifecycle', locale)}</dt><dd><Activity size={12} /> {lifecycleLabel(task)}</dd></div>
          <div><dt>{t('gateway', locale)}</dt><dd className={context.gatewayEnforced ? 'attested' : 'unattested'}><ShieldCheck size={12} /> {context.gatewayEnforced ? t('enforced', locale) : t('notAttested', locale)}</dd></div>
          <div><dt>{t('visualRuntime', locale)}</dt><dd><Eye size={12} /> {context.visualRuntimeReady ? t('ready', locale) : t('unavailable', locale)}</dd></div>
          <div><dt>{t('providerReference', locale)}</dt><dd className="computer-reference">{context.sandboxId ?? context.runtimeSessionId ?? context.provider ?? t('notReported', locale)}</dd></div>
        </dl>
        <footer><small>{t('observationOnly', locale)}</small><button onClick={() => onOpenTask(task.id)}>{t('openTask', locale)} <ExternalLink size={13} /></button></footer>
      </motion.article>
    })}</div>}
  </section>
}
