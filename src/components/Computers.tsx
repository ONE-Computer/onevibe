import { Activity, ExternalLink, Eye, MonitorCog, ShieldCheck, TerminalSquare } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { testRuntime } from '../lib/api'
import type { RuntimeHealth, RuntimeReadiness, Task } from '../types'
import { statusLabel } from '../lib/runtime-labels'

type Props = { tasks: Task[]; onOpenTask: (taskId: string) => void; runtime?: RuntimeReadiness }

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

export const Computers = ({ tasks, onOpenTask, runtime }: Props) => {
  const [health, setHealth] = useState<Record<string, RuntimeHealth>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const computers = tasks.filter((task) => task.securityContext).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
  return <section className="computers-view">
    <header><div><span className="task-kicker">Runtimes</span><h1>Computers</h1><p>Task-derived inventory of the runtimes ONEVibe has observed. This view is read-only: it does not provision, restart, terminate, or otherwise control an infrastructure provider.</p></div><MonitorCog size={28} /></header>
    {runtime && <section className="runtime-health-panel" aria-label="Runtime health"><header><div><span>Runtime registry</span><strong>Connectivity checks</strong></div><small>Server-side probes only · no model prompt is sent</small></header><div className="runtime-health-grid">{runtime.providers.map((provider) => { const result = health[provider.id]; const status = result?.status ?? provider.healthStatus ?? (provider.available ? 'unknown' : 'not_configured'); return <article key={provider.id}><div><span className={`runtime-health-dot ${status}`} /><strong>{provider.label}</strong></div><small>{result?.detail ?? provider.detail}</small>{result?.latencyMs !== undefined && <time>{result.latencyMs} ms</time>}{provider.healthCheckedAt && !result && <time>Checked {new Date(provider.healthCheckedAt).toLocaleTimeString()}</time>}<button type="button" disabled={testing === provider.id} onClick={() => void runHealthCheck(provider.id)}>{testing === provider.id ? 'Testing…' : result || provider.healthStatus ? 'Test again' : 'Test runtime'}</button></article> })}</div></section>}
    {!computers.length ? <div className="computers-empty"><MonitorCog size={22} /><strong>No governed runtimes observed</strong><span>Start a task to record its execution boundary, lifecycle evidence, and visual-runtime readiness here.</span></div> : <div className="computers-grid">{computers.map((task) => {
      const context = task.securityContext!
      return <motion.article layout key={task.id}>
        <div className="computer-card-head"><span><TerminalSquare size={12} /> {boundaryLabel(task)}</span><time>{new Date(task.updatedAt).toLocaleString()}</time></div>
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
