import { Download, FileCode2, FileText, FolderOpen, Image, Link, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getFileExcerpt } from '../lib/api'
import { categoryOf, filterArtifactEntries, type ArtifactEntry, type FileCategory } from '../lib/artefacts'
import { t, type I18nKey, type Locale } from '../lib/i18n'
import type { LibraryItem } from '../types'
import { HighlightedCode } from './HighlightedCode'

const fileIcon = (path: string, size = 14) => {
  const cat = categoryOf(path)
  if (cat === 'images') return <Image size={size} />
  if (cat === 'documents') return <FileText size={size} />
  if (cat === 'links') return <Link size={size} />
  return <FileCode2 size={size} />
}

const readableBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const categoryLabelKey: Record<FileCategory, I18nKey> = {
  all: 'artefactFilterAll',
  documents: 'artefactFilterDocuments',
  images: 'artefactFilterImages',
  code: 'artefactFilterCode',
  links: 'artefactFilterLinks',
}

const rawFileUrl = (taskId: string, path: string) => `/api/tasks/${taskId}/file?path=${encodeURIComponent(path)}&raw=1`
const downloadFileUrl = (taskId: string, path: string) => `/api/tasks/${taskId}/file?path=${encodeURIComponent(path)}&download=1`

const IconTile = ({ path }: { path: string }) => <span className="artefact-thumb-icon">{fileIcon(path, 20)}</span>

const ArtImage = ({ taskId, path }: { taskId: string; path: string }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return <IconTile path={path} />
  return <img src={rawFileUrl(taskId, path)} alt="" loading="lazy" onError={() => setFailed(true)} />
}

const CodeThumb = ({ taskId, path }: { taskId: string; path: string }) => {
  const [content, setContent] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getFileExcerpt(taskId, path)
      .then((excerpt) => { if (!cancelled) setContent(excerpt.content) })
      .catch(() => { /* excerpt unavailable — the icon tile stays */ })
    return () => { cancelled = true }
  }, [taskId, path])
  if (!content) return <IconTile path={path} />
  return <div className="artefact-thumb-snippet"><HighlightedCode content={content.split('\n').slice(0, 8).join('\n')} /></div>
}

const Thumb = ({ taskId, path }: { taskId: string; path: string }) => {
  const cat = categoryOf(path)
  if (cat === 'images') return <ArtImage taskId={taskId} path={path} />
  if (cat === 'code') return <CodeThumb taskId={taskId} path={path} />
  return <IconTile path={path} />
}

type Props = { items: LibraryItem[]; onOpenTask: (taskId: string) => void; locale?: Locale }

export const Artefacts = ({ items, onOpenTask, locale = 'en' }: Props) => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FileCategory>('all')

  const entries = useMemo<ArtifactEntry[]>(() =>
    items.flatMap(({ task, files, versionCount }) => files.map((file) => ({ file, task, versionCount: versionCount ?? 1 }))),
    [items])

  const filtered = useMemo(() => filterArtifactEntries(entries, query, category), [entries, query, category])

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
          <span className="view-eyebrow">{t('artefactsEyebrow', locale)}</span>
          <h1>{t('artefactsTitle', locale)}</h1>
          <p>{t('artefactsIntro', locale)}</p>
        </div>
        <FolderOpen size={28} />
      </header>
      <div className="library-empty">
        <FolderOpen size={22} />
        <strong>{t('artefactsEmpty', locale)}</strong>
      </div>
    </section>
  }

  return <section className="artefacts-view">
    <header>
      <div>
        <span className="view-eyebrow">{t('artefactsEyebrow', locale)}</span>
        <h1>{t('artefactsTitle', locale)}</h1>
        <p>{t('artefactsIntro', locale)}</p>
      </div>
      <FolderOpen size={28} />
    </header>
    <div className="library-retrieval">
      <label>
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('artefactsSearchPlaceholder', locale)}
          aria-label={t('artefactsSearchLabel', locale)}
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t('artefactsClearSearch', locale)}><X size={13} /></button>}
      </label>
      <div>
        {(['all', 'documents', 'images', 'code', 'links'] as const).map((cat) => {
          const count = cat === 'all' ? entries.length : (counts[cat] ?? 0)
          if (cat !== 'all' && count === 0) return null
          return <button
            key={cat}
            type="button"
            className={category === cat ? 'active' : ''}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >{t(categoryLabelKey[cat], locale)} {count}</button>
        })}
      </div>
    </div>
    {!filtered.length
      ? <div className="library-empty library-no-results">
          <Search size={22} />
          <strong>{t('artefactsNoMatch', locale)}</strong>
          <span>{t('artefactsNoMatchHint', locale)}</span>
        </div>
      : <div className="artefacts-gallery">
          {filtered.map(({ file, task, versionCount }) => {
            const filename = file.path.split('/').pop() ?? file.path
            return <article key={`${task.id}:${file.path}`} className="artefact-gallery-card">
              <button
                type="button"
                className="artefact-gallery-open"
                onClick={() => onOpenTask(task.id)}
                aria-label={`${t('openTask', locale)}: ${task.title}`}
              >
                <div className="artefact-thumb"><Thumb taskId={task.id} path={file.path} /></div>
                <div className="artefact-gallery-info">
                  <span className="artefact-gallery-title">{fileIcon(file.path)} {filename}</span>
                  <span className="artefact-gallery-task">{task.title}</span>
                  <span className="artefact-gallery-date">
                    {new Date(file.updatedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')} · {readableBytes(file.size)}
                  </span>
                </div>
              </button>
              {versionCount > 1 && <span className="artefact-version-badge" aria-label={`${t('version', locale)} ${versionCount}`}>v{versionCount}</span>}
              <a
                className="artefact-gallery-download"
                href={downloadFileUrl(task.id, file.path)}
                download={filename}
                aria-label={`${t('download', locale)} ${filename}`}
              ><Download size={13} /></a>
            </article>
          })}
        </div>}
  </section>
}
