import { Box, ExternalLink, FileCode2, FolderOpen, LibraryBig } from 'lucide-react'
import { motion } from 'framer-motion'
import type { LibraryItem, Project } from '../types'

type Props = { items: LibraryItem[]; projects: Project[]; onOpenTask: (taskId: string) => void }

const typeLabel = (mode: LibraryItem['task']['mode']) => mode === 'data' ? 'Data story' : mode === 'app' ? 'App' : mode[0]!.toUpperCase() + mode.slice(1)

export const Library = ({ items, projects, onOpenTask }: Props) => <section className="library-view">
  <header><div><span className="task-kicker">Reusable governed outputs</span><h1>Library</h1><p>Completed artifacts across projects. Reopen the originating task to inspect the conversation, evidence chain, source, and any approval history.</p></div><LibraryBig size={28} /></header>
  {!items.length ? <div className="library-empty"><Box size={22} /><strong>No completed artifacts yet</strong><span>Finished work will appear here with its original task and evidence trail.</span></div> : <div className="library-grid">{items.map(({ task, files }) => <motion.article layout key={task.id}><div className="library-card-top"><span>{typeLabel(task.mode)}</span><time>{new Date(task.updatedAt).toLocaleDateString()}</time></div><h2>{task.title}</h2><p>{projects.find((project) => project.id === task.projectId)?.name ?? 'Project workspace'}</p><div className="library-files"><FolderOpen size={13} /> {files.length} artifact{files.length === 1 ? '' : 's'}{files.slice(0, 2).map((file) => <small key={file.path}><FileCode2 size={11} /> {file.path}</small>)}</div><button aria-label={`Open ${task.title}`} onClick={() => onOpenTask(task.id)}>Open governed task <ExternalLink size={13} /></button></motion.article>)}</div>}
</section>
