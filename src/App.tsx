import { Bell, ChevronDown, CodeXml, Link2, Menu, Monitor, PanelLeftClose, Paperclip, RotateCcw, Share2, ShieldCheck, Sparkles, Square, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { PromptComposer } from './components/PromptComposer'
import { Sidebar } from './components/Sidebar'
import { TaskTimeline } from './components/TaskTimeline'
import { Workspace } from './components/Workspace'
import { SharedArtifact } from './components/SharedArtifact'
import { Schedules } from './components/Schedules'
import { SkillsLibrary } from './components/SkillsLibrary'
import { Library } from './components/Library'
import { Computers } from './components/Computers'
import { ThemeToggle } from './components/ThemeToggle'
import { useTask } from './hooks/useTask'
import { addProjectFile, cancelQueuedGuidance, cancelTask, createProject, createSchedule, createTask, fallbackSkillCatalog, getRuntimeReadiness, listConversations, listLibrary, listProjects, listSchedules, listSkills, listTasks, moveTaskToProject, normalizeSelectedSkillIds, removeProjectFile, requestShare, restoreProjectFileVersion, retryTask, runScheduleNow, sendFollowUp, setScheduleEnabled, updateProjectContext, updateProjectFile, updateTaskTags, type SkillOption } from './lib/api'
import { conversationSummaryFromTask, upsertConversation } from './lib/conversation-summary'
import type { ConversationSummary, LibraryItem, Project, RuntimeReadiness, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill } from './types'
import './index.css'

const starterPrompts = [
  'Build a secure customer briefing workspace',
  'Research a market and produce an evidence-backed report',
  'Create an internal tool with a governed approval flow',
]
const AssistantThread = lazy(() => import('./components/AssistantThread').then((module) => ({ default: module.AssistantThread })))
const canStopTask = (status: Task['status']) => status === 'running' || status === 'pending' || status === 'waiting_for_user_input' || status === 'waiting_for_approval'
const selectedSkillsStorageKey = 'onevibe.selected-skill-ids'
const readPersistedSkills = (): unknown => {
  try {
    const raw = window.localStorage.getItem(selectedSkillsStorageKey)
    return raw ? JSON.parse(raw) as unknown : []
  } catch {
    return []
  }
}
const persistSelectedSkills = (skills: TaskSkill[]) => {
  try { window.localStorage.setItem(selectedSkillsStorageKey, JSON.stringify(skills)) } catch { /* Storage is optional. */ }
}
type AppView = 'agent' | 'schedules' | 'skills' | 'library' | 'computers'
const viewFromLocation = (): AppView => {
  const value = new URLSearchParams(window.location.search).get('view')
  return value === 'schedules' || value === 'skills' || value === 'library' || value === 'computers' ? value : 'agent'
}

export default function App() {
  const shareId = window.location.pathname.match(/^\/share\/([^/]+)$/)?.[1]
  const [tasks, setTasks] = useState<Task[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationCursor, setConversationCursor] = useState<string>()
  const [loadingConversationPage, setLoadingConversationPage] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [schedules, setSchedules] = useState<TaskSchedule[]>([])
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [runtime, setRuntime] = useState<RuntimeReadiness>()
  const [activeProjectId, setActiveProjectId] = useState('project_onevibe')
  const [view, setView] = useState<AppView>(viewFromLocation)
  const [skillCatalog, setSkillCatalog] = useState<SkillOption[]>(fallbackSkillCatalog)
  const [selectedSkills, setSelectedSkills] = useState<TaskSkill[]>(() => normalizeSelectedSkillIds(readPersistedSkills()))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null)
  const [creating, setCreating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const taskRoute = /^\/tasks\/[^/]+$/.test(window.location.pathname)
    return !window.matchMedia('(max-width: 1250px)').matches || !taskRoute
  })
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { snapshot, connected, error, refresh: refreshSnapshot } = useTask(activeTaskId)

  const refreshTasks = useCallback(async () => {
    const result = await listTasks()
    setTasks(result.tasks)
  }, [])

  const refreshConversations = useCallback(async () => {
    const result = await listConversations()
    setConversations(result.conversations)
    setConversationCursor(result.nextCursor)
  }, [])

  const loadMoreConversations = useCallback(async () => {
    if (!conversationCursor || loadingConversationPage) return
    setLoadingConversationPage(true)
    try {
      const result = await listConversations(conversationCursor)
      setConversations((current) => [...current, ...result.conversations.filter((item) => !current.some((existing) => existing.id === item.id))])
      setConversationCursor(result.nextCursor)
    } finally {
      setLoadingConversationPage(false)
    }
  }, [conversationCursor, loadingConversationPage])

  useEffect(() => { void refreshTasks() }, [refreshTasks])
  useEffect(() => { void refreshConversations() }, [refreshConversations])
  useEffect(() => { void listLibrary().then(({ items }) => setLibrary(items)) }, [])
  useEffect(() => {
    let mounted = true
    void listSkills().then(({ skills }) => {
      if (!mounted || !skills.length) return
      const catalog = skills.map(({ id, title, summary }) => ({ id, title, summary }))
      setSkillCatalog(catalog)
      setSelectedSkills((current) => normalizeSelectedSkillIds(current, catalog))
    }).catch(() => undefined)
    return () => { mounted = false }
  }, [])
  useEffect(() => { persistSelectedSkills(selectedSkills) }, [selectedSkills])
  useEffect(() => { void listSchedules().then(({ schedules }) => setSchedules(schedules)) }, [])
  useEffect(() => { void getRuntimeReadiness().then(setRuntime).catch(() => undefined) }, [])
  useEffect(() => { void listProjects().then(({ projects }) => { setProjects(projects); if (!projects.some((project) => project.id === activeProjectId)) setActiveProjectId(projects[0]?.id ?? 'project_onevibe') }) }, [activeProjectId])
  useEffect(() => {
    const onPopState = () => {
      const nextTaskId = window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null
      setActiveTaskId(nextTaskId)
      setView(viewFromLocation())
      if (nextTaskId && window.matchMedia('(max-width: 1250px)').matches) setSidebarOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (!snapshot) return
    setTasks((current) => current.map((task) => task.id === snapshot.id ? snapshot : task))
    setConversations((current) => upsertConversation(current, conversationSummaryFromTask(snapshot)))
    if (snapshot.status === 'completed') void listLibrary().then(({ items }) => setLibrary(items))
  }, [snapshot])

  const preferredProvider: Task['provider'] = runtime?.providers.find((candidate) => candidate.id === 'claude_sdk' && candidate.available)?.id ?? 'demo'
  const startTask = async (prompt: string, provider: Task['provider'] = preferredProvider, mode: TaskMode = 'chat', references: string[] = [], attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = [], skills: TaskSkill[] = selectedSkills) => {
    setCreating(true)
    try {
      const task = await createTask(prompt, provider, mode, activeProjectId, references, attachments, skills)
      setTasks((current) => [task, ...current])
      setConversations((current) => upsertConversation(current, conversationSummaryFromTask(task)))
      setActiveTaskId(task.id)
      window.history.pushState({}, '', `/tasks/${task.id}`)
    } finally {
      setCreating(false)
    }
  }

  const navigateToTask = (taskId: string | null) => {
    setView('agent')
    setActiveTaskId(taskId)
    setMobileInspectorOpen(false)
    window.history.pushState({}, '', taskId ? `/tasks/${taskId}` : '/')
    if (window.matchMedia('(max-width: 1250px)').matches) setSidebarOpen(false)
  }
  const navigateToView = (nextView: Exclude<AppView, 'agent'>) => {
    setActiveTaskId(null)
    setMobileInspectorOpen(false)
    setView(nextView)
    window.history.pushState({}, '', `/?view=${nextView}`)
    if (window.matchMedia('(max-width: 960px)').matches) setSidebarOpen(false)
  }
  const toggleSkill = (skill: TaskSkill) => setSelectedSkills((current) => normalizeSelectedSkillIds(current.includes(skill) ? current.filter((item) => item !== skill) : current.length >= 4 ? current : [...current, skill], skillCatalog))

  const addProject = async (name: string, context: string) => {
    const project = await createProject(name, context)
    setProjects((current) => [project, ...current])
    setActiveProjectId(project.id)
  }
  const attachProjectFile = async (projectId: string, file: Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }) => {
    const project = await addProjectFile(projectId, file)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }
  const updateProject = async (projectId: string, context: string) => {
    const project = await updateProjectContext(projectId, context)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }
  const detachProjectFile = async (projectId: string, filePath: string) => {
    const project = await removeProjectFile(projectId, filePath)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }
  const editProjectFile = async (projectId: string, filePath: string, content: string, expectedHash: string) => {
    const result = await updateProjectFile(projectId, filePath, content, expectedHash)
    setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item))
  }
  const retractQueuedGuidance = async (taskId: string, guidanceId: string) => {
    await cancelQueuedGuidance(taskId, guidanceId)
    await Promise.all([refreshSnapshot(), refreshTasks()])
  }
  const moveTaskProject = async (taskId: string, projectId: string) => {
    await moveTaskToProject(taskId, projectId)
    await Promise.all([refreshSnapshot(), refreshTasks(), listLibrary().then(({ items }) => setLibrary(items))])
  }
  const setTaskTags = async (taskId: string, tags: string[]) => {
    await updateTaskTags(taskId, tags)
    await Promise.all([refreshSnapshot(), refreshTasks(), listLibrary().then(({ items }) => setLibrary(items))])
  }
  const restoreProjectFile = async (projectId: string, filePath: string, versionId: string, expectedHash: string) => {
    const result = await restoreProjectFileVersion(projectId, filePath, versionId, expectedHash)
    setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item))
    return { content: result.content, contentHash: result.contentHash }
  }

  const addSchedule = async (input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>) => {
    const schedule = await createSchedule(input)
    setSchedules((current) => [...current, schedule].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)))
  }
  const toggleSchedule = async (schedule: TaskSchedule) => {
    const updated = await setScheduleEnabled(schedule.id, !schedule.enabled)
    setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item))
  }
  const runSchedule = async (schedule: TaskSchedule) => {
    const result = await runScheduleNow(schedule.id)
    setSchedules((current) => current.map((item) => item.id === result.schedule.id ? result.schedule : item))
    setTasks((current) => [result.task, ...current])
    setConversations((current) => upsertConversation(current, conversationSummaryFromTask(result.task)))
    navigateToTask(result.task.id)
  }

  if (shareId) return <SharedArtifact shareId={shareId} />

  const continueTask = async (prompt: string, attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = []) => {
    if (!activeTaskId) return
    setCreating(true)
    try {
      await sendFollowUp(activeTaskId, prompt, attachments)
    } finally {
      setCreating(false)
    }
  }
  const retryCurrentTask = async (taskId: string) => {
    setCreating(true)
    try {
      await retryTask(taskId)
      await refreshSnapshot()
    } finally {
      setCreating(false)
    }
  }
  const notifications = tasks.flatMap((task) => {
    const items: Array<{ id: string; task: Task; label: string; detail: string; tone: 'approval' | 'queue' | 'failure' }> = []
    if (task.approval?.state === 'pending') items.push({ id: `${task.id}:approval`, task, label: 'Wallet approval needed', detail: task.approval.action.replaceAll('_', ' '), tone: 'approval' })
    if (task.queuedGuidance.length) items.push({ id: `${task.id}:guidance`, task, label: `${task.queuedGuidance.length} guidance queued`, detail: 'Will resume after the active turn', tone: 'queue' })
    if (task.status === 'failed') items.push({ id: `${task.id}:failed`, task, label: 'Task needs attention', detail: 'Review the governed task evidence', tone: 'failure' })
    return items
  }).slice(0, 8)

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <AnimatePresence>{sidebarOpen && <><motion.button key="sidebar-backdrop" className="sidebar-backdrop" aria-label="Close sidebar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} /><motion.div key="sidebar-panel" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}><Sidebar view={view} conversations={conversations} activeTaskId={activeTaskId} onNewTask={() => navigateToTask(null)} onClose={() => setSidebarOpen(false)} onSelectTask={(taskId) => navigateToTask(taskId)} hasMoreConversations={Boolean(conversationCursor)} loadingMoreConversations={loadingConversationPage} onLoadMoreConversations={loadMoreConversations} projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId} onCreateProject={addProject} onAttachProjectFile={attachProjectFile} onRemoveProjectFile={detachProjectFile} onUpdateProjectFile={editProjectFile} onRestoreProjectFile={restoreProjectFile} onUpdateProjectContext={updateProject} onOpenSkills={() => navigateToView('skills')} onOpenLibrary={() => navigateToView('library')} onOpenSchedules={() => navigateToView('schedules')} onOpenComputers={() => navigateToView('computers')} /></motion.div></>}</AnimatePresence>
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" type="button" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}</button><span className="model-selector"><Sparkles size={14} /> ONEVibe 0.1 <ChevronDown size={13} /></span></div>
          <div className="topbar-right"><span className="trust-chip" title="OpenVTC protected · External approvals enabled"><ShieldCheck size={13} /> OpenVTC</span><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'Live' : 'Local'}</span><ThemeToggle /><div className="notification-wrap"><button className="icon-button" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}><Bell size={16} />{notifications.length > 0 && <i className="notification-count">{notifications.length}</i>}</button>{notificationsOpen && <motion.div className="notification-panel" initial={{ opacity: 0, y: -5, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}><header><strong>Activity</strong><span>{notifications.length ? `${notifications.length} needs attention` : 'All clear'}</span></header>{notifications.length ? notifications.map((item) => <button key={item.id} className={item.tone} onClick={() => { setNotificationsOpen(false); navigateToTask(item.task.id) }}><span>{item.tone === 'failure' ? <TriangleAlert size={14} /> : item.tone === 'approval' ? <ShieldCheck size={14} /> : <Sparkles size={14} />}</span><div><strong>{item.label}</strong><small>{item.task.title} · {item.detail}</small></div></button>) : <p>No approvals, queued guidance, or failed tasks.</p>}</motion.div>}</div><button className="share-button" disabled={!snapshot} onClick={() => { if (!snapshot) return; if (snapshot.share) window.open(`/share/${snapshot.share.id}`, '_blank'); else void requestShare(snapshot.id) }}><Share2 size={14} /> {snapshot?.share ? 'Open share' : snapshot?.approval?.action === 'share_artifact' && snapshot.approval.state === 'pending' ? 'Approval pending' : 'Share'}</button><a className="github-button" href="https://github.com/one-computer" target="_blank" rel="noreferrer"><CodeXml size={15} /> GitHub</a></div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'skills' ? <motion.section key="skills" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><SkillsLibrary catalog={skillCatalog} selected={selectedSkills} onToggle={toggleSkill} /></motion.section> : view === 'library' ? <motion.section key="library" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Library items={library} projects={projects} onOpenTask={navigateToTask} /></motion.section> : view === 'computers' ? <motion.section key="computers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Computers tasks={tasks} onOpenTask={navigateToTask} /></motion.section> : view === 'schedules' ? <motion.section key="schedules" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Schedules schedules={schedules} activeProjectId={activeProjectId} onCreate={addSchedule} onToggle={toggleSchedule} onRunNow={runSchedule} runtime={runtime} /></motion.section> : !activeTaskId ? (
            <motion.section key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="home-view">
              <div className="ambient-grid" />
              <div className="home-content">
                <h1>What will you<br /><span>build safely?</span></h1>
                <p>A capable cloud agent, with your data, tools, and approvals under your control.</p>
                <PromptComposer busy={creating} skills={selectedSkills} runtime={runtime} onSubmit={startTask} />
                <div className="starter-prompts">{starterPrompts.map((prompt) => <button key={prompt} onClick={() => void startTask(prompt)}>{prompt}<span>↗</span></button>)}</div>
              </div>
            </motion.section>
          ) : (
            <motion.section key="task" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`task-view ${mobileInspectorOpen ? 'mobile-inspector-open' : ''}`}>
              {!snapshot ? <div className="loading-state"><span className="loader" /> Loading governed workspace…</div> : (
                <>
                  <div className="conversation-pane">
                    <div className="conversation-header">
                      <div><span className="task-kicker">{projects.find((project) => project.id === snapshot.projectId)?.name ?? 'Project workspace'} · {snapshot.mode === 'chat' ? 'Conversation' : snapshot.provider === 'demo' ? 'Simulation · no model call' : snapshot.provider === 'claude_sdk' ? 'Claude Agent SDK' : snapshot.provider === 'onecomputer' ? 'ONEComputer sandbox' : 'AgentCore runtime'}</span><h2>{snapshot.title}</h2>{(snapshot.skills.length > 0 || snapshot.queuedGuidance.length > 0 || snapshot.references.length > 0 || snapshot.attachments.length > 0) && <div className="task-configuration">{snapshot.skills.map((skill) => <span key={skill}><Sparkles size={10} /> {skill.replaceAll('_', ' ')}</span>)}{snapshot.references.length > 0 && <span title="User-supplied website references are untrusted context"><Link2 size={10} /> {snapshot.references.length} reference{snapshot.references.length === 1 ? '' : 's'}</span>}{snapshot.attachments.length > 0 && <span title="Local attachments are staged as untrusted task input"><Paperclip size={10} /> {snapshot.attachments.length} file{snapshot.attachments.length === 1 ? '' : 's'}</span>}{snapshot.queuedGuidance.length > 0 && <span className="queued-guidance"><ShieldCheck size={10} /> {snapshot.queuedGuidance.length} guidance queued</span>}</div>}</div>
                      <div className="run-controls"><button type="button" className="mobile-inspector-toggle" onClick={() => setMobileInspectorOpen(true)}><Monitor size={12} /> View computer</button><span className={`status-badge ${snapshot.status}`}>{snapshot.status.replaceAll('_', ' ')}</span>{(snapshot.status === 'failed' || snapshot.status === 'cancelled') && <button className="cancel-button" onClick={() => void retryCurrentTask(snapshot.id)}><RotateCcw size={10} /> Retry</button>}{canStopTask(snapshot.status) && <button className="cancel-button" onClick={() => void cancelTask(snapshot.id)}><Square size={10} /> Stop</button>}</div>
                    </div>
                    {error && <div className="stream-warning">{error}</div>}
                    <Suspense fallback={<div className="aui-thread-loading">Loading durable conversation…</div>}><AssistantThread task={snapshot} busy={creating || Boolean(snapshot.inputRequest)} onSubmit={continueTask} /></Suspense>
                    <TaskTimeline task={snapshot} events={snapshot.events} />
                    {snapshot.queuedGuidance.length > 0 && <section className="guidance-queue"><header><div><ShieldCheck size={13} /><strong>Queued guidance</strong></div><span>Applies after this provider turn</span></header>{snapshot.queuedGuidance.map((guidance, index) => <article key={guidance.id}><div><span>Next {index + 1}</span><p>{guidance.prompt}</p></div><button type="button" onClick={() => void retractQueuedGuidance(snapshot.id, guidance.id)} aria-label={`Remove queued guidance ${index + 1}`} title="Remove before it reaches the provider"><X size={13} /></button></article>)}<footer>Removing a message keeps only cancellation metadata in the evidence ledger.</footer></section>}
                  </div>
                  <div className="workspace-pane"><div className="mobile-inspector-bar"><span><Monitor size={13} /> Computer inspector</span><button type="button" onClick={() => setMobileInspectorOpen(false)}>Back to conversation</button></div><Workspace task={snapshot} projects={projects} onMoveProject={moveTaskProject} onUpdateTags={setTaskTags} /></div>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
