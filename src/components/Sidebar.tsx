import { Blocks, Clock3, FolderKanban, Library, MonitorCog, Plus, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, Task } from '../types'
import { searchChat } from '../lib/api'
import { BrandMark } from './BrandMark'

type Props = {
  view: 'agent' | 'schedules' | 'skills' | 'library' | 'computers'
  tasks: Task[]
  activeTaskId: string | null
  onNewTask: () => void
  onSelectTask: (taskId: string) => void
  projects: Project[]
  activeProjectId: string
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string, context: string) => Promise<void>
  onAttachProjectFile: (projectId: string, file: { name: string; mimeType: string; dataBase64: string }) => Promise<void>
  onUpdateProjectContext: (projectId: string, context: string) => Promise<void>
  onOpenSkills: () => void
  onOpenLibrary: () => void
  onOpenSchedules: () => void
  onOpenComputers: () => void
}

export const Sidebar = ({ view, tasks, activeTaskId, onNewTask, onSelectTask, projects, activeProjectId, onSelectProject, onCreateProject, onAttachProjectFile, onUpdateProjectContext, onOpenSkills, onOpenLibrary, onOpenSchedules, onOpenComputers }: Props) => {
  const [query, setQuery] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [editingProjectContext, setEditingProjectContext] = useState(false)
  const [projectContextDraft, setProjectContextDraft] = useState('')
  const [matchedTaskIds, setMatchedTaskIds] = useState<Set<string>>(new Set())
  const projectFileInput = useRef<HTMLInputElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId)
  useEffect(() => {
    if (query.trim().length < 2) { setMatchedTaskIds(new Set()); return }
    const timer = window.setTimeout(() => { void searchChat(query).then((result) => setMatchedTaskIds(new Set(result.results.map((item) => item.taskId)))) }, 180)
    return () => window.clearTimeout(timer)
  }, [query])
  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return tasks
    return tasks.filter((task) => task.title.toLocaleLowerCase().includes(normalized) || matchedTaskIds.has(task.id))
  }, [matchedTaskIds, query, tasks])
  return (
  <aside className="sidebar">
    <div className="sidebar-top"><BrandMark /></div>
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
    {activeProject && <><div className="project-knowledge"><input ref={projectFileInput} type="file" className="file-input" onChange={(event) => { const file = event.target.files?.[0]; if (!file || file.size > 256 * 1024) return; const reader = new FileReader(); reader.onload = () => { const dataUrl = String(reader.result); void onAttachProjectFile(activeProject.id, { name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '' }) }; reader.readAsDataURL(file); event.currentTarget.value = '' }} /><div><strong>Project knowledge</strong><span>{activeProject.files?.length ?? 0}/12 reusable files</span></div><button type="button" onClick={() => projectFileInput.current?.click()}>Attach</button></div><div className="project-brief"><button type="button" onClick={() => { setProjectContextDraft(activeProject.context); setEditingProjectContext((value) => !value) }}>{editingProjectContext ? 'Close brief' : 'Edit brief'}</button>{editingProjectContext && <form onSubmit={(event) => { event.preventDefault(); void onUpdateProjectContext(activeProject.id, projectContextDraft.trim()).then(() => setEditingProjectContext(false)) }}><textarea value={projectContextDraft} onChange={(event) => setProjectContextDraft(event.target.value)} maxLength={8000} rows={3} placeholder="Governed background for future tasks" /><button type="submit">Save brief</button></form>}</div></>}
    <div className="nav-section-label"><span>Tasks</span><Settings2 size={13} /></div>
    <div className="task-list">
      {visibleTasks.length === 0 && <p className="empty-sidebar">{query ? 'No matching conversations.' : 'Your work will appear here.'}</p>}
      {visibleTasks.map((task) => (
        <motion.button
          layout
          key={task.id}
          className={`task-row ${activeTaskId === task.id ? 'selected' : ''}`}
          onClick={() => onSelectTask(task.id)}
        >
          <span className={`task-status ${task.status}`} />
          <span>{task.title}</span>
        </motion.button>
      ))}
    </div>
    <div className="sidebar-footer">
      <div className="trust-card"><ShieldCheck size={17} /><div><strong>OpenVTC protected</strong><span>External approvals enabled</span></div></div>
      <div className="user-row"><span className="avatar">TT</span><div><strong>Terence</strong><span>Local workspace</span></div><Settings2 size={15} /></div>
    </div>
  </aside>
  )
}
