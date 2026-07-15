import { Blocks, Clock3, FolderKanban, Library, Plus, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { Project, Task } from '../types'
import { searchChat } from '../lib/api'
import { BrandMark } from './BrandMark'

type Props = {
  tasks: Task[]
  activeTaskId: string | null
  onNewTask: () => void
  onSelectTask: (taskId: string) => void
  projects: Project[]
  activeProjectId: string
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string, context: string) => Promise<void>
}

export const Sidebar = ({ tasks, activeTaskId, onNewTask, onSelectTask, projects, activeProjectId, onSelectProject, onCreateProject }: Props) => {
  const [query, setQuery] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [matchedTaskIds, setMatchedTaskIds] = useState<Set<string>>(new Set())
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
      <button className="nav-item active"><Sparkles size={16} /> Agent</button>
      <button className="nav-item"><Blocks size={16} /> Skills <span className="nav-pill">12</span></button>
      <button className="nav-item"><Clock3 size={16} /> Scheduled</button>
      <button className="nav-item"><Library size={16} /> Library</button>
    </nav>
    <div className="nav-section-label"><span>Projects</span><button aria-label="Create project" onClick={() => setCreatingProject((value) => !value)}><Plus size={13} /></button></div>
    {creatingProject && <form className="project-create" onSubmit={(event) => { event.preventDefault(); const name = projectName.trim(); if (!name) return; void onCreateProject(name, projectContext.trim()).then(() => { setProjectName(''); setProjectContext(''); setCreatingProject(false) }) }}><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" maxLength={100} /><textarea value={projectContext} onChange={(event) => setProjectContext(event.target.value)} placeholder="Governed brief (optional)" maxLength={8000} rows={2} /><button type="submit">Create project</button></form>}
    {projects.map((project) => <button key={project.id} className={`project-row ${project.id === activeProjectId ? 'selected' : ''}`} onClick={() => onSelectProject(project.id)}><FolderKanban size={14} /> <span>{project.name}</span></button>)}
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
