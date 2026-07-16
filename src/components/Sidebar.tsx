import { Blocks, Clock3, FolderKanban, Library, MonitorCog, Pencil, Plus, Search, Settings2, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationSummary, Project, ProjectFileVersion } from '../types'
import { getProjectFile, listConversations, listProjectFileVersions } from '../lib/api'
import { BrandMark } from './BrandMark'

type Props = {
  view: 'agent' | 'schedules' | 'skills' | 'library' | 'computers'
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
}

const conversationSourceLabel = (provider: ConversationSummary['provider']) => provider === 'demo'
  ? 'Simulation · no model call'
  : provider === 'claude_sdk'
    ? 'Claude Agent SDK'
    : provider === 'onecomputer'
      ? 'ONEComputer sandbox'
      : 'Remote runtime'

export const Sidebar = ({ view, conversations, activeTaskId, onNewTask, onClose, onSelectTask, hasMoreConversations, loadingMoreConversations, onLoadMoreConversations, projects, activeProjectId, onSelectProject, onCreateProject, onAttachProjectFile, onRemoveProjectFile, onUpdateProjectFile, onRestoreProjectFile, onUpdateProjectContext, onOpenSkills, onOpenLibrary, onOpenSchedules, onOpenComputers }: Props) => {
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
  return (
  <aside className="sidebar">
    <div className="sidebar-top"><BrandMark /><button type="button" className="sidebar-close" aria-label="Close sidebar" onClick={onClose}><X size={15} /></button></div>
    <button className="new-task" onClick={onNewTask}><Plus size={16} /> New task <kbd>⌘ K</kbd></button>
    <label className="history-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
    <nav className="primary-nav" aria-label="Primary">
      <button className={`nav-item ${view === 'agent' ? 'active' : ''}`} onClick={onNewTask}><Sparkles size={16} /> Agent</button>
      <button className={`nav-item ${view === 'skills' ? 'active' : ''}`} onClick={onOpenSkills}><Blocks size={16} /> Skills <span className="nav-pill">8</span></button>
      <button className={`nav-item ${view === 'schedules' ? 'active' : ''}`} onClick={onOpenSchedules}><Clock3 size={16} /> Scheduled</button>
      <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={onOpenLibrary}><Library size={16} /> Library</button>
      <button className={`nav-item ${view === 'computers' ? 'active' : ''}`} onClick={onOpenComputers}><MonitorCog size={16} /> Computers</button>
    </nav>
    <div className="nav-section-label"><span>Projects</span><button aria-label="Create project" onClick={() => setCreatingProject((value) => !value)}><Plus size={13} /></button></div>
    {creatingProject && <form className="project-create" onSubmit={(event) => { event.preventDefault(); const name = projectName.trim(); if (!name) return; void onCreateProject(name, projectContext.trim()).then(() => { setProjectName(''); setProjectContext(''); setCreatingProject(false) }) }}><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" maxLength={100} /><textarea value={projectContext} onChange={(event) => setProjectContext(event.target.value)} placeholder="Governed brief (optional)" maxLength={8000} rows={2} /><button type="submit">Create project</button></form>}
    {projects.map((project) => <button key={project.id} className={`project-row ${project.id === activeProjectId ? 'selected' : ''}`} onClick={() => onSelectProject(project.id)}><FolderKanban size={14} /> <span>{project.name}</span></button>)}
    {activeProject && <><div className="project-knowledge"><input ref={projectFileInput} type="file" className="file-input" multiple onChange={(event) => { const files = event.target.files; if (files) void attachKnowledgeFiles(files); event.currentTarget.value = '' }} /><input ref={projectFolderInput} type="file" className="file-input" multiple onChange={(event) => { const files = event.target.files; if (files) void attachKnowledgeFiles(files); event.currentTarget.value = '' }} /><div><strong>Project knowledge</strong><span>{activeProject.files?.length ?? 0}/12 reusable files</span></div><aside><button type="button" onClick={() => projectFileInput.current?.click()}>Attach</button><button type="button" onClick={() => projectFolderInput.current?.click()}>Folder</button></aside></div>{activeProject.files.length > 0 && <div className="project-file-list">{activeProject.files.map((file) => <div key={file.path}><span title={file.path}>{file.name}</span><aside><button type="button" title={`Edit ${file.name}`} aria-label={`Edit ${file.name} in project knowledge`} onClick={() => { setProjectFileError(''); setProjectFileVersions([]); setProjectFileHistoryOpen(false); void getProjectFile(activeProject.id, file.path).then((result) => setEditingProjectFile({ name: file.name, ...result })).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to open project knowledge')) }}><Pencil size={11} /></button><button type="button" title={`Remove ${file.name} from future task context`} aria-label={`Remove ${file.name} from project knowledge`} onClick={() => void onRemoveProjectFile(activeProject.id, file.path)}><X size={11} /></button></aside></div>)}</div>}{editingProjectFile && <form className="project-file-editor" onSubmit={(event) => { event.preventDefault(); setProjectFileError(''); void onUpdateProjectFile(activeProject.id, editingProjectFile.path, editingProjectFile.content, editingProjectFile.contentHash).then(() => setEditingProjectFile(undefined)).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to save project knowledge')) }}><header><strong>Edit {editingProjectFile.name}</strong><button type="button" onClick={() => setEditingProjectFile(undefined)} aria-label="Close project knowledge editor"><X size={11} /></button></header><textarea value={editingProjectFile.content} onChange={(event) => setEditingProjectFile((current) => current ? { ...current, content: event.target.value } : current)} maxLength={60000} rows={6} /><small>Text-only · changes apply to future tasks. Revisions are local to this project.</small>{projectFileError && <em>{projectFileError}</em>}<footer><button type="button" onClick={() => { const nextOpen = !projectFileHistoryOpen; setProjectFileHistoryOpen(nextOpen); if (nextOpen) void listProjectFileVersions(activeProject.id, editingProjectFile.path).then((result) => setProjectFileVersions(result.versions)).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to load revisions')) }}>History</button><button type="submit">Save knowledge</button></footer>{projectFileHistoryOpen && <div className="project-file-history">{projectFileVersions.length ? projectFileVersions.map((version) => <button type="button" key={version.id} onClick={() => { setProjectFileError(''); void onRestoreProjectFile(activeProject.id, editingProjectFile.path, version.id, editingProjectFile.contentHash).then((result) => { setEditingProjectFile((current) => current ? { ...current, ...result } : current); setProjectFileHistoryOpen(false) }).catch((error: unknown) => setProjectFileError(error instanceof Error ? error.message : 'Unable to restore revision')) }}><span>Restore</span><small>{new Date(version.createdAt).toLocaleString()} · {Math.ceil(version.size / 1024)} KB</small></button>) : <p>No prior revisions.</p>}</div>}</form>}{projectFileError && !editingProjectFile && <p className="project-file-error">{projectFileError}</p>}<div className="project-brief"><button type="button" onClick={() => { setProjectContextDraft(activeProject.context); setEditingProjectContext((value) => !value) }}>{editingProjectContext ? 'Close brief' : 'Edit brief'}</button>{editingProjectContext && <form onSubmit={(event) => { event.preventDefault(); void onUpdateProjectContext(activeProject.id, projectContextDraft.trim()).then(() => setEditingProjectContext(false)) }}><textarea value={projectContextDraft} onChange={(event) => setProjectContextDraft(event.target.value)} maxLength={8000} rows={3} placeholder="Governed background for future tasks" /><button type="submit">Save brief</button></form>}</div></>}
    <div className="nav-section-label"><span>Conversations</span><Settings2 size={13} /></div>
    <div className="task-list">
      {visibleConversations.length === 0 && <p className="empty-sidebar">{query ? 'No matching conversations.' : 'Your work will appear here.'}</p>}
      {visibleConversations.map((conversation) => (
        <motion.button
          layout
          key={conversation.id}
          className={`task-row ${activeTaskId === conversation.id ? 'selected' : ''}`}
          onClick={() => onSelectTask(conversation.id)}
        >
          <span className={`task-status ${conversation.status}`} />
          <span><strong>{conversation.title}</strong>{conversation.lastMessage && <small>{conversationSourceLabel(conversation.provider)} · {conversation.lastMessage.role === 'user' ? 'You' : 'ONEVibe'} · {conversation.lastMessage.preview}</small>}</span>
        </motion.button>
      ))}
      {!query && hasMoreConversations && <button type="button" className="load-more-conversations" disabled={loadingMoreConversations} onClick={() => void onLoadMoreConversations()}>{loadingMoreConversations ? 'Loading…' : 'Load older conversations'}</button>}
    </div>
    <div className="sidebar-footer">
      <div className="user-row"><span className="avatar">TT</span><div><strong>Terence</strong><span>Local workspace</span></div><Settings2 size={15} /></div>
    </div>
  </aside>
  )
}
