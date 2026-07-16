import { Box, CheckCircle2, ChevronRight, EyeOff, FileCode2, Play, ShieldCheck, TerminalSquare, TriangleAlert, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RuntimeEvent, TaskSnapshot } from '../types'
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

export const TaskTimeline = ({ task, events }: Props) => {
  const operational = runtimeCheckpointEventsFor(events)
  const visualCaptureFailures = visualCaptureFailureCountFor(events)
  return (
    <div className="timeline">
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
