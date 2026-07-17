import path from 'node:path'

export const normalizeWorkspacePath = (artifactPath: string) => path.posix.normalize(artifactPath.replaceAll('\\', '/'))

export const isPrivateWorkspacePath = (artifactPath: string) => {
  const normalized = normalizeWorkspacePath(artifactPath)
  return normalized === 'inputs' || normalized.startsWith('inputs/') || normalized === 'evidence' || normalized.startsWith('evidence/')
}

export const isInternalWorkspacePath = (artifactPath: string) => {
  const normalized = normalizeWorkspacePath(artifactPath)
  return normalized.startsWith('.claude/') || normalized.startsWith('.claude-state/') || normalized.startsWith('.onevibe-') || normalized === '.onevibe' || normalized.startsWith('node_modules/') || normalized.includes('/node_modules/')
}

export const portableArtifactKind = (artifactPath: string) => {
  const normalized = normalizeWorkspacePath(artifactPath)
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return undefined
  if (isPrivateWorkspacePath(normalized) || isInternalWorkspacePath(normalized)) return undefined
  if (/\.(?:pptx|pdf)$/i.test(normalized)) return 'slide_deck'
  return 'source_file'
}
