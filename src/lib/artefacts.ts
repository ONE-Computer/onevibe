import type { Task, WorkspaceFile } from '../types'

export type FileCategory = 'all' | 'documents' | 'images' | 'code' | 'links'
export type ArtifactEntry = { file: WorkspaceFile; task: Task; versionCount: number }

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'md', 'markdown', 'txt', 'rtf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'odt', 'epub'])
const LINK_EXTENSIONS = new Set(['url', 'webloc', 'uri'])

const extensionOf = (path: string): string => {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const categoryOf = (path: string): Exclude<FileCategory, 'all'> => {
  if (/^https?:\/\//i.test(path)) return 'links'
  const extension = extensionOf(path)
  if (IMAGE_EXTENSIONS.has(extension)) return 'images'
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'documents'
  if (LINK_EXTENSIONS.has(extension)) return 'links'
  return 'code'
}

export const filterArtifactEntries = (entries: readonly ArtifactEntry[], query: string, category: FileCategory): ArtifactEntry[] => {
  const normalized = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (category !== 'all' && categoryOf(entry.file.path) !== category) return false
    if (!normalized) return true
    return entry.file.path.toLowerCase().includes(normalized) || entry.task.title.toLowerCase().includes(normalized)
  })
}
