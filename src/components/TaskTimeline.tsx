import { Box, CheckCircle2, ChevronRight, FileCode2, Play, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { RuntimeEvent, Task } from '../types'
import { ApprovalCard } from './ApprovalCard'

const iconFor = (event: RuntimeEvent) => {
  if (event.lane === 'artifact') return <FileCode2 size={15} />
  if (event.lane === 'approval') return <ShieldCheck size={15} />
  if (event.type.startsWith('tool_call')) return <Wrench size={15} />
  if (event.type === 'run_started') return <Play size={14} />
  if (event.type === 'run_completed') return <CheckCircle2 size={15} />
  if (event.lane === 'activity') return <TerminalSquare size={15} />
  return <Box size={14} />
}

type Props = { task: Task; events: RuntimeEvent[] }

type Message = { id: string; type: 'user_message' | 'assistant_text_delta'; content: string }

const groupTranscript = (events: RuntimeEvent[], fallback: string): Message[] => {
  const messages: Message[] = []
  for (const event of events.filter((item) => item.lane === 'transcript')) {
    if (event.type !== 'user_message' && event.type !== 'assistant_text_delta') continue
    const last = messages.at(-1)
    if (event.type === 'assistant_text_delta' && last?.type === 'assistant_text_delta') last.content += event.content ?? ''
    else messages.push({ id: event.id, type: event.type, content: event.content ?? '' })
  }
  return messages.length ? messages : [{ id: 'legacy-prompt', type: 'user_message', content: fallback }]
}

const ExpandableCopy = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false)
  const long = content.length > 560
  return <><p className={long && !expanded ? 'message-collapsed' : ''}>{content}</p>{long && <button className="expand-message" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse' : 'Expand'}</button>}</>
}

export const TaskTimeline = ({ task, events }: Props) => {
  const transcript = groupTranscript(events, task.prompt)
  const operational = events.filter((event) => event.lane !== 'transcript' && event.lane !== 'approval')
  return (
    <div className="timeline">
      <AnimatePresence initial={false}>
        {transcript.map((event) => event.type === 'user_message' ? (
          <motion.div key={event.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="prompt-bubble"><span>You</span><ExpandableCopy content={event.content} /></motion.div>
        ) : event.type === 'assistant_text_delta' ? (
          <motion.div key={event.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="assistant-message">
            <div className="assistant-orb">O</div><div><strong>ONEVibe</strong><ExpandableCopy content={event.content} /></div>
          </motion.div>
        ) : null)}
      </AnimatePresence>
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
      {task.approval && <ApprovalCard approval={task.approval} />}
    </div>
  )
}
