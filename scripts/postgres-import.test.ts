import { describe, expect, it } from 'vitest'
import { validateImportRelationships } from '../server/persistence/import-validation.js'
import type { Project, Task, TaskSchedule } from '../server/types.js'

const project = (id: string, ownerUserId: string, organizationId?: string) => ({ project: { id, ownerUserId, ...(organizationId ? { organizationId } : {}) } as Project, ownerUserId })
const task = (id: string, projectId: string, ownerUserId: string, organizationId?: string) => ({ task: { id, projectId, ownerUserId, ...(organizationId ? { organizationId } : {}) } as Task, ownerUserId })
const schedule = (id: string, projectId: string, ownerUserId: string) => ({ schedule: { id, projectId, ownerUserId } as TaskSchedule, ownerUserId })

describe('Postgres import ownership relationships', () => {
  it('accepts task and schedule references within the same owner scope', () => {
    expect(() => validateImportRelationships([project('project_a', 'user-a')], [task('task_a', 'project_a', 'user-a')], [schedule('schedule_a', 'project_a', 'user-a')])).not.toThrow()
  })

  it('rejects missing and cross-owner project references before import', () => {
    expect(() => validateImportRelationships([project('project_a', 'user-a')], [task('task_missing', 'project_missing', 'user-a')], [])).toThrow(/references missing project/)
    expect(() => validateImportRelationships([project('project_a', 'user-a')], [task('task_cross_owner', 'project_a', 'user-b')], [])).toThrow(/does not match project/)
    expect(() => validateImportRelationships([project('project_a', 'user-a')], [], [schedule('schedule_cross_owner', 'project_a', 'user-b')])).toThrow(/does not match project/)
  })

  it('rejects missing organizations and organization drift between projects and tasks', () => {
    expect(() => validateImportRelationships([project('project_org', 'user-a', 'org_a')], [], [], new Set(['org_b']))).toThrow(/references missing organization/)
    expect(() => validateImportRelationships([project('project_org', 'user-a', 'org_a')], [task('task_org_drift', 'project_org', 'user-a', 'org_b')], [], new Set(['org_a', 'org_b']))).toThrow(/organization does not match project/)
    expect(() => validateImportRelationships([project('project_org', 'user-a', 'org_a')], [task('task_org', 'project_org', 'user-a', 'org_a')], [], new Set(['org_a']))).not.toThrow()
  })
})
