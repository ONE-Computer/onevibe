import { Check, ChevronDown, Circle, LoaderCircle, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PlanStep } from '../types'

const StepIcon = ({ status }: { status: PlanStep['status'] }) => {
  if (status === 'completed') return <Check size={13} />
  if (status === 'running') return <LoaderCircle className="spin" size={13} />
  if (status === 'blocked') return <ShieldAlert size={13} />
  return <Circle size={10} />
}

const duration = (step: PlanStep) => {
  if (!step.startedAt) return undefined
  const elapsed = Math.max(0, (new Date(step.completedAt ?? Date.now()).getTime() - new Date(step.startedAt).getTime()) / 1_000)
  return elapsed < 60 ? `${Math.round(elapsed)}s` : `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s`
}

export const TaskPlan = ({ plan }: { plan: PlanStep[] }) => {
  const done = plan.filter((step) => step.status === 'completed').length
  return (
    <motion.section layout className="task-plan">
      <div className="plan-header"><span>Task progress</span><strong>{done} / {plan.length}</strong><ChevronDown size={14} /></div>
      <div className="progress-track"><motion.span animate={{ width: `${(done / plan.length) * 100}%` }} /></div>
      <div className="plan-steps">
        {plan.map((step) => <div key={step.id} className={`plan-step ${step.status}`}><span><StepIcon status={step.status} /></span><span className="plan-title">{step.title}</span>{duration(step) && <time dateTime={step.completedAt ?? step.startedAt} title={step.status === 'running' ? 'Elapsed time' : 'Step duration'}>{duration(step)}</time>}</div>)}
      </div>
    </motion.section>
  )
}
