import path from 'node:path'

export const isInternalWorkspacePath = (artifactPath: string) => {
  const normalized = path.posix.normalize(artifactPath)
  return normalized.startsWith('.claude/') || normalized.startsWith('.claude-state/') || normalized.startsWith('.onevibe-') || normalized === '.onevibe' || normalized.startsWith('node_modules/') || normalized.includes('/node_modules/')
}

export const portableArtifactKind = (artifactPath: string) => {
  const normalized = path.posix.normalize(artifactPath)
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return undefined
  if (normalized.startsWith('inputs/') || normalized.startsWith('evidence/') || isInternalWorkspacePath(normalized)) return undefined
  if (/\.(?:pptx|pdf)$/i.test(normalized)) return 'slide_deck'
  return 'source_file'
}
