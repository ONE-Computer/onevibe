import { Box, Check, CheckCircle2, ChevronRight, Circle, EyeOff, FileCode2, LoaderCircle, Play, ShieldAlert, ShieldCheck, TerminalSquare, TriangleAlert, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PlanStep, RuntimeEvent, TaskSnapshot } from '../types'
import { ApprovalCard } from './ApprovalCard'
import { approvalReviewPolicyFor } from './approval-review'
import { runtimeCheckpointEventsFor, visualCaptureFailureCountFor } from './task-timeline-projection'
import { UserInputCard } from './UserInputCard'

const iconFor = (event: RuntimeEvent) => {
  if (event.lane === 'artifact') return <FileCode2 size={15} />
  if (event.lane === 'approval') return <ShieldCheck size={15} />
  if (event.type.startsWith('tool_call')) return <Wrench size={15} />
  if (event.type === 'run_started') return <Play size={14} />
  if (event.type === 'run_completed') return <CheckCircle2 size={15} />
  if (event.lane === 'activity') return <TerminalSquare size={15} />
  return <Box size={14} />
}

type Props = { task: TaskSnapshot; events: RuntimeEvent[] }

const planStatusLabel: Record<PlanStep['status'], string> = {
  completed: 'Completed',
  running: 'In progress',
  pending: 'Pending',
  blocked: 'Blocked',
}

const planStatusIcon = (status: PlanStep['status']) => {
  if (status === 'completed') return <Check size={13} aria-hidden="true" />
  if (status === 'running') return <LoaderCircle className="timeline-plan-spinner" size={13} aria-hidden="true" />
  if (status === 'blocked') return <ShieldAlert size={13} aria-hidden="true" />
  return <Circle size={10} aria-hidden="true" />
}

const InlineTaskPlan = ({ plan }: { plan: PlanStep[] }) => {
  const completed = plan.filter((step) => step.status === 'completed').length
  const progressLabel = plan.length ? `${completed} of ${plan.length} plan steps completed` : 'No plan steps recorded'

  return (
    <section className="timeline-plan" aria-labelledby="timeline-plan-title">
      <header className="timeline-plan-header">
        <div>
          <span>Plan</span>
          <h3 id="timeline-plan-title">Execution plan</h3>
        </div>
        <strong aria-label={progressLabel}>{plan.length ? `${completed} / ${plan.length}` : '—'}</strong>
      </header>
      {plan.length > 0 ? <>
        <div className="timeline-plan-progress" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={completed}>
          <motion.span animate={{ width: `${(completed / plan.length) * 100}%` }} />
        </div>
        <ol className="timeline-plan-steps" aria-label="Execution plan steps">
          {plan.map((step) => {
            const status = planStatusLabel[step.status]
            return <li key={step.id} className={`timeline-plan-step ${step.status}`} aria-current={step.status === 'running' ? 'step' : undefined}>
              <span className="timeline-plan-icon">{planStatusIcon(step.status)}</span>
              <strong>{step.title}</strong>
              <span className="timeline-plan-status" role="status">{status}</span>
            </li>
          })}
        </ol>
      </> : <p className="timeline-plan-empty">The runtime has not recorded a plan for this task yet.</p>}
    </section>
  )
}

export const TaskTimeline = ({ task, events }: Props) => {
  const operational = runtimeCheckpointEventsFor(events)
  const visualCaptureFailures = visualCaptureFailureCountFor(events)
  return (
    <div className="timeline">
      <InlineTaskPlan plan={task.plan} />
      <header className="timeline-header"><div><span>Runtime checkpoints</span><small>Tool calls and artifacts remain in Computer</small></div><strong>{operational.length + (visualCaptureFailures ? 1 : 0)}</strong></header>
      <div className="activity-group">
        <AnimatePresence initial={false}>
          {operational.map((event) => (
            <motion.div key={event.id} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className={`activity-row ${event.type}`}>
              <span className="activity-icon">{iconFor(event)}</span>
              <div><strong>{event.label ?? event.type.replaceAll('_', ' ')}</strong>{event.content && <p>{event.content}</p>}</div>
              <ChevronRight className="activity-chevron" size={14} />
            </motion.div>
          ))}
          {visualCaptureFailures > 0 && <motion.div key="visual-capture-summary" initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="activity-row visual-capture-summary"><span className="activity-icon"><EyeOff size={15} /></span><div><strong>Visual evidence unavailable</strong><p>{visualCaptureFailures} capture attempt{visualCaptureFailures === 1 ? '' : 's'} were withheld; review the Computer rail for captured frames and the Evidence tab for the full ledger.</p></div><TriangleAlert className="activity-chevron" size={14} /></motion.div>}
        </AnimatePresence>
      </div>
      {task.approval && <ApprovalCard approval={task.approval} policy={approvalReviewPolicyFor(events, task.approval.id)} />}
      {task.inputRequest && <UserInputCard taskId={task.id} request={task.inputRequest} />}
    </div>
  )
}
