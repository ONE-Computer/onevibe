import { AppWindow, BarChart3, Blocks, Bot, Clock3, FileEdit, FileText, FolderKanban, FolderOpen, Gamepad2, Globe2, LayoutKanban, Library, MonitorCog, Palette, Pencil, Plus, Presentation, Search, Sparkles, X, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationSummary, Project, ProjectFileVersion, TaskMode } from '../types'
import type { AuthUser } from '../lib/auth'
import { getProjectFile, listConversations, listProjectFileVersions } from '../lib/api'
import { providerLabel } from '../lib/runtime-labels'
import { BrandMark } from './BrandMark'
import { useTenantTheme } from '../hooks/useTenantTheme'
import type { Locale } from '../lib/i18n'
import { t } from '../lib/i18n'

type Props = {
  view: 'agent' | 'schedules' | 'skills' | 'library' | 'computers' | 'appearance' | 'homepage' | 'artefacts' | 'capabilities' | 'board'
  conversations: ConversationSummary[]
  activeTaskId: string | null
  onNewTask: () => void
  onClose: () => void
  onSelectTask: (taskId: string) => void
  hasMoreConversations: boolean
  loadingMoreConversations: boolean
  onLoadMoreConversations: () => Promise<void>
  projects: Project[]
  activeProjectId: string
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string, context: string) => Promise<void>
  onAttachProjectFile: (projectId: string, file: { name: string; mimeType: string; dataBase64: string }) => Promise<void>
  onRemoveProjectFile: (projectId: string, filePath: string) => Promise<void>
  onUpdateProjectFile: (projectId: string, filePath: string, content: string, expectedHash: string) => Promise<void>
  onRestoreProjectFile: (projectId: string, filePath: string, versionId: string, expectedHash: string) => Promise<{ content: string; contentHash: string }>
  onUpdateProjectContext: (projectId: string, context: string) => Promise<void>
  onOpenSkills: () => void
  onOpenLibrary: () => void
  onOpenSchedules: () => void
  onOpenComputers: () => void
  onOpenBoard: () => void
  onOpenAppearance: () => void
  onOpenHomepage: () => void
  onOpenArtefacts: () => void
  onOpenCapabilities: () => void
  skillCount: number
  user?: AuthUser
  onSignOut: () => Promise<void>
  locale?: Locale
}

const conversationSourceLabel = (provider: ConversationSummary['provider']) => providerLabel(provider)

const modeIconFor = (mode: TaskMode) => {
  switch (mode) {
    case 'chat': return Bot
    case 'website': return Globe2
    case 'slides': return Presentation
    case 'document': return FileText
    case 'research': return Search
    case 'data': return BarChart3
    case 'design': return Palette
    case 'app': return AppWindow
    case 'game': return Gamepad2
    default: return Sparkles
  }
}

