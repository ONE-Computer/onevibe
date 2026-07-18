import { Download, FileCode2, FileText, FolderOpen, Image, Link, Search, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { LibraryItem, WorkspaceFile } from '../types'

type ArtifactEntry = { file: WorkspaceFile; task: LibraryItem['task'] }

type FileCategory = 'all' | 'documents' | 'images' | 'code' | 'links'

const extOf = (path: string) => path.split('.').pop()?.toLowerCase() ?? ''

const categoryOf = (path: string): Exclude<FileCategory, 'all'> => {
  const ext = extOf(path)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'images'
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'csv', 'json', 'yaml', 'yml'].includes(ext)) return 'documents'
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'sh', 'css', 'html', 'sql'].includes(ext)) return 'code'
  if (['html', 'url'].includes(ext) || path.startsWith('http')) return 'links'
  return 'code'
}

const fileIcon = (path: string) => {
  const cat = categoryOf(path)
  if (cat === 'images') return <Image size={14} />
  if (cat === 'documents') return <FileText size={14} />
  if (cat === 'links') return <Link size={14} />
  return <FileCode2 size={14} />
}

const readableBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const categoryLabels: Record<FileCategory, string> = {
  all: 'All',
  documents: 'Documents',
  images: 'Images',
  code: 'Code',
  links: 'Links',
}

type Props = { items: LibraryItem[]; onOpenTask: (taskId: string) => void }

export const Artefacts = ({ items, onOpenTask }: Props) => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FileCategory>('all')

  const entries = useMemo<ArtifactEntry[]>(() =>
    items.flatMap(({ task, files }) => files.map((file) => ({ file, task }))),
    [items])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter(({ file, task }) => {
      if (category !== 'all' && categoryOf(file.path) !== category) return false
      if (!needle) return true
      return file.path.toLowerCase().includes(needle) || task.title.toLowerCase().includes(needle)
    })
  }, [entries, query, category])

  const counts = useMemo(() => {
    const tally: Partial<Record<FileCategory, number>> = {}
    for (const { file } of entries) {
      const cat = categoryOf(file.path)
      tally[cat] = (tally[cat] ?? 0) + 1
    }
    return tally
  }, [entries])

  if (!items.length || !entries.length) {
    return <section className="artefacts-view">
      <header>
        <div>
          <span className="task-kicker">Output files</span>
          <h1>Artefacts</h1>
          <p>Files and documents produced by completed tasks, collected in one place.</p>
        </div>
        <FolderOpen size={28} />
      </header>
      <div className="library-empty">
        <FolderOpen size={22} />
        <strong>No artefacts yet</strong>
        <span>Files produced by completed tasks will appear here.</span>
      </div>
    </section>
  }

  return <section className="artefacts-view">
    <header>
      <div>
        <span className="task-kicker">Output files</span>
        <h1>Artefacts</h1>
        <p>Files and documents produced by completed tasks, collected in one place.</p>
      </div>
      <FolderOpen size={28} />
    </header>
    <div className="library-retrieval">
      <label>
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename or task name"
          aria-label="Search artefacts"
        />
        {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
      </label>
      <div>
        {(['all', 'documents', 'images', 'code', 'links'] as const).map((cat) => {
          const count = cat === 'all' ? entries.length : (counts[cat] ?? 0)
          if (cat !== 'all' && count === 0) return null
          return <button
            key={cat}
            className={category === cat ? 'active' : ''}
            onClick={() => setCategory(cat)}
          >{categoryLabels[cat]} {count}</button>
        })}
      </div>
    </div>
    {!filtered.length
      ? <div className="library-empty library-no-results">
          <Search size={22} />
          <strong>No matching artefacts</strong>
          <span>Try a different filename or task name.</span>
        </div>
      : <div className="artefacts-grid">
          {filtered.map(({ file, task }) => <motion.article layout key={`${task.id}:${file.path}`} className="artefact-card">
            <div className="artefact-icon">{fileIcon(file.path)}</div>
            <div className="artefact-info">
              <span className="artefact-filename">{file.path.split('/').pop()}</span>
              <span className="artefact-path" title={file.path}>{file.path}</span>
              <span className="artefact-meta">{readableBytes(file.size)} · <button className="artefact-task-link" onClick={() => onOpenTask(task.id)}>{task.title}</button></span>
            </div>
            <div className="artefact-actions">
              <a
                href={`/api/tasks/${task.id}/file?path=${encodeURIComponent(file.path)}&download=1`}
                download={file.path.split('/').pop()}
                aria-label={`Download ${file.path}`}
                className="artefact-download"
              ><Download size={14} /></a>
            </div>
          </motion.article>)}
        </div>}
  </section>
}
