import { CornerDownLeft, MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { answerInput } from '../lib/api'
import type { Task } from '../types'

export const UserInputCard = ({ taskId, request }: { taskId: string; request: NonNullable<Task['inputRequest']> }) => {
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (value = answer) => {
    const resolved = value.trim()
    if (!resolved || sending) return
    setSending(true)
    try { await answerInput(taskId, request.id, resolved) } finally { setSending(false) }
  }
  return <section className="input-request-card">
    <div className="input-request-icon"><MessageCircleQuestion size={17} /></div>
    <div className="input-request-body"><span>Agent needs your input</span><h3>{request.prompt}</h3>
      {request.options.length > 0 && <div className="input-options">{request.options.map((option) => <button disabled={sending} key={option} onClick={() => void submit(option)}>{option}</button>)}</div>}
      <div className="input-answer"><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type another answer…" onKeyDown={(event) => { if (event.key === 'Enter') void submit() }} /><button disabled={!answer.trim() || sending} onClick={() => void submit()}><CornerDownLeft size={13} /> Send</button></div>
    </div>
  </section>
}
