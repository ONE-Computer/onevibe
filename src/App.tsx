import { Bell, ChevronDown, CodeXml, Menu, PanelLeftClose, Share2, ShieldCheck, Sparkles, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { PromptComposer } from './components/PromptComposer'
import { Sidebar } from './components/Sidebar'
import { TaskPlan } from './components/TaskPlan'
import { TaskTimeline } from './components/TaskTimeline'
import { Workspace } from './components/Workspace'
import { useTask } from './hooks/useTask'
import { cancelTask, createTask, listTasks, sendFollowUp } from './lib/api'
import type { Task } from './types'
import './index.css'

const starterPrompts = [
  'Build a secure customer briefing workspace',
  'Research a market and produce an evidence-backed report',
  'Create an internal tool with a governed approval flow',
]

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { snapshot, connected, error } = useTask(activeTaskId)

  const refreshTasks = useCallback(async () => {
    const result = await listTasks()
    setTasks(result.tasks)
  }, [])

  useEffect(() => { void refreshTasks() }, [refreshTasks])
  useEffect(() => {
    if (!snapshot) return
    setTasks((current) => current.map((task) => task.id === snapshot.id ? snapshot : task))
  }, [snapshot])

  const startTask = async (prompt: string, provider: Task['provider']) => {
    setCreating(true)
    try {
      const task = await createTask(prompt, provider)
      setTasks((current) => [task, ...current])
      setActiveTaskId(task.id)
    } finally {
      setCreating(false)
    }
  }

  const continueTask = async (prompt: string) => {
    if (!activeTaskId) return
    setCreating(true)
    try {
      await sendFollowUp(activeTaskId, prompt)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <AnimatePresence>{sidebarOpen && <motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}><Sidebar tasks={tasks} activeTaskId={activeTaskId} onNewTask={() => setActiveTaskId(null)} onSelectTask={setActiveTaskId} /></motion.div>}</AnimatePresence>
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}</button><span className="model-selector"><Sparkles size={14} /> ONEVibe 0.1 <ChevronDown size={13} /></span></div>
          <div className="topbar-right"><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'Live' : 'Local'}</span><button className="icon-button"><Bell size={16} /></button><button className="share-button"><Share2 size={14} /> Share</button><a className="github-button" href="https://github.com/one-computer" target="_blank" rel="noreferrer"><CodeXml size={15} /> GitHub</a></div>
        </header>

        <AnimatePresence mode="wait">
          {!activeTaskId ? (
            <motion.section key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="home-view">
              <div className="ambient-grid" />
              <div className="home-content">
                <div className="home-badge"><ShieldCheck size={14} /> ONEComputer security · OpenVTC trust</div>
                <h1>What will you<br /><span>build safely?</span></h1>
                <p>Give your team a capable cloud agent without surrendering control of data, tools, or approvals.</p>
                <PromptComposer busy={creating} onSubmit={startTask} />
                <div className="starter-prompts">{starterPrompts.map((prompt) => <button key={prompt} onClick={() => void startTask(prompt, 'demo')}>{prompt}<span>↗</span></button>)}</div>
                <div className="home-assurance"><span><i /> Disposable workspaces</span><span><i /> Default-deny policy</span><span><i /> Separate wallet approval</span></div>
              </div>
            </motion.section>
          ) : (
            <motion.section key="task" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="task-view">
              {!snapshot ? <div className="loading-state"><span className="loader" /> Loading governed workspace…</div> : (
                <>
                  <div className="conversation-pane">
                    <div className="conversation-header"><div><span className="task-kicker">{snapshot.provider === 'demo' ? 'Local demo runtime' : snapshot.provider === 'claude_sdk' ? 'Claude Agent SDK' : 'AgentCore runtime'}</span><h2>{snapshot.title}</h2></div><div className="run-controls"><span className={`status-badge ${snapshot.status}`}>{snapshot.status.replaceAll('_', ' ')}</span>{snapshot.status === 'running' && <button className="cancel-button" onClick={() => void cancelTask(snapshot.id)}><Square size={10} /> Stop</button>}</div></div>
                    {error && <div className="stream-warning">{error}</div>}
                    <TaskTimeline task={snapshot} events={snapshot.events} />
                    <TaskPlan plan={snapshot.plan} />
                    <PromptComposer compact busy={creating || snapshot.status === 'running' || snapshot.status === 'pending'} onSubmit={(prompt) => continueTask(prompt)} />
                  </div>
                  <div className="workspace-pane"><Workspace task={snapshot} /></div>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
