import { Check, ChevronDown, Circle, LoaderCircle, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PlanStep } from '../types'

const StepIcon = ({ status }: { status: PlanStep['status'] }) => {
  if (status === 'completed') return <Check size={13} />
  if (status === 'running') return <LoaderCircle className="spin" size={13} />
  if (status === 'blocked') return <ShieldAlert size={13} />
  return <Circle size={10} />
}

export const TaskPlan = ({ plan }: { plan: PlanStep[] }) => {
  const done = plan.filter((step) => step.status === 'completed').length
  return (
    <motion.section layout className="task-plan">
      <div className="plan-header"><span>Task progress</span><strong>{done} / {plan.length}</strong><ChevronDown size={14} /></div>
      <div className="progress-track"><motion.span animate={{ width: `${(done / plan.length) * 100}%` }} /></div>
      <div className="plan-steps">
        {plan.map((step) => <div key={step.id} className={`plan-step ${step.status}`}><span><StepIcon status={step.status} /></span>{step.title}</div>)}
      </div>
    </motion.section>
  )
}
