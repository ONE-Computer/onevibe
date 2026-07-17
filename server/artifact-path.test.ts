import { describe, expect, it } from 'vitest'
import { isInternalWorkspacePath, isPrivateWorkspacePath, normalizeWorkspacePath, portableArtifactKind } from './artifact-path.js'

describe('workspace artifact visibility', () => {
  it('normalizes separators and classifies private paths before export', () => {
    expect(normalizeWorkspacePath('inputs\\brief.txt')).toBe('inputs/brief.txt')
    expect(isPrivateWorkspacePath('inputs\\brief.txt')).toBe(true)
    expect(isPrivateWorkspacePath('evidence/visual/frame.png')).toBe(true)
    expect(isInternalWorkspacePath('.claude-state/journal.json')).toBe(true)
    expect(portableArtifactKind('inputs/brief.txt')).toBeUndefined()
    expect(portableArtifactKind('evidence/visual/frame.png')).toBeUndefined()
    expect(portableArtifactKind('src/index.ts')).toBe('source_file')
  })

  it('does not turn traversal-like paths into portable artifacts', () => {
    expect(portableArtifactKind('../secret.txt')).toBeUndefined()
    expect(portableArtifactKind('/absolute/secret.txt')).toBeUndefined()
    expect(portableArtifactKind('inputs/../secret.txt')).toBe('source_file')
  })
})
