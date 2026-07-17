import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TaskStore } from './store.js'

const record = {
  id: 'meeting-brief', version: 1, title: 'Meeting brief', summary: 'Evidence-aware brief',
  sha256: 'a'.repeat(64), content: '---\nname: meeting-brief\n---\n# Brief\n',
  contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/meeting-brief/SKILL.md',
  sourceUrl: 'https://github.com/ONE-Computer/onevibe/blob/main/skills/meeting-brief/SKILL.md',
}

describe('skill installation persistence', () => {
  it('persists owner-scoped marketplace content across reopen', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-skill-install-'))
    try {
      const store = new TaskStore(root)
      await store.initialize()
      await store.installSkillInstallation(record, 'user_a')
      await store.installSkillInstallation({ ...record, id: 'other-skill', title: 'Other' }, 'user_b')
      expect((await store.listSkillInstallations('user_a')).map((skill) => skill.id)).toEqual(['meeting-brief'])
      expect((await store.listSkillInstallations('user_b')).map((skill) => skill.id)).toEqual(['other-skill'])
      const reopened = new TaskStore(root)
      await reopened.initialize()
      expect((await reopened.listSkillInstallationRecords('user_a'))[0]?.content).toContain('name: meeting-brief')
      expect(await reopened.listSkillInstallations('user_b')).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prevents removing a marketplace skill used by an active task', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-skill-active-'))
    try {
      const store = new TaskStore(root)
      await store.initialize()
      await store.installSkillInstallation(record, 'user_a')
      const project = await store.createProject('Private project', '', 'user_a')
      const task = await store.createTask('Use the installed guide', 'demo', 'chat', project.id, undefined, [], [], ['meeting-brief'], 'user_a')
      await expect(store.removeSkillInstallation('meeting-brief', 'user_a')).rejects.toThrow(/active task/)
      await store.updateTask(task.id, { status: 'running' })
      await expect(store.removeSkillInstallation('meeting-brief', 'user_a')).rejects.toThrow(/active task/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
