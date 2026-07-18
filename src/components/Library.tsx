import { Box, ExternalLink, FileCode2, FolderOpen, LibraryBig, Search, Trash2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { LibraryItem, Project } from '../types'

type Props = { items: LibraryItem[]; projects: Project[]; onOpenTask: (taskId: string) => void; onRemove: (task: LibraryItem['task']) => Promise<void> }

const typeLabel = (mode: LibraryItem['task']['mode']) => mode === 'data' ? 'Data story' : mode === 'app' ? 'App' : mode[0]!.toUpperCase() + mode.slice(1)

export const Library = ({ items, projects, onOpenTask, onRemove }: Props) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'all' | LibraryItem['task']['mode']>('all')
  const [tag, setTag] = useState('all')
  const modes = [...new Set(items.map((item) => item.task.mode))]
  const tags = [...new Set(items.flatMap((item) => item.task.tags))].sort()
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter(({ task, files }) => {
      if (mode !== 'all' && task.mode !== mode) return false
      if (tag !== 'all' && !task.tags.includes(tag)) return false
      if (!needle) return true
      const project = projects.find((candidate) => candidate.id === task.projectId)?.name ?? ''
      return [task.title, task.mode, project, ...task.tags, ...files.map((file) => file.path)].some((value) => value.toLowerCase().includes(needle))
    })
  }, [items, mode, projects, query, tag])
  return <section className="library-view">
    <header><div><span className="view-eyebrow">Your artifacts</span><h1>Library</h1><p>Completed artifacts across projects. Reopen the originating task to inspect the conversation, evidence chain, source, and any approval history.</p></div><LibraryBig size={28} /></header>
    {!items.length ? <div className="library-empty"><Box size={22} /><strong>No completed artifacts yet</strong><span>Finished work will appear here with its original task and evidence trail.</span></div> : <><div className="library-retrieval"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, project, tag, mode, or artifact path" aria-label="Search library artifacts" />{query && <button onClick={() => setQuery('')} aria-label="Clear library search"><X size={13} /></button>}</label><div>{(['all', ...modes] as const).map((candidate) => <button key={candidate} className={mode === candidate ? 'active' : ''} onClick={() => setMode(candidate)}>{candidate === 'all' ? `All ${items.length}` : typeLabel(candidate)}</button>)}</div>{tags.length > 0 && <div className="library-tag-filter">{(['all', ...tags] as const).map((candidate) => <button key={candidate} className={tag === candidate ? 'active' : ''} onClick={() => setTag(candidate)}>{candidate === 'all' ? 'All tags' : candidate}</button>)}</div>}</div>{!filtered.length ? <div className="library-empty library-no-results"><Search size={22} /><strong>No matching artifacts</strong><span>Try a different task name, project, tag, mode, or file path.</span></div> : <div className="library-grid">{filtered.map(({ task, files }) => <motion.article layout key={task.id}><div className="library-card-top"><span>{typeLabel(task.mode)}</span><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleDateString()}</time></div><h2>{task.title}</h2><p>{projects.find((project) => project.id === task.projectId)?.name ?? 'Project workspace'}</p>{task.tags.length > 0 && <div className="library-card-tags">{task.tags.map((item) => <span key={item}>{item}</span>)}</div>}<div className="library-files"><FolderOpen size={13} /> {files.length} artifact{files.length === 1 ? '' : 's'}{files.slice(0, 2).map((file) => <small key={file.path}><FileCode2 size={11} /> {file.path}</small>)}</div><footer><button aria-label={`Open ${task.title}`} onClick={() => onOpenTask(task.id)}>Open task <ExternalLink size={13} /></button><button aria-label={`Remove ${task.title} from Library`} title="Remove from Library (conversation retained)" onClick={() => void onRemove(task)}><Trash2 size={13} /></button></footer></motion.article>)}</div>}</>}
  </section>
}
