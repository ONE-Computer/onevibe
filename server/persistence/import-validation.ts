import type { Project, Task, TaskSchedule } from '../types.js'

export type OwnedProjectRow = { project: Project; ownerUserId: string }
export type OwnedTaskRow = { task: Task; ownerUserId: string }
export type OwnedScheduleRow = { schedule: TaskSchedule; ownerUserId: string }

/** Reject relational ownership drift before opening a Postgres transaction. */
export const validateImportRelationships = (
  projectRows: readonly OwnedProjectRow[],
  taskRows: readonly OwnedTaskRow[],
  scheduleRows: readonly OwnedScheduleRow[],
  organizationIds: ReadonlySet<string> = new Set(),
) => {
  const projects = new Map(projectRows.map(({ project, ownerUserId }) => [project.id, { project, ownerUserId }]))
  for (const { project } of projectRows) {
    if (organizationIds.size > 0 && project.organizationId && !organizationIds.has(project.organizationId)) {
      throw new Error(`Project ${project.id} references missing organization ${project.organizationId}`)
    }
  }
  for (const { task, ownerUserId } of taskRows) {
    const project = projects.get(task.projectId)
    if (!project) throw new Error(`Task ${task.id} references missing project ${task.projectId}`)
    if (project.ownerUserId !== ownerUserId) throw new Error(`Task ${task.id} owner ${ownerUserId} does not match project ${task.projectId} owner ${project.ownerUserId}`)
    if (task.organizationId !== project.project.organizationId) throw new Error(`Task ${task.id} organization does not match project ${task.projectId}`)
  }
  for (const { schedule, ownerUserId } of scheduleRows) {
    const project = projects.get(schedule.projectId)
    if (!project) throw new Error(`Schedule ${schedule.id} references missing project ${schedule.projectId}`)
    if (project.ownerUserId !== ownerUserId) throw new Error(`Schedule ${schedule.id} owner ${ownerUserId} does not match project ${schedule.projectId} owner ${project.ownerUserId}`)
  }
}
