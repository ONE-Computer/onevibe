import { Bell, ChevronDown, CodeXml, Menu, PanelLeftClose, Share2, ShieldCheck, Sparkles, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { PromptComposer } from './components/PromptComposer'
import { Sidebar } from './components/Sidebar'
import { TaskPlan } from './components/TaskPlan'
import { TaskTimeline } from './components/TaskTimeline'
import { Workspace } from './components/Workspace'
import { SharedArtifact } from './components/SharedArtifact'
import { Schedules } from './components/Schedules'
import { SkillsLibrary } from './components/SkillsLibrary'
import { Library } from './components/Library'
import { ThemeToggle } from './components/ThemeToggle'
import { useTask } from './hooks/useTask'
import { addProjectFile, cancelTask, createProject, createSchedule, createTask, listLibrary, listProjects, listSchedules, listTasks, requestShare, sendFollowUp, setScheduleEnabled } from './lib/api'
import type { LibraryItem, Project, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill } from './types'
import './index.css'

const starterPrompts = [
  'Build a secure customer briefing workspace',
  'Research a market and produce an evidence-backed report',
  'Create an internal tool with a governed approval flow',
]

export default function App() {
  const shareId = window.location.pathname.match(/^\/share\/([^/]+)$/)?.[1]
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [schedules, setSchedules] = useState<TaskSchedule[]>([])
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [activeProjectId, setActiveProjectId] = useState('project_onevibe')
  const [view, setView] = useState<'agent' | 'schedules' | 'skills' | 'library'>('agent')
  const [selectedSkills, setSelectedSkills] = useState<TaskSkill[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null)
  const [creating, setCreating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { snapshot, connected, error } = useTask(activeTaskId)

  const refreshTasks = useCallback(async () => {
    const result = await listTasks()
    setTasks(result.tasks)
  }, [])

  useEffect(() => { void refreshTasks() }, [refreshTasks])
  useEffect(() => { void listLibrary().then(({ items }) => setLibrary(items)) }, [])
  useEffect(() => { void listSchedules().then(({ schedules }) => setSchedules(schedules)) }, [])
  useEffect(() => { void listProjects().then(({ projects }) => { setProjects(projects); if (!projects.some((project) => project.id === activeProjectId)) setActiveProjectId(projects[0]?.id ?? 'project_onevibe') }) }, [activeProjectId])
  useEffect(() => {
    const onPopState = () => setActiveTaskId(window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (!snapshot) return
    setTasks((current) => current.map((task) => task.id === snapshot.id ? snapshot : task))
    if (snapshot.status === 'completed') void listLibrary().then(({ items }) => setLibrary(items))
  }, [snapshot])

  const startTask = async (prompt: string, provider: Task['provider'], mode: TaskMode = 'general', references: string[] = [], attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = [], skills: TaskSkill[] = selectedSkills) => {
    setCreating(true)
    try {
      const task = await createTask(prompt, provider, mode, activeProjectId, references, attachments, skills)
      setTasks((current) => [task, ...current])
      setActiveTaskId(task.id)
      window.history.pushState({}, '', `/tasks/${task.id}`)
    } finally {
      setCreating(false)
    }
  }

  const navigateToTask = (taskId: string | null) => {
    setView('agent')
    setActiveTaskId(taskId)
    window.history.pushState({}, '', taskId ? `/tasks/${taskId}` : '/')
  }
  const toggleSkill = (skill: TaskSkill) => setSelectedSkills((current) => current.includes(skill) ? current.filter((item) => item !== skill) : current.length >= 4 ? current : [...current, skill])

  const addProject = async (name: string, context: string) => {
    const project = await createProject(name, context)
    setProjects((current) => [project, ...current])
    setActiveProjectId(project.id)
  }
  const attachProjectFile = async (projectId: string, file: Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }) => {
    const project = await addProjectFile(projectId, file)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  const addSchedule = async (input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>) => {
    const schedule = await createSchedule(input)
    setSchedules((current) => [...current, schedule].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)))
  }
  const toggleSchedule = async (schedule: TaskSchedule) => {
    const updated = await setScheduleEnabled(schedule.id, !schedule.enabled)
    setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  if (shareId) return <SharedArtifact shareId={shareId} />

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
      <AnimatePresence>{sidebarOpen && <motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}><Sidebar tasks={tasks} activeTaskId={activeTaskId} onNewTask={() => navigateToTask(null)} onSelectTask={(taskId) => navigateToTask(taskId)} projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId} onCreateProject={addProject} onAttachProjectFile={attachProjectFile} onOpenSkills={() => { setActiveTaskId(null); setView('skills'); window.history.pushState({}, '', '/') }} onOpenLibrary={() => { setActiveTaskId(null); setView('library'); window.history.pushState({}, '', '/') }} onOpenSchedules={() => { setActiveTaskId(null); setView('schedules'); window.history.pushState({}, '', '/') }} /></motion.div>}</AnimatePresence>
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" type="button" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}</button><span className="model-selector"><Sparkles size={14} /> ONEVibe 0.1 <ChevronDown size={13} /></span></div>
          <div className="topbar-right"><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'Live' : 'Local'}</span><ThemeToggle /><button className="icon-button" type="button" aria-label="Notifications"><Bell size={16} /></button><button className="share-button" disabled={!snapshot} onClick={() => { if (!snapshot) return; if (snapshot.share) window.open(`/share/${snapshot.share.id}`, '_blank'); else void requestShare(snapshot.id) }}><Share2 size={14} /> {snapshot?.share ? 'Open share' : snapshot?.approval?.action === 'share_artifact' && snapshot.approval.state === 'pending' ? 'Approval pending' : 'Share'}</button><a className="github-button" href="https://github.com/one-computer" target="_blank" rel="noreferrer"><CodeXml size={15} /> GitHub</a></div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'skills' ? <motion.section key="skills" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><SkillsLibrary selected={selectedSkills} onToggle={toggleSkill} /></motion.section> : view === 'library' ? <motion.section key="library" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Library items={library} projects={projects} onOpenTask={navigateToTask} /></motion.section> : view === 'schedules' ? <motion.section key="schedules" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Schedules schedules={schedules} activeProjectId={activeProjectId} onCreate={addSchedule} onToggle={toggleSchedule} /></motion.section> : !activeTaskId ? (
            <motion.section key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="home-view">
              <div className="ambient-grid" />
              <div className="home-content">
                <div className="home-badge"><ShieldCheck size={14} /> {projects.find((project) => project.id === activeProjectId)?.name ?? 'ONEVibe product'} · ONEComputer security</div>
                <h1>What will you<br /><span>build safely?</span></h1>
                <p>Give your team a capable cloud agent without surrendering control of data, tools, or approvals.</p>
                <PromptComposer busy={creating} skills={selectedSkills} onSubmit={startTask} />
                <div className="starter-prompts">{starterPrompts.map((prompt) => <button key={prompt} onClick={() => void startTask(prompt, 'demo')}>{prompt}<span>↗</span></button>)}</div>
                <div className="home-assurance"><span><i /> Disposable workspaces</span><span><i /> Default-deny policy</span><span><i /> Separate wallet approval</span></div>
              </div>
            </motion.section>
          ) : (
            <motion.section key="task" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="task-view">
              {!snapshot ? <div className="loading-state"><span className="loader" /> Loading governed workspace…</div> : (
                <>
                  <div className="conversation-pane">
                    <div className="conversation-header"><div><span className="task-kicker">{projects.find((project) => project.id === snapshot.projectId)?.name ?? 'Project workspace'} · {snapshot.provider === 'demo' ? 'Local demo runtime' : snapshot.provider === 'claude_sdk' ? 'Claude Agent SDK' : snapshot.provider === 'onecomputer' ? 'ONEComputer sandbox' : 'AgentCore runtime'}</span><h2>{snapshot.title}</h2></div><div className="run-controls"><span className={`status-badge ${snapshot.status}`}>{snapshot.status.replaceAll('_', ' ')}</span>{snapshot.status === 'running' && <button className="cancel-button" onClick={() => void cancelTask(snapshot.id)}><Square size={10} /> Stop</button>}</div></div>
                    {error && <div className="stream-warning">{error}</div>}
                    <TaskTimeline task={snapshot} events={snapshot.events} />
                    <TaskPlan plan={snapshot.plan} />
                    <PromptComposer compact busy={creating || snapshot.status === 'running' || snapshot.status === 'pending' || Boolean(snapshot.inputRequest)} onSubmit={(prompt) => continueTask(prompt)} />
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
