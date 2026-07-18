import { CalendarClock, Pause, Play, Plus, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import type { RuntimeReadiness, Task, TaskMode, TaskSchedule } from '../types'
import { providerLabel } from '../lib/runtime-labels'

type Props = {
  schedules: TaskSchedule[]
  activeProjectId: string
  onCreate: (input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>) => Promise<void>
  onToggle: (schedule: TaskSchedule) => Promise<void>
  onRunNow: (schedule: TaskSchedule) => Promise<void>
  onDelete: (schedule: TaskSchedule) => Promise<void>
  runtime?: RuntimeReadiness
}

export const Schedules = ({ schedules, activeProjectId, onCreate, onToggle, onRunNow, onDelete, runtime }: Props) => {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState(1440)
  const [mode, setMode] = useState<TaskMode>('general')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [error, setError] = useState<string | null>(null)
  const providerStates = runtime?.providers ?? [{ id: 'demo' as const, label: 'Safe demo', available: true, boundary: 'Local task workspace', detail: '', capabilities: ['streaming', 'file_system', 'preview_url'] as const }]
  const submit = async () => {
    if (!name.trim() || !prompt.trim()) return
    setError(null)
    try {
      await onCreate({ name: name.trim(), prompt: prompt.trim(), provider, mode, projectId: activeProjectId, intervalMinutes })
      setName(''); setPrompt(''); setIntervalMinutes(1440); setMode('general'); setProvider('demo')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create schedule') }
  }
  return <section className="schedules-view">
    <header><div><span className="view-eyebrow">Automation</span><h1>Scheduled work</h1><p>Every run becomes a normal project task with the same evidence, policy, and approval boundaries.</p></div><CalendarClock size={28} /></header>
    <form className="schedule-create" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <input aria-label="Schedule name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Schedule name" maxLength={100} />
      <textarea aria-label="Scheduled task prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should ONEVibe do?" maxLength={8000} />
      <div><select aria-label="Schedule interval" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))}><option value={15}>Every 15 minutes</option><option value={60}>Hourly</option><option value={1440}>Daily</option><option value={10080}>Weekly</option></select><select aria-label="Scheduled task mode" value={mode} onChange={(event) => setMode(event.target.value as TaskMode)}><option value="general">Agent</option><option value="research">Research</option><option value="document">Document</option><option value="data">Data story</option><option value="slides">Slides</option></select><select aria-label="Scheduled task runtime" value={provider} onChange={(event) => setProvider(event.target.value as Task['provider'])}>{providerStates.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={!candidate.available}>{candidate.label}{candidate.available ? '' : ' · unavailable'}</option>)}</select><button type="submit"><Plus size={14} /> Create schedule</button></div>
      {error && <p className="schedule-error" role="alert">{error}</p>}
    </form>
    <div className="schedule-list">{schedules.length === 0 ? <p>No scheduled work yet — create one above to run a task on a repeating cadence.</p> : schedules.map((schedule) => <article key={schedule.id}><div><strong>{schedule.name}</strong><span>{schedule.prompt}</span><small>{providerLabel(schedule.provider)} · {schedule.intervalMinutes >= 1440 ? `Every ${schedule.intervalMinutes / 1440} day${schedule.intervalMinutes === 1440 ? '' : 's'}` : `Every ${schedule.intervalMinutes} minutes`} · next {new Date(schedule.nextRunAt).toLocaleString()}</small></div><aside>{schedule.enabled && <button onClick={() => void onRunNow(schedule)}><Zap size={13} /> Run now</button>}<button onClick={() => void onToggle(schedule)}>{schedule.enabled ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button><button aria-label={`Delete schedule ${schedule.name}`} title="Delete schedule" onClick={() => void onDelete(schedule)}><Trash2 size={13} /></button></aside></article>)}</div>
  </section>
}
