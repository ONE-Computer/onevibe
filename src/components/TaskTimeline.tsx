import { Check, Circle, LoaderCircle, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PlanStep, RuntimeEvent, TaskSnapshot } from '../types'
import { ApprovalCard } from './ApprovalCard'
import { approvalReviewPolicyFor } from './approval-review'
import { UserInputCard } from './UserInputCard'

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
  return (
    <div className="timeline">
      <InlineTaskPlan plan={task.plan} />
      {task.approval && <ApprovalCard approval={task.approval} policy={approvalReviewPolicyFor(events, task.approval.id)} />}
      {task.inputRequest && <UserInputCard taskId={task.id} request={task.inputRequest} />}
    </div>
  )
}
