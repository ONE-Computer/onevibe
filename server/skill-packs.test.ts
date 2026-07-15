import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { materializeTaskSkills, skillPackManifestFor } from './skill-packs.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('versioned task skill packs', () => {
  it('pins a stable manifest and materializes only selected packs into the task workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-skills-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build an executive update', 'claude_sdk', 'slides', 'project_onevibe', undefined, [], [], ['slides', 'security_review'])

    const manifest = skillPackManifestFor(task.skills)
    expect(manifest).toHaveLength(2)
    expect(manifest.every((skill) => skill.version === 1 && /^[a-f0-9]{64}$/.test(skill.sha256))).toBe(true)
    await materializeTaskSkills(task, store)
    await expect(store.readWorkspaceFile(task.id, '.claude/skills/slides/SKILL.md')).resolves.toContain('Executive slide narrative')
    await expect(store.readWorkspaceFile(task.id, '.claude/skills/security_review/SKILL.md')).resolves.toContain('Security and trust review')
    await expect(store.readWorkspaceFile(task.id, '.claude/skills/research/SKILL.md')).rejects.toThrow()
  })
})
