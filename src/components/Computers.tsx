import { Activity, ExternalLink, Eye, MonitorCog, ShieldCheck, TerminalSquare } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Task } from '../types'

type Props = { tasks: Task[]; onOpenTask: (taskId: string) => void }

const boundaryLabel = (task: Task) => task.securityContext?.executionBoundary === 'onecomputer_sandbox'
  ? 'ONEComputer sandbox'
  : task.securityContext?.executionBoundary === 'remote_runtime'
    ? 'Remote runtime'
    : 'Local host process'

const lifecycleLabel = (task: Task) => task.securityContext?.destroyedAt
  ? 'Destroyed'
  : task.securityContext?.sandboxState
    ? task.securityContext.sandboxState.replaceAll('_', ' ')
    : task.status.replaceAll('_', ' ')

export const Computers = ({ tasks, onOpenTask }: Props) => {
  const computers = tasks.filter((task) => task.securityContext).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return <section className="computers-view">
    <header><div><span className="task-kicker">Runtimes</span><h1>Computers</h1><p>Task-derived inventory of the runtimes ONEVibe has observed. This view is read-only: it does not provision, restart, terminate, or otherwise control an infrastructure provider.</p></div><MonitorCog size={28} /></header>
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
