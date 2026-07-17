import { Bell, ChevronDown, CodeXml, Link2, LoaderCircle, Menu, Monitor, PanelLeftClose, Paperclip, RotateCcw, Share2, ShieldCheck, Sparkles, Square, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { PromptComposer } from './components/PromptComposer'
import { Sidebar } from './components/Sidebar'
import { TaskTimeline } from './components/TaskTimeline'
import { Workspace } from './components/Workspace'
import { SharedArtifact } from './components/SharedArtifact'
import { Schedules } from './components/Schedules'
import { SkillsLibrary } from './components/SkillsLibrary'
import { Library } from './components/Library'
import { Computers } from './components/Computers'
import { HomeHero } from './components/HomeHero'
import { LoginPage } from './components/LoginPage'
import { ThemeToggle } from './components/ThemeToggle'
import { ThemeProvider } from './components/ThemeProvider'
import { useTask } from './hooks/useTask'
import { addProjectFile, cancelQueuedGuidance, cancelTask, createMcpConfig, createProject, createSchedule, createTask, deleteMcpConfig, deleteSchedule, fallbackSkillCatalog, forkTask, getRuntimeReadiness, installSkill, isBackendOfflineError, listConversations, listLibrary, listMcpConfigs, listProjects, listSchedules, listSkills, listTasks, moveTaskToProject, normalizeSelectedSkillIds, removeLibraryItem, removeProjectFile, removeSkill, requestShare, restoreProjectFileVersion, retryTask, runScheduleNow, sendFollowUp, setScheduleEnabled, updateProjectContext, updateProjectFile, updateTaskTags } from './lib/api'
import { conversationSummaryFromTask, upsertConversation } from './lib/conversation-summary'
import { getAuthSession, signOut as signOutAuth } from './lib/auth'
import { providerLabel, statusLabel } from './lib/runtime-labels'
import { useComposerStore, useSessionStore, useUiStore, viewFromLocation, type AppView } from './lib/stores'
import type { ConversationSummary, LibraryItem, Project, RuntimeMcpConfig, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill } from './types'
import './index.css'

const starterPrompts = [
  'Build a secure customer briefing workspace',
  'Research a market and produce an evidence-backed report',
  'Create an internal tool with a governed approval flow',
]
const AssistantThread = lazy(() => import('./components/AssistantThread').then((module) => ({ default: module.AssistantThread })))
const canStopTask = (status: Task['status']) => status === 'running' || status === 'pending' || status === 'waiting_for_user_input' || status === 'waiting_for_approval'
const persistSelectedSkills = (skills: TaskSkill[]) => {
  try { window.localStorage.setItem('onevibe.selected-skill-ids', JSON.stringify(skills)) } catch { /* Storage is optional. */ }
}
const reportError = (reason: unknown, fallback: string) => {
  toast.error(reason instanceof Error ? reason.message : fallback)
}
const emptyProjects: Project[] = []
const emptySchedules: TaskSchedule[] = []
const emptyLibrary: LibraryItem[] = []
const emptyTasks: Task[] = []

export default function App() {
  const shareId = window.location.pathname.match(/^\/share\/([^/]+)$/)?.[1]
  const queryClient = useQueryClient()
  const { data: tasksData, error: tasksError, refetch: refetchTasks } = useQuery({ queryKey: ['tasks'], queryFn: listTasks, staleTime: 5_000, refetchOnWindowFocus: false })
  const tasks = tasksData?.tasks ?? emptyTasks
  const { activeProjectId, setActiveProjectId, view, setView, activeTaskId, setActiveTaskId, sidebarOpen, setSidebarOpen, mobileInspectorOpen, setMobileInspectorOpen, notificationsOpen, setNotificationsOpen, backendOffline, setBackendOffline, retryingBackend, setRetryingBackend } = useUiStore()
  const { selectedSkills, setSelectedSkills, creating, setCreating } = useComposerStore()
  const { authState, setAuthState, authLoading, setAuthLoading } = useSessionStore()
  const { snapshot, connected, error, retry: retryConnection, refresh: refreshSnapshot } = useTask(activeTaskId)
  const skillQuery = useQuery({ queryKey: ['skills', authState?.session?.user.id ?? 'local'], queryFn: listSkills, enabled: !authLoading && (!authState?.enabled || Boolean(authState.session)), staleTime: 60_000 })
  const skillCatalog = skillQuery.data?.skills.map(({ id, title, summary, source, installed, contentUrl }) => ({ id, title, summary, source, installed, contentUrl })) ?? fallbackSkillCatalog
  const runtimeQuery = useQuery({ queryKey: ['runtime'], queryFn: getRuntimeReadiness, staleTime: 15_000, retry: 1, refetchOnWindowFocus: false })
  const runtime = runtimeQuery.data
  const mcpQuery = useQuery({ queryKey: ['mcp'], queryFn: listMcpConfigs, staleTime: 15_000 })
  const mcpConfigs = mcpQuery.data?.configs ?? []
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: listProjects, staleTime: 30_000 })
  const projects = projectsQuery.data?.projects ?? emptyProjects
  const schedulesQuery = useQuery({ queryKey: ['schedules'], queryFn: listSchedules, staleTime: 15_000 })
  const schedules = schedulesQuery.data?.schedules ?? emptySchedules
  const libraryQuery = useQuery({ queryKey: ['library'], queryFn: listLibrary, staleTime: 15_000 })
  const library = libraryQuery.data?.items ?? emptyLibrary
  type ConversationPage = Awaited<ReturnType<typeof listConversations>>
  const { data: conversationsData, error: conversationsError, hasNextPage: conversationsHasNextPage, isFetchingNextPage: conversationsIsFetchingNextPage, fetchNextPage: fetchMoreConversations } = useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => listConversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
  const conversations = conversationsData?.pages.flatMap((page) => page.conversations) ?? []
  const updateTasksCache = useCallback((updater: (tasks: Task[]) => Task[]) => {
    queryClient.setQueryData<{ tasks: Task[] }>(['tasks'], (current) => ({ tasks: updater(current?.tasks ?? []) }))
  }, [queryClient])
  const upsertConversationCache = useCallback((incoming: ConversationSummary) => {
    queryClient.setQueryData<InfiniteData<ConversationPage>>(['conversations'], (current) => {
      if (!current || !current.pages[0]) return current
      return { ...current, pages: [{ ...current.pages[0], conversations: upsertConversation(current.pages[0].conversations, incoming) }, ...current.pages.slice(1)] }
    })
  }, [queryClient])

  const refreshAuth = useCallback(async () => {
    try { setAuthState(await getAuthSession()) } catch { setAuthState({ enabled: false, session: null }) } finally { setAuthLoading(false) }
  }, [setAuthLoading, setAuthState])

  const refreshTasks = useCallback(async () => {
    const result = await refetchTasks()
    if (result.error) throw result.error
    return result.data
  }, [refetchTasks])

  const loadMoreConversations = useCallback(async () => {
    if (!conversationsHasNextPage || conversationsIsFetchingNextPage) return
    try { await fetchMoreConversations() } catch (reason) { reportError(reason, 'Unable to load more conversations') }
  }, [conversationsHasNextPage, conversationsIsFetchingNextPage, fetchMoreConversations])

  useEffect(() => { if (tasksError) reportError(tasksError, 'Unable to load tasks') }, [tasksError])
  useEffect(() => { void refreshAuth() }, [refreshAuth])
  useEffect(() => { if (conversationsError) reportError(conversationsError, 'Unable to load conversations') }, [conversationsError])
  useEffect(() => {
    if (skillQuery.data?.skills.length) {
      const catalog = skillQuery.data.skills.map(({ id, title, summary, source, installed, contentUrl }) => ({ id, title, summary, source, installed, contentUrl }))
      setSelectedSkills((current) => normalizeSelectedSkillIds(current, catalog))
    }
  }, [setSelectedSkills, skillQuery.data?.skills])
  useEffect(() => { if (skillQuery.error) reportError(skillQuery.error, 'Unable to load the skill catalog; local guides remain available.') }, [skillQuery.error])
  useEffect(() => { persistSelectedSkills(selectedSkills) }, [selectedSkills])
  useEffect(() => { if (schedulesQuery.error) reportError(schedulesQuery.error, 'Unable to load schedules') }, [schedulesQuery.error])
  useEffect(() => { if (libraryQuery.error) reportError(libraryQuery.error, 'Unable to load Library') }, [libraryQuery.error])
  useEffect(() => { if (mcpQuery.error) reportError(mcpQuery.error, 'Unable to load MCP servers') }, [mcpQuery.error])
  useEffect(() => { if (projectsQuery.error) reportError(projectsQuery.error, 'Unable to load projects') }, [projectsQuery.error])
  useEffect(() => {
    if (runtimeQuery.data) setBackendOffline(false)
    else if (runtimeQuery.error && isBackendOfflineError(runtimeQuery.error)) setBackendOffline(true)
  }, [runtimeQuery.data, runtimeQuery.error, setBackendOffline])
  useEffect(() => { if (projects.length && !projects.some((project) => project.id === activeProjectId)) setActiveProjectId(projects[0]?.id ?? 'project_onevibe') }, [activeProjectId, projects, setActiveProjectId])
  useEffect(() => {
    const onPopState = () => {
      const nextTaskId = window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null
      setActiveTaskId(nextTaskId)
      setView(viewFromLocation())
      if (nextTaskId && window.matchMedia('(max-width: 1250px)').matches) setSidebarOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setActiveTaskId, setSidebarOpen, setView])
  useEffect(() => {
    if (!snapshot) return
    updateTasksCache((current) => current.map((task) => task.id === snapshot.id ? snapshot : task))
    upsertConversationCache(conversationSummaryFromTask(snapshot))
    if (snapshot.status === 'completed') void queryClient.invalidateQueries({ queryKey: ['library'] })
  }, [queryClient, snapshot, updateTasksCache, upsertConversationCache])

  const preferredProvider: Task['provider'] = runtime?.defaultProvider ?? (['claude_sdk', 'onecomputer', 'remote'] as const).map((id) => runtime?.providers.find((candidate) => candidate.id === id && candidate.available)?.id).find((id): id is Task['provider'] => Boolean(id)) ?? 'demo'
  const startTask = async (prompt: string, provider: Task['provider'] = preferredProvider, mode: TaskMode = 'chat', references: string[] = [], attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = [], skills: TaskSkill[] = selectedSkills) => {
    setCreating(true)
    try {
      const task = await createTask(prompt, provider, mode, activeProjectId, references, attachments, skills)
      updateTasksCache((current) => [task, ...current.filter((candidate) => candidate.id !== task.id)])
      upsertConversationCache(conversationSummaryFromTask(task))
      setActiveTaskId(task.id)
      window.history.pushState({}, '', `/tasks/${task.id}`)
    } catch (reason) {
      reportError(reason, 'Unable to start the task')
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

  const installMarketplaceSkill = async (skillId: TaskSkill) => {
    try {
      await installSkill(skillId)
      await skillQuery.refetch()
    } catch (reason) { reportError(reason, 'Unable to install marketplace skill') }
  }
  const removeMarketplaceSkill = async (skillId: TaskSkill) => {
    try {
      await removeSkill(skillId)
      await skillQuery.refetch()
      setSelectedSkills((current) => current.filter((skill) => skill !== skillId))
    } catch (reason) { reportError(reason, 'Unable to remove marketplace skill') }
  }

  const cancelTaskMutation = useMutation({
    mutationFn: (taskId: string) => cancelTask(taskId),
    onSuccess: async () => {
      await Promise.all([refreshSnapshot(), refreshTasks()])
    },
  })
  const cancelGuidanceMutation = useMutation({
    mutationFn: ({ taskId, guidanceId }: { taskId: string; guidanceId: string }) => cancelQueuedGuidance(taskId, guidanceId),
    onSuccess: async (task) => {
      updateTasksCache((current) => [task, ...current.filter((candidate) => candidate.id !== task.id)])
      upsertConversationCache(conversationSummaryFromTask(task))
      await refreshSnapshot()
    },
  })
  const moveTaskMutation = useMutation({
    mutationFn: ({ taskId, projectId }: { taskId: string; projectId: string }) => moveTaskToProject(taskId, projectId),
    onSuccess: async (task) => {
      updateTasksCache((current) => current.map((candidate) => candidate.id === task.id ? task : candidate))
      upsertConversationCache(conversationSummaryFromTask(task))
      await Promise.all([refreshSnapshot(), queryClient.invalidateQueries({ queryKey: ['library'] })])
    },
  })
  const updateTaskTagsMutation = useMutation({
    mutationFn: ({ taskId, tags }: { taskId: string; tags: string[] }) => updateTaskTags(taskId, tags),
    onSuccess: async (task) => {
      updateTasksCache((current) => current.map((candidate) => candidate.id === task.id ? task : candidate))
      upsertConversationCache(conversationSummaryFromTask(task))
      await Promise.all([refreshSnapshot(), queryClient.invalidateQueries({ queryKey: ['library'] })])
    },
  })
  const followUpMutation = useMutation({
    mutationFn: ({ taskId, prompt, attachments }: { taskId: string; prompt: string; attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> }) => sendFollowUp(taskId, prompt, attachments),
  })
  const branchMutation = useMutation({
    mutationFn: ({ taskId, fromMessageId, newPrompt }: { taskId: string; fromMessageId: string; newPrompt: string }) => forkTask(taskId, fromMessageId, newPrompt),
    onSuccess: (task) => {
      updateTasksCache((current) => [task, ...current.filter((candidate) => candidate.id !== task.id)])
      upsertConversationCache(conversationSummaryFromTask(task))
      navigateToTask(task.id)
    },
  })
  const retryMutation = useMutation({
    mutationFn: ({ taskId, provider }: { taskId: string; provider?: Task['provider'] }) => retryTask(taskId, `retry_${crypto.randomUUID()}`, provider),
    onSuccess: async () => {
      await Promise.all([refreshSnapshot(), refreshTasks()])
    },
  })
  const shareMutation = useMutation({
    mutationFn: (taskId: string) => requestShare(taskId),
    onSuccess: async () => {
      await refreshSnapshot()
    },
  })

  const addProject = async (name: string, context: string) => {
    try {
      const project = await createProject(name, context)
      queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: [project, ...(current?.projects ?? [])] }))
      setActiveProjectId(project.id)
    } catch (reason) { reportError(reason, 'Unable to create project') }
  }
  const attachProjectFile = async (projectId: string, file: Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }) => {
    try {
      const project = await addProjectFile(projectId, file)
      queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: (current?.projects ?? []).map((item) => item.id === project.id ? project : item) }))
    } catch (reason) { reportError(reason, 'Unable to attach project knowledge') }
  }
  const updateProject = async (projectId: string, context: string) => {
    try {
      const project = await updateProjectContext(projectId, context)
      queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: (current?.projects ?? []).map((item) => item.id === project.id ? project : item) }))
    } catch (reason) { reportError(reason, 'Unable to update project context') }
  }
  const detachProjectFile = async (projectId: string, filePath: string) => {
    try {
      const project = await removeProjectFile(projectId, filePath)
      queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: (current?.projects ?? []).map((item) => item.id === project.id ? project : item) }))
    } catch (reason) { reportError(reason, 'Unable to remove project knowledge') }
  }
  const editProjectFile = async (projectId: string, filePath: string, content: string, expectedHash: string) => {
    try {
      const result = await updateProjectFile(projectId, filePath, content, expectedHash)
      queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: (current?.projects ?? []).map((item) => item.id === result.project.id ? result.project : item) }))
    } catch (reason) { reportError(reason, 'Unable to save project knowledge') }
  }
  const retractQueuedGuidance = async (taskId: string, guidanceId: string) => {
    try { await cancelGuidanceMutation.mutateAsync({ taskId, guidanceId }) } catch (reason) { reportError(reason, 'Unable to remove queued guidance') }
  }
  const moveTaskProject = async (taskId: string, projectId: string) => {
    try { await moveTaskMutation.mutateAsync({ taskId, projectId }) } catch (reason) { reportError(reason, 'Unable to move task') }
  }
  const setTaskTags = async (taskId: string, tags: string[]) => {
    try { await updateTaskTagsMutation.mutateAsync({ taskId, tags }) } catch (reason) { reportError(reason, 'Unable to update task tags') }
  }
  const restoreProjectFile = async (projectId: string, filePath: string, versionId: string, expectedHash: string) => {
    const result = await restoreProjectFileVersion(projectId, filePath, versionId, expectedHash)
    queryClient.setQueryData<{ projects: Project[] }>(['projects'], (current) => ({ projects: (current?.projects ?? []).map((item) => item.id === result.project.id ? result.project : item) }))
    return { content: result.content, contentHash: result.contentHash }
  }

  const addSchedule = async (input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>) => {
    try {
      const schedule = await createSchedule(input)
      queryClient.setQueryData<{ schedules: TaskSchedule[] }>(['schedules'], (current) => ({ schedules: [...(current?.schedules ?? []), schedule].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)) }))
    } catch (reason) { reportError(reason, 'Unable to create schedule') }
  }
  const toggleSchedule = async (schedule: TaskSchedule) => {
    try {
      const updated = await setScheduleEnabled(schedule.id, !schedule.enabled)
      queryClient.setQueryData<{ schedules: TaskSchedule[] }>(['schedules'], (current) => ({ schedules: (current?.schedules ?? []).map((item) => item.id === updated.id ? updated : item) }))
    } catch (reason) { reportError(reason, 'Unable to update schedule') }
  }
  const removeSchedule = async (schedule: TaskSchedule) => {
    if (!window.confirm(`Delete the schedule “${schedule.name}”? Future runs will stop; existing tasks remain.`)) return
    try {
      await deleteSchedule(schedule.id)
      queryClient.setQueryData<{ schedules: TaskSchedule[] }>(['schedules'], (current) => ({ schedules: (current?.schedules ?? []).filter((item) => item.id !== schedule.id) }))
    } catch (reason) { reportError(reason, 'Unable to delete schedule') }
  }
  const addMcpConfig = async (input: Pick<RuntimeMcpConfig, 'name' | 'command' | 'args'>) => {
    try {
      const config = await createMcpConfig(input)
      queryClient.setQueryData<{ configs: RuntimeMcpConfig[] }>(['mcp'], (current) => ({ configs: [config, ...(current?.configs ?? [])] }))
    } catch (reason) { reportError(reason, 'Unable to add MCP server') }
  }
  const removeMcpConfig = async (config: RuntimeMcpConfig) => {
    if (!window.confirm(`Remove MCP server “${config.name}”? New turns will stop receiving it.`)) return
    try {
      await deleteMcpConfig(config.id)
      queryClient.setQueryData<{ configs: RuntimeMcpConfig[] }>(['mcp'], (current) => ({ configs: (current?.configs ?? []).filter((item) => item.id !== config.id) }))
    } catch (reason) { reportError(reason, 'Unable to remove MCP server') }
  }
  const hideLibraryItem = async (task: Task) => {
    if (!window.confirm(`Remove “${task.title}” from Library? The conversation and evidence will remain available.`)) return
    try {
      await removeLibraryItem(task.id)
      queryClient.setQueryData<{ items: LibraryItem[] }>(['library'], (current) => ({ items: (current?.items ?? []).filter((item) => item.task.id !== task.id) }))
    } catch (reason) { reportError(reason, 'Unable to remove Library item') }
  }
  const runSchedule = async (schedule: TaskSchedule) => {
    try {
      const result = await runScheduleNow(schedule.id)
      queryClient.setQueryData<{ schedules: TaskSchedule[] }>(['schedules'], (current) => ({ schedules: (current?.schedules ?? []).map((item) => item.id === result.schedule.id ? result.schedule : item) }))
      updateTasksCache((current) => [result.task, ...current.filter((candidate) => candidate.id !== result.task.id)])
      upsertConversationCache(conversationSummaryFromTask(result.task))
      navigateToTask(result.task.id)
    } catch (reason) { reportError(reason, 'Unable to run schedule') }
  }
  const signOut = async () => {
    try {
      await signOutAuth()
      setAuthState({ enabled: true, session: null })
      queryClient.removeQueries({ queryKey: ['tasks'] })
      queryClient.removeQueries({ queryKey: ['projects'] })
      queryClient.removeQueries({ queryKey: ['schedules'] })
      queryClient.removeQueries({ queryKey: ['library'] })
      queryClient.removeQueries({ queryKey: ['conversations'] })
    } catch (reason) { reportError(reason, 'Unable to sign out') }
  }
  const shareCurrentTask = async () => {
    if (!snapshot) return
    try { await shareMutation.mutateAsync(snapshot.id) } catch (reason) { reportError(reason, 'Unable to request a share link') }
  }

  if (shareId) return <SharedArtifact shareId={shareId} />
  if (authLoading) return <div className="auth-loading"><span className="loader" /> Checking workspace session…</div>
  if (authState?.enabled && !authState.session) return <LoginPage onAuthenticated={refreshAuth} />

  const continueTask = async (prompt: string, attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = []) => {
    if (!activeTaskId) return
    setCreating(true)
    try { await followUpMutation.mutateAsync({ taskId: activeTaskId, prompt, attachments }) } catch (reason) { reportError(reason, 'Unable to send the message') } finally { setCreating(false) }
  }
  const branchFromMessage = async (taskId: string, fromMessageId: string, newPrompt: string) => {
    setCreating(true)
    try { await branchMutation.mutateAsync({ taskId, fromMessageId, newPrompt }) } catch (reason) { reportError(reason, 'Unable to create conversation branch') } finally { setCreating(false) }
  }
  const retryCurrentTask = async (taskId: string, provider?: Task['provider']) => {
    setCreating(true)
    try { await retryMutation.mutateAsync({ taskId, provider }) } catch (reason) { reportError(reason, 'Unable to retry the task') } finally { setCreating(false) }
  }
  const retryBackend = async () => {
    setRetryingBackend(true)
    try {
      const result = await runtimeQuery.refetch()
      if (result.error) throw result.error
    } catch (reason) {
      // The banner remains visible and gives the operator another explicit retry.
      reportError(reason, 'Backend is still offline')
    } finally {
      setRetryingBackend(false)
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
    <ThemeProvider scopeKey={authState?.session?.user.id ?? 'local'}>
    <>
      <Toaster position="bottom-right" closeButton richColors />
      <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <AnimatePresence>{sidebarOpen && <><motion.button key="sidebar-backdrop" className="sidebar-backdrop" aria-label="Close sidebar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} /><motion.div key="sidebar-panel" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}><Sidebar view={view} conversations={conversations} activeTaskId={activeTaskId} onNewTask={() => navigateToTask(null)} onClose={() => setSidebarOpen(false)} onSelectTask={(taskId) => navigateToTask(taskId)} hasMoreConversations={Boolean(conversationsHasNextPage)} loadingMoreConversations={conversationsIsFetchingNextPage} onLoadMoreConversations={loadMoreConversations} projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId} onCreateProject={addProject} onAttachProjectFile={attachProjectFile} onRemoveProjectFile={detachProjectFile} onUpdateProjectFile={editProjectFile} onRestoreProjectFile={restoreProjectFile} onUpdateProjectContext={updateProject} onOpenSkills={() => navigateToView('skills')} onOpenLibrary={() => navigateToView('library')} onOpenSchedules={() => navigateToView('schedules')} onOpenComputers={() => navigateToView('computers')} skillCount={skillCatalog.length} user={authState?.session?.user} onSignOut={signOut} /></motion.div></>}</AnimatePresence>
      <main className="main-shell">
        {backendOffline && <div className="backend-offline-banner" role="alert"><div><TriangleAlert size={15} /><span><strong>Backend offline</strong><small>Run <code>npm run dev</code> in the ONEVibe project root to connect the workspace.</small></span></div><button type="button" onClick={() => void retryBackend()} disabled={retryingBackend}>{retryingBackend ? 'Checking…' : 'Retry'}</button></div>}
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" type="button" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}</button><button type="button" className="model-selector"><Sparkles size={14} /> ONEVibe 0.1 <ChevronDown size={13} /></button></div>
          <div className="topbar-right"><span className="trust-chip" title="OpenVTC protected · External approvals enabled"><ShieldCheck size={13} /> OpenVTC</span><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'Live' : 'Local'}</span><ThemeToggle /><div className="notification-wrap"><button className="icon-button" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}><Bell size={16} />{notifications.length > 0 && <i className="notification-count">{notifications.length}</i>}</button>{notificationsOpen && <motion.div className="notification-panel" initial={{ opacity: 0, y: -5, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}><header><strong>Activity</strong><span>{notifications.length ? `${notifications.length} needs attention` : 'All clear'}</span></header>{notifications.length ? notifications.map((item) => <button key={item.id} className={item.tone} onClick={() => { setNotificationsOpen(false); navigateToTask(item.task.id) }}><span>{item.tone === 'failure' ? <TriangleAlert size={14} /> : item.tone === 'approval' ? <ShieldCheck size={14} /> : <Sparkles size={14} />}</span><div><strong>{item.label}</strong><small>{item.task.title} · {item.detail}</small></div></button>) : <p>No approvals, queued guidance, or failed tasks.</p>}</motion.div>}</div><button className="share-button" disabled={!snapshot || shareMutation.isPending} onClick={() => { if (!snapshot) return; if (snapshot.share) window.open(`/share/${snapshot.share.id}`, '_blank'); else void shareCurrentTask() }}><Share2 size={14} /> {snapshot?.share ? 'Open share' : snapshot?.approval?.action === 'share_artifact' && snapshot.approval.state === 'pending' ? 'Approval pending' : shareMutation.isPending ? 'Requesting…' : 'Share'}</button><a className="github-button" href="https://github.com/one-computer" target="_blank" rel="noreferrer"><CodeXml size={15} /> GitHub</a></div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'skills' ? <motion.section key="skills" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><SkillsLibrary catalog={skillCatalog} selected={selectedSkills} onToggle={toggleSkill} onInstall={installMarketplaceSkill} onRemove={removeMarketplaceSkill} /></motion.section> : view === 'library' ? <motion.section key="library" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Library items={library} projects={projects} onOpenTask={navigateToTask} onRemove={hideLibraryItem} /></motion.section> : view === 'computers' ? <motion.section key="computers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Computers tasks={tasks} onOpenTask={navigateToTask} runtime={runtime} mcpConfigs={mcpConfigs} onCreateMcpConfig={addMcpConfig} onDeleteMcpConfig={removeMcpConfig} /></motion.section> : view === 'schedules' ? <motion.section key="schedules" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Schedules schedules={schedules} activeProjectId={activeProjectId} onCreate={addSchedule} onToggle={toggleSchedule} onRunNow={runSchedule} onDelete={removeSchedule} runtime={runtime} /></motion.section> : !activeTaskId ? (
            <motion.section key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="home-view">
              <div className="home-content">
                <HomeHero name={authState?.session?.user.name?.trim() || authState?.session?.user.email.split('@')[0] || 'there'} />
                {runtime && !runtime.providers.some((candidate) => candidate.available && candidate.id !== 'demo') && <div className="setup-banner" role="status"><TriangleAlert size={14} /><span><strong>No governed runtime configured</strong><small>Set the protected ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY, or configure a governed sandbox runtime.</small></span></div>}
                <PromptComposer busy={creating} skills={selectedSkills} runtime={runtime} initialProvider={preferredProvider} onSubmit={startTask} />
                <div className="starter-prompts">{starterPrompts.map((prompt) => <button key={prompt} onClick={() => void startTask(prompt)}>{prompt}<span>↗</span></button>)}</div>
              </div>
            </motion.section>
          ) : (
            <motion.section key="task" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`task-view ${mobileInspectorOpen ? 'mobile-inspector-open' : ''}`}>
              {!snapshot ? <div className="loading-state"><span className="loader" /> Loading task…</div> : (
                <>
                  <div className="conversation-pane">
                    <div className="conversation-header">
                      <div><span className="task-kicker">{projects.find((project) => project.id === snapshot.projectId)?.name ?? 'Project workspace'} · {snapshot.mode === 'chat' ? 'Conversation' : providerLabel(snapshot.provider)}</span><h2>{snapshot.title}</h2>{(snapshot.skills.length > 0 || snapshot.queuedGuidance.length > 0 || snapshot.references.length > 0 || snapshot.attachments.length > 0) && <div className="task-configuration">{snapshot.skills.map((skill) => <span key={skill}><Sparkles size={10} /> {skill.replaceAll('_', ' ')}</span>)}{snapshot.references.length > 0 && <span title="User-supplied website references are untrusted context"><Link2 size={10} /> {snapshot.references.length} reference{snapshot.references.length === 1 ? '' : 's'}</span>}{snapshot.attachments.length > 0 && <span title="Local attachments are staged as untrusted task input"><Paperclip size={10} /> {snapshot.attachments.length} file{snapshot.attachments.length === 1 ? '' : 's'}</span>}{snapshot.queuedGuidance.length > 0 && <span className="queued-guidance"><ShieldCheck size={10} /> {snapshot.queuedGuidance.length} guidance queued</span>}</div>}</div>
                      <div className="run-controls"><button type="button" className="mobile-inspector-toggle" onClick={() => setMobileInspectorOpen(true)}><Monitor size={12} /> View computer</button><span className={`status-badge ${snapshot.status}`}>{statusLabel(snapshot.status)}</span>{(snapshot.status === 'failed' || snapshot.status === 'cancelled') && <button className="cancel-button" onClick={() => void retryCurrentTask(snapshot.id)} disabled={retryMutation.isPending}><RotateCcw size={10} /> {retryMutation.isPending ? 'Retrying…' : 'Retry'}</button>}{canStopTask(snapshot.status) && <button className="cancel-button" onClick={() => void cancelTaskMutation.mutateAsync(snapshot.id).catch((reason: unknown) => reportError(reason, 'Unable to stop the task'))} disabled={cancelTaskMutation.isPending}><Square size={10} /> {cancelTaskMutation.isPending ? 'Stopping…' : 'Stop'}</button>}</div>
                    </div>
                    {error && <div className="stream-warning"><span>{error}</span><button type="button" onClick={retryConnection}>Retry connection</button></div>}
                    {snapshot.provider === 'demo' && <div className="demo-mode-banner" role="status"><div><Sparkles size={14} /><span><strong>Simulation only</strong><small>No model call is made in this task. Use a configured LiteLLM-backed runtime for real provider execution.</small></span></div>{preferredProvider !== 'demo' && <button type="button" onClick={() => navigateToTask(null)}>Start a new governed task</button>}</div>}
                    <TaskTimeline task={snapshot} events={snapshot.events} />
                    <Suspense fallback={<div className="aui-thread-loading">Loading durable conversation…</div>}><AssistantThread task={snapshot} busy={creating || followUpMutation.isPending || branchMutation.isPending || retryMutation.isPending || Boolean(snapshot.inputRequest)} onSubmit={continueTask} onSwitchRuntime={(provider) => retryCurrentTask(snapshot.id, provider)} onEditMessage={(messageId, newPrompt) => branchFromMessage(snapshot.id, messageId, newPrompt)} /></Suspense>
                    {snapshot.queuedGuidance.length > 0 && <section className="guidance-queue"><header><div><ShieldCheck size={13} /><strong>Queued guidance</strong></div><span>Applies after this provider turn</span></header>{snapshot.queuedGuidance.map((guidance, index) => { const removing = cancelGuidanceMutation.isPending && cancelGuidanceMutation.variables?.guidanceId === guidance.id; return <article key={guidance.id}><div><span>Next {index + 1}</span><p>{guidance.prompt}</p></div><button type="button" disabled={removing} onClick={() => void retractQueuedGuidance(snapshot.id, guidance.id)} aria-label={`Remove queued guidance ${index + 1}`} title={removing ? 'Removing queued guidance…' : 'Remove before it reaches the provider'}>{removing ? <LoaderCircle className="spin" size={13} /> : <X size={13} />}</button></article>})}<footer>Removing a message keeps only cancellation metadata in the evidence ledger.</footer></section>}
                  </div>
                  <div className="workspace-pane"><div className="mobile-inspector-bar"><span><Monitor size={13} /> Computer inspector</span><button type="button" onClick={() => setMobileInspectorOpen(false)}>Back to conversation</button></div><Workspace task={snapshot} projects={projects} runtime={runtime} onMoveProject={moveTaskProject} onUpdateTags={setTaskTags} /></div>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      </div>
    </>
    </ThemeProvider>
  )
}