const relativeShort = (iso: string, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const bucketFor = (iso: string, now: number): 'Today' | 'Yesterday' | 'This week' | 'Older' => {
  const then = new Date(iso).getTime()
  const nowDate = new Date(now); nowDate.setHours(0, 0, 0, 0)
  const thenDate = new Date(then); thenDate.setHours(0, 0, 0, 0)
  const days = Math.round((nowDate.getTime() - thenDate.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'This week'
  return 'Older'
}

export const Sidebar = ({ view, conversations, activeTaskId, onNewTask, onClose, onSelectTask, hasMoreConversations, loadingMoreConversations, onLoadMoreConversations, projects, activeProjectId, onSelectProject, onCreateProject, onAttachProjectFile, onRemoveProjectFile, onUpdateProjectFile, onRestoreProjectFile, onUpdateProjectContext, onOpenSkills, onOpenLibrary, onOpenSchedules, onOpenComputers, onOpenBoard, onOpenAppearance, onOpenHomepage, onOpenArtefacts, onOpenCapabilities, skillCount, user, onSignOut, locale = 'en' }: Props) => {
  const { config } = useTenantTheme()
  const [query, setQuery] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [editingProjectContext, setEditingProjectContext] = useState(false)
  const [projectContextDraft, setProjectContextDraft] = useState('')
  const [editingProjectFile, setEditingProjectFile] = useState<{ name: string; path: string; content: string; contentHash: string }>()
  const [projectFileError, setProjectFileError] = useState('')
  const [projectFileVersions, setProjectFileVersions] = useState<ProjectFileVersion[]>([])
  const [projectFileHistoryOpen, setProjectFileHistoryOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<ConversationSummary[]>([])
  const projectFileInput = useRef<HTMLInputElement>(null)
  const projectFolderInput = useRef<HTMLInputElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const attachKnowledgeFiles = async (fileList: FileList | File[]) => {
    if (!activeProject) return
    const selected = Array.from(fileList).filter((file) => file.size > 0 && file.size <= 256 * 1024).slice(0, Math.max(0, 12 - activeProject.files.length))
    for (const file of selected) {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
      // Preserve enough folder provenance for human review without allowing a
      // browser-provided path to become a server filesystem path.
      const relative = file.webkitRelativePath ? file.webkitRelativePath.replaceAll('/', '__') : file.name
      await onAttachProjectFile(activeProject.id, { name: relative, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '' })
    }
  }
  useEffect(() => { projectFolderInput.current?.setAttribute('webkitdirectory', '') }, [])
  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return }
    let active = true
    const timer = window.setTimeout(() => { void listConversations(undefined, 50, query.trim()).then((result) => { if (active) setSearchResults(result.conversations) }) }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])
  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return conversations
    if (normalized.length >= 2) return searchResults
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(normalized) || conversation.lastMessage?.preview.toLocaleLowerCase().includes(normalized))
  }, [query, conversations, searchResults])
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  const groupedConversations = useMemo(() => {
    const groups: Array<{ label: 'Today' | 'Yesterday' | 'This week' | 'Older'; items: ConversationSummary[] }> = [
      { label: 'Today', items: [] }, { label: 'Yesterday', items: [] }, { label: 'This week', items: [] }, { label: 'Older', items: [] },
    ]
    for (const conv of visibleConversations) {
      const bucket = bucketFor(conv.updatedAt, now)
      groups.find((g) => g.label === bucket)!.items.push(conv)
    }
    return groups.filter((g) => g.items.length > 0)
  }, [visibleConversations, now])
  return (
  <aside className="sidebar">
    <div className="sidebar-top"><BrandMark /><button type="button" className="sidebar-close" aria-label="Close sidebar" onClick={onClose}><X size={15} /></button></div>
    <button className="new-task" onClick={onNewTask}><Plus size={16} /> {t('newTask', locale)} <kbd>⌘ K</kbd></button>
    <label className="history-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
    <nav className="primary-nav" aria-label="Primary">
      <button className={`nav-item ${view === 'agent' ? 'active' : ''}`} onClick={onNewTask}><Sparkles size={16} /> Agent</button>
      <button className={`nav-item ${view === 'skills' ? 'active' : ''}`} onClick={onOpenSkills}><Blocks size={16} /> {t('skills', locale)} <span className="nav-pill">{skillCount}</span></button>
      <button className={`nav-item ${view === 'schedules' ? 'active' : ''}`} onClick={onOpenSchedules}><Clock3 size={16} /> {t('scheduled', locale)}</button>
      <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={onOpenLibrary}><Library size={16} /> {t('library', locale)}</button>
      <button className={`nav-item ${view === 'computers' ? 'active' : ''}`} onClick={onOpenComputers}><MonitorCog size={16} /> {t('computers', locale)}</button>
      <button className={`nav-item ${view === 'board' ? 'active' : ''}`} onClick={onOpenBoard}><LayoutKanban size={16} /> {t('board', locale)}</button>
      <button className={`nav-item ${view === 'appearance' ? 'active' : ''}`} onClick={onOpenAppearance}><Palette size={16} /> {t('appearance', locale)}</button>
      <button className={`nav-item ${view === 'homepage' ? 'active' : ''}`} onClick={onOpenHomepage}><FileEdit size={16} /> Homepage</button>
      <button className={`nav-item ${view === 'artefacts' ? 'active' : ''}`} onClick={onOpenArtefacts}><FolderOpen size={16} /> Artefacts</button>
      <button className={`nav-item ${view === 'capabilities' ? 'active' : ''}`} onClick={onOpenCapabilities}><Zap size={16} /> Capabilities</button>
      {config?.navigation?.items?.map((item) => <a key={`${item.label}:${item.href}`} className="nav-item tenant-nav-link" href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}>{item.label}</a>)}
    </nav>
    <div className="nav-section-label"><span>Projects</span><button aria-label="Create project" onClick={() => setCreatingProject((value) => !value)}><Plus size={13} /></button></div>
    {creatingProject && <form className="project-create" onSubmit={(event) => { event.preventDefault(); const name = projectName.trim(); if (!name) return; void onCreateProject(name, projectContext.trim()).then(() => { setProjectName(''); setProjectContext(''); setCreatingProject(false) }) }}><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" maxLength={100} /><textarea value={projectContext} onChange={(event) => setProjectContext(event.target.value)} placeholder="Governed brief (optional)" maxLength={8000} rows={2} /><button type="submit">Create project</button></form>}
    {projects.map((project) => <button key={project.id} className={`project-row ${project.id === activeProjectId ? 'selected' : ''}`} onClick={() => onSelectProject(project.id)}><FolderKanban size={14} /> <span>{project.name}</span></button>)}
    {activeProject && <><div className="project-knowledge"><input ref={projectFileInput} type="file" className="file-input" multiple onChange={(event) => { const files = event.target.files; if (files) void attachKnowledgeFiles(files); event.currentTarget.value = '' }} /><input ref={projectFolderInput} type="file" className="file-input" multiple onChange={(event) => { const files = event.target.files; if (files) void attachKnowledgeFiles(files); event.currentTarget.value = '' }} /><div><strong>Project knowledge</strong><span>{activeProject.files?.length ?? 0}/12 reusable files</span></div><aside><button type="button" onClick={() => projectFileInput.current?.click()}>Attach</button><button type="button" onClick={() => projectFolderInput.current?.click()}>Folder</button></aside></div>{activeProject.files.length > 0 && <div className="project-file-list">{activeProject.files.map((file) => <div key={file.path}><span title={file.path}>{file.name}</span><aside><button type="button" title={`Edit ${file.name}`} aria-label={`Edit ${file.name} in project knowledge`} onClick={() => { setProjectFileError(''); setProjectFileVersions([]); setProjectFileHistoryOpen(false); void getProjectFile(activeProject.id, file.path).then((result) => setEditingProjectFile({ name: file.name, ...result })).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to open project knowledge')) }}><Pencil size={11} /></button><button type="button" title={`Remove ${file.name} from future task context`} aria-label={`Remove ${file.name} from project knowledge`} onClick={() => void onRemoveProjectFile(activeProject.id, file.path)}><X size={11} /></button></aside></div>)}</div>}{editingProjectFile && <form className="project-file-editor" onSubmit={(event) => { event.preventDefault(); setProjectFileError(''); void onUpdateProjectFile(activeProject.id, editingProjectFile.path, editingProjectFile.content, editingProjectFile.contentHash).then(() => setEditingProjectFile(undefined)).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to save project knowledge')) }}><header><strong>Edit {editingProjectFile.name}</strong><button type="button" onClick={() => setEditingProjectFile(undefined)} aria-label="Close project knowledge editor"><X size={11} /></button></header><textarea value={editingProjectFile.content} onChange={(event) => setEditingProjectFile((current) => current ? { ...current, content: event.target.value } : current)} maxLength={60000} rows={6} /><small>Text-only · changes apply to future tasks. Revisions are local to this project.</small>{projectFileError && <em>{projectFileError}</em>}<footer><button type="button" onClick={() => { const nextOpen = !projectFileHistoryOpen; setProjectFileHistoryOpen(nextOpen); if (nextOpen) void listProjectFileVersions(activeProject.id, editingProjectFile.path).then((result) => setProjectFileVersions(result.versions)).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to load revisions')) }}>History</button><button type="submit">Save knowledge</button></footer>{projectFileHistoryOpen && <div className="project-file-history">{projectFileVersions.length ? projectFileVersions.map((version) => <button type="button" key={version.id} onClick={() => { setProjectFileError(''); void onRestoreProjectFile(activeProject.id, editingProjectFile.path, version.id, editingProjectFile.contentHash).then((result) => { setEditingProjectFile((current) => current ? { ...current, ...result } : current); setProjectFileHistoryOpen(false) }).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to restore revision')) }}><span>Restore</span><small>{new Date(version.createdAt).toLocaleString()} · {Math.ceil(version.size / 1024)} KB</small></button>) : <p>No prior revisions.</p>}</div>}</form>}{projectFileError && !editingProjectFile && <p className="project-file-error">{projectFileError}</p>}<div className="project-brief"><button type="button" onClick={() => { setProjectContextDraft(activeProject.context); setEditingProjectContext((value) => !value) }}>{editingProjectContext ? 'Close brief' : 'Edit brief'}</button>{editingProjectContext && <form onSubmit={(event) => { event.preventDefault(); void onUpdateProjectContext(activeProject.id, projectContextDraft.trim()).then(() => setEditingProjectContext(false)) }}><textarea value={projectContextDraft} onChange={(event) => setProjectContextDraft(event.target.value)} maxLength={8000} rows={3} placeholder="Governed background for future tasks" /><button type="submit">Save brief</button></form>}</div></>}
    <div className="nav-section-label"><span>Conversations</span></div>
    <div className="task-list">
      {visibleConversations.length === 0 && <p className="empty-sidebar">{query ? 'No matching conversations.' : 'Your work will appear here.'}</p>}
      {groupedConversations.map((group) => (
        <div key={group.label} className="task-list-group">
          <div className="task-list-group-label">{group.label}</div>
          {group.items.map((conversation) => {
            const ModeIcon = modeIconFor(conversation.mode)
            return (
              <motion.button
                layout
                key={conversation.id}
                className={`task-row ${activeTaskId === conversation.id ? 'selected' : ''}`}
                onClick={() => onSelectTask(conversation.id)}
                title={`${conversationSourceLabel(conversation.provider)} · ${conversation.lastMessage?.preview ?? ''}`.trim()}
              >
                <span className={`task-status ${conversation.status}`} aria-hidden="true" />
                <span className="task-row-icon" aria-hidden="true"><ModeIcon size={13} /></span>
                <span className="task-row-body"><strong>{conversation.title}</strong>{conversation.lastMessage && <small>{conversation.lastMessage.role === 'user' ? 'You' : 'ONEVibe'} · {conversation.lastMessage.preview}</small>}
                  {(conversation.priority || (conversation.labels?.length ?? 0) > 0) && (
                    <span className="task-row-chips">
                      {conversation.priority && <span className="priority-chip" data-priority={conversation.priority}>{conversation.priority}</span>}
                      {conversation.labels?.map((label) => <span key={label} className="label-chip">{label}</span>)}
                    </span>
                  )}
                </span>
                <time className="task-row-time" dateTime={conversation.updatedAt}>{relativeShort(conversation.updatedAt, now)}</time>
              </motion.button>
            )
          })}
        </div>
      ))}
      {!query && hasMoreConversations && <button type="button" className="load-more-conversations" disabled={loadingMoreConversations} onClick={() => void onLoadMoreConversations()}>{loadingMoreConversations ? 'Loading…' : 'Load older conversations'}</button>}
    </div>
    <div className="sidebar-footer">
      <div className="user-row"><span className="avatar">{(user?.name?.trim() || user?.email || 'LO').slice(0, 2).toUpperCase()}</span><div><strong>{user?.name?.trim() || user?.email || 'Local operator'}</strong><span>{user ? 'Authenticated workspace' : 'Local workspace'}</span></div>{user && <button type="button" className="sidebar-signout" onClick={() => void onSignOut()}>Sign out</button>}</div>
    </div>
  </aside>
  )
}
