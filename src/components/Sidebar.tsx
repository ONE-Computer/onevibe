import { Blocks, Clock3, FolderKanban, Library, Plus, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Task } from '../types'
import { BrandMark } from './BrandMark'

type Props = {
  tasks: Task[]
  activeTaskId: string | null
  onNewTask: () => void
  onSelectTask: (taskId: string) => void
}

export const Sidebar = ({ tasks, activeTaskId, onNewTask, onSelectTask }: Props) => (
  <aside className="sidebar">
    <div className="sidebar-top"><BrandMark /></div>
    <button className="new-task" onClick={onNewTask}><Plus size={16} /> New task <kbd>⌘ K</kbd></button>
    <nav className="primary-nav" aria-label="Primary">
      <button className="nav-item active"><Sparkles size={16} /> Agent</button>
      <button className="nav-item"><Blocks size={16} /> Skills <span className="nav-pill">12</span></button>
      <button className="nav-item"><Clock3 size={16} /> Scheduled</button>
      <button className="nav-item"><Library size={16} /> Library</button>
    </nav>
    <div className="nav-section-label"><span>Projects</span><Plus size={13} /></div>
    <button className="project-row"><FolderKanban size={14} /> ONEVibe product</button>
    <div className="nav-section-label"><span>Tasks</span><Settings2 size={13} /></div>
    <div className="task-list">
      {tasks.length === 0 && <p className="empty-sidebar">Your work will appear here.</p>}
      {tasks.map((task) => (
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
