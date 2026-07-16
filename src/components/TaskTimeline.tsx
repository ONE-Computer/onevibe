import { Box, CheckCircle2, ChevronRight, FileCode2, Play, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RuntimeEvent, TaskSnapshot } from '../types'
import { ApprovalCard } from './ApprovalCard'
import { approvalReviewPolicyFor } from './approval-review'
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

export const TaskTimeline = ({ task, events }: Props) => {
  const operational = events.filter((event) => event.lane !== 'transcript' && event.lane !== 'approval')
  return (
    <div className="timeline">
      <div className="activity-group">
        <AnimatePresence initial={false}>
          {operational.map((event) => (
            <motion.div key={event.id} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className={`activity-row ${event.type}`}>
              <span className="activity-icon">{iconFor(event)}</span>
              <div><strong>{event.label ?? event.type.replaceAll('_', ' ')}</strong>{event.content && <p>{event.content}</p>}</div>
              <ChevronRight className="activity-chevron" size={14} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {task.approval && <ApprovalCard approval={task.approval} policy={approvalReviewPolicyFor(events, task.approval.id)} />}
      {task.inputRequest && <UserInputCard taskId={task.id} request={task.inputRequest} />}
    </div>
  )
}
