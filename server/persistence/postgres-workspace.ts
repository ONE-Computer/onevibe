import postgres, { type Sql, type TransactionSql } from 'postgres'
import type { Project, WorkspaceFile, WorkspaceVersion } from '../types.js'
import { OptimisticConflictError, RecordNotFoundError } from './errors.js'

export type PostgresWorkspaceFileRecord = WorkspaceFile & { content: Buffer; sha256: string }
export type PostgresWorkspaceConfig = { readonly maxConnections?: number; readonly connectTimeoutSeconds?: number }

type WorkspaceFileRow = { path: string; content: Buffer; size: number; sha256: string; updated_at: Date }
type WorkspaceVersionRow = { id: string; task_id: string; label: string; created_at: Date; file_count: number; evidence_hash: string }
type WorkspaceSnapshotFileRow = { path: string; content: Buffer; size: number; sha256: string }
type WorkspaceSnapshotFileWithVersionRow = WorkspaceSnapshotFileRow & { created_at: Date }
const projectFilesJson = (project: Project) => JSON.stringify({ files: project.files, fileVersions: project.fileVersions ?? {} })

const versionFromRow = (row: WorkspaceVersionRow): WorkspaceVersion => ({
  id: row.id, taskId: row.task_id, label: row.label, createdAt: row.created_at.toISOString(), fileCount: row.file_count, evidenceHash: row.evidence_hash,
})

const fileFromRow = (row: WorkspaceFileRow): PostgresWorkspaceFileRecord => ({
  path: row.path, content: Buffer.from(row.content), size: row.size, sha256: row.sha256, updatedAt: row.updated_at.toISOString(),
})

const requireTask = async (sql: Sql<Record<string, never>> | TransactionSql<Record<string, never>>, taskId: string, ownerUserId: string) => {
  const rows = await sql<{ id: string }[]>`SELECT id FROM task WHERE id = ${taskId} AND owner_user_id = ${ownerUserId} FOR UPDATE`
  if (!rows[0]) throw new RecordNotFoundError(`Task ${taskId} does not exist for this owner`)
}

const requireProject = async (sql: Sql<Record<string, never>> | TransactionSql<Record<string, never>>, projectId: string, ownerUserId: string) => {
  const rows = await sql<{ id: string }[]>`SELECT id FROM project WHERE id = ${projectId} AND owner_user_id = ${ownerUserId} FOR UPDATE`
  if (!rows[0]) throw new RecordNotFoundError(`Project ${projectId} does not exist for this owner`)
}

export class PostgresWorkspaceRepository {
  readonly #sql: Sql<Record<string, never>>

  constructor(sql: Sql<Record<string, never>>) { this.#sql = sql }

  async listFiles(taskId: string, ownerUserId: string): Promise<PostgresWorkspaceFileRecord[]> {
    await requireTask(this.#sql, taskId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`SELECT wf.path, wf.content, wf.size, wf.sha256, wf.updated_at FROM workspace_file wf WHERE wf.task_id = ${taskId} ORDER BY wf.path ASC`
    return rows.map(fileFromRow)
  }

  async readFile(taskId: string, ownerUserId: string, relativePath: string): Promise<PostgresWorkspaceFileRecord> {
    await requireTask(this.#sql, taskId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`SELECT path, content, size, sha256, updated_at FROM workspace_file WHERE task_id = ${taskId} AND path = ${relativePath}`
    if (!rows[0]) throw new RecordNotFoundError(`Workspace file ${relativePath} does not exist`)
    return fileFromRow(rows[0])
  }

  async putFile(taskId: string, ownerUserId: string, relativePath: string, content: Uint8Array, sha256: string, updatedAt = new Date()): Promise<PostgresWorkspaceFileRecord> {
    const bytes = Buffer.from(content)
    await requireTask(this.#sql, taskId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`
      INSERT INTO workspace_file (task_id, path, content, size, sha256, updated_at)
      VALUES (${taskId}, ${relativePath}, ${bytes}, ${bytes.byteLength}, ${sha256}, ${updatedAt})
      ON CONFLICT (task_id, path) DO UPDATE SET content = EXCLUDED.content, size = EXCLUDED.size, sha256 = EXCLUDED.sha256, updated_at = EXCLUDED.updated_at
      RETURNING path, content, size, sha256, updated_at
    `
    const row = rows[0]
    if (!row) throw new OptimisticConflictError(`Workspace file ${relativePath} was not persisted`)
    return fileFromRow(row)
  }

  async deleteFile(taskId: string, ownerUserId: string, relativePath: string): Promise<boolean> {
    await requireTask(this.#sql, taskId, ownerUserId)
    const result = await this.#sql`DELETE FROM workspace_file WHERE task_id = ${taskId} AND path = ${relativePath}`
    return result.count === 1
  }

  async createVersion(taskId: string, ownerUserId: string, version: WorkspaceVersion, files: PostgresWorkspaceFileRecord[]): Promise<WorkspaceVersion> {
    return this.#sql.begin(async (tx) => {
      await requireTask(tx, taskId, ownerUserId)
      await tx`INSERT INTO workspace_version (id, task_id, label, file_count, evidence_hash, created_at) VALUES (${version.id}, ${taskId}, ${version.label}, ${version.fileCount}, ${version.evidenceHash}, ${new Date(version.createdAt)})`
      for (const file of files) {
        await tx`INSERT INTO workspace_version_file (version_id, path, content, size, sha256) VALUES (${version.id}, ${file.path}, ${file.content}, ${file.size}, ${file.sha256})`
      }
      return version
    })
  }

  async listVersions(taskId: string, ownerUserId: string): Promise<WorkspaceVersion[]> {
    await requireTask(this.#sql, taskId, ownerUserId)
    const rows = await this.#sql<WorkspaceVersionRow[]>`SELECT wv.id, wv.task_id, wv.label, wv.created_at, wv.file_count, wv.evidence_hash FROM workspace_version wv INNER JOIN task t ON t.id = wv.task_id WHERE wv.task_id = ${taskId} AND t.owner_user_id = ${ownerUserId} ORDER BY wv.created_at DESC`
    return rows.map(versionFromRow)
  }

  async listVersionFiles(taskId: string, ownerUserId: string, versionId: string): Promise<PostgresWorkspaceFileRecord[]> {
    await requireTask(this.#sql, taskId, ownerUserId)
    const rows = await this.#sql<WorkspaceSnapshotFileWithVersionRow[]>`
      SELECT wvf.path, wvf.content, wvf.size, wvf.sha256, wv.created_at
      FROM workspace_version_file wvf
      INNER JOIN workspace_version wv ON wv.id = wvf.version_id
      WHERE wv.id = ${versionId} AND wv.task_id = ${taskId}
      ORDER BY wvf.path ASC
    `
    if (!rows.length) {
      const versions = await this.#sql<{ id: string }[]>`SELECT id FROM workspace_version WHERE id = ${versionId} AND task_id = ${taskId}`
      if (!versions[0]) throw new RecordNotFoundError(`Workspace version ${versionId} does not exist`)
    }
    return rows.map((row) => fileFromRow({ ...row, updated_at: row.created_at }))
  }

  async restoreVersion(taskId: string, ownerUserId: string, versionId: string): Promise<WorkspaceVersion> {
    return this.#sql.begin(async (tx) => {
      await requireTask(tx, taskId, ownerUserId)
      const versions = await tx<WorkspaceVersionRow[]>`SELECT wv.id, wv.task_id, wv.label, wv.created_at, wv.file_count, wv.evidence_hash FROM workspace_version wv WHERE wv.id = ${versionId} AND wv.task_id = ${taskId}`
      const version = versions[0]
      if (!version) throw new RecordNotFoundError(`Workspace version ${versionId} does not exist`)
      const files = await tx<WorkspaceSnapshotFileRow[]>`SELECT path, content, size, sha256 FROM workspace_version_file WHERE version_id = ${versionId} ORDER BY path ASC`
      await tx`DELETE FROM workspace_file WHERE task_id = ${taskId}`
      for (const file of files) await tx`INSERT INTO workspace_file (task_id, path, content, size, sha256, updated_at) VALUES (${taskId}, ${file.path}, ${file.content}, ${file.size}, ${file.sha256}, ${new Date()})`
      return versionFromRow(version)
    })
  }

  async copyFiles(sourceTaskId: string, targetTaskId: string, ownerUserId: string): Promise<number> {
    return this.#sql.begin(async (tx) => {
      await requireTask(tx, sourceTaskId, ownerUserId)
      await requireTask(tx, targetTaskId, ownerUserId)
      const files = await tx<WorkspaceFileRow[]>`SELECT path, content, size, sha256, updated_at FROM workspace_file WHERE task_id = ${sourceTaskId} ORDER BY path ASC`
      await tx`DELETE FROM workspace_file WHERE task_id = ${targetTaskId}`
      for (const file of files) await tx`INSERT INTO workspace_file (task_id, path, content, size, sha256, updated_at) VALUES (${targetTaskId}, ${file.path}, ${file.content}, ${file.size}, ${file.sha256}, ${file.updated_at})`
      return files.length
    })
  }

  async listProjectFiles(projectId: string, ownerUserId: string): Promise<PostgresWorkspaceFileRecord[]> {
    await requireProject(this.#sql, projectId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`SELECT path, content, size, sha256, updated_at FROM project_file WHERE project_id = ${projectId} ORDER BY path ASC`
    return rows.map(fileFromRow)
  }

  async readProjectFile(projectId: string, ownerUserId: string, relativePath: string): Promise<PostgresWorkspaceFileRecord> {
    await requireProject(this.#sql, projectId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`SELECT path, content, size, sha256, updated_at FROM project_file WHERE project_id = ${projectId} AND path = ${relativePath}`
    if (!rows[0]) throw new RecordNotFoundError(`Project file ${relativePath} does not exist`)
    return fileFromRow(rows[0])
  }

  async putProjectFile(projectId: string, ownerUserId: string, relativePath: string, content: Uint8Array, sha256: string, updatedAt = new Date()): Promise<PostgresWorkspaceFileRecord> {
    const bytes = Buffer.from(content)
    await requireProject(this.#sql, projectId, ownerUserId)
    const rows = await this.#sql<WorkspaceFileRow[]>`
      INSERT INTO project_file (project_id, path, content, size, sha256, updated_at)
      VALUES (${projectId}, ${relativePath}, ${bytes}, ${bytes.byteLength}, ${sha256}, ${updatedAt})
      ON CONFLICT (project_id, path) DO UPDATE SET content = EXCLUDED.content, size = EXCLUDED.size, sha256 = EXCLUDED.sha256, updated_at = EXCLUDED.updated_at
      RETURNING path, content, size, sha256, updated_at
    `
    const row = rows[0]
    if (!row) throw new OptimisticConflictError(`Project file ${relativePath} was not persisted`)
    return fileFromRow(row)
  }

  async putProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, content: Uint8Array, sha256: string, nextProject: Project): Promise<PostgresWorkspaceFileRecord> {
    const bytes = Buffer.from(content)
    const ownerUserId = project.ownerUserId
    if (!ownerUserId) throw new Error('Postgres project files require an owner')
    return this.#sql.begin(async (tx) => {
      await requireProject(tx, project.id, ownerUserId)
      const rows = await tx<WorkspaceFileRow[]>`
        INSERT INTO project_file (project_id, path, content, size, sha256, updated_at)
        VALUES (${project.id}, ${relativePath}, ${bytes}, ${bytes.byteLength}, ${sha256}, ${new Date(nextProject.updatedAt)})
        ON CONFLICT (project_id, path) DO UPDATE SET content = EXCLUDED.content, size = EXCLUDED.size, sha256 = EXCLUDED.sha256, updated_at = EXCLUDED.updated_at
        RETURNING path, content, size, sha256, updated_at
      `
      const result = await tx`
        UPDATE project SET files_json = ${projectFilesJson(nextProject)}::jsonb, updated_at = ${new Date(nextProject.updatedAt)}
        WHERE id = ${project.id} AND owner_user_id = ${ownerUserId} AND updated_at = ${new Date(expectedUpdatedAt)}
      `
      if (result.count !== 1) throw new OptimisticConflictError(`Project ${project.id} was modified concurrently`)
      if (!rows[0]) throw new OptimisticConflictError(`Project file ${relativePath} was not persisted`)
      return fileFromRow(rows[0])
    })
  }

  async updateProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, content: Uint8Array, sha256: string, nextProject: Project): Promise<PostgresWorkspaceFileRecord> {
    return this.putProjectFileAndMetadata(project, expectedUpdatedAt, relativePath, content, sha256, nextProject)
  }

  async deleteProjectFile(projectId: string, ownerUserId: string, relativePath: string): Promise<boolean> {
    await requireProject(this.#sql, projectId, ownerUserId)
    const result = await this.#sql`DELETE FROM project_file WHERE project_id = ${projectId} AND path = ${relativePath}`
    return result.count === 1
  }

  async deleteProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, nextProject: Project): Promise<boolean> {
    const ownerUserId = project.ownerUserId
    if (!ownerUserId) throw new Error('Postgres project files require an owner')
    return this.#sql.begin(async (tx) => {
      await requireProject(tx, project.id, ownerUserId)
      const result = await tx`DELETE FROM project_file WHERE project_id = ${project.id} AND path = ${relativePath}`
      const metadata = await tx`
        UPDATE project SET files_json = ${projectFilesJson(nextProject)}::jsonb, updated_at = ${new Date(nextProject.updatedAt)}
        WHERE id = ${project.id} AND owner_user_id = ${ownerUserId} AND updated_at = ${new Date(expectedUpdatedAt)}
      `
      if (metadata.count !== 1) throw new OptimisticConflictError(`Project ${project.id} was modified concurrently`)
      return result.count === 1
    })
  }
}

export const createPostgresWorkspaceRepository = (databaseUrl: string, config: PostgresWorkspaceConfig = {}) => {
  const sql = postgres(databaseUrl, { max: config.maxConnections ?? 4, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false })
  return { repository: new PostgresWorkspaceRepository(sql as Sql<Record<string, never>>), close: () => sql.end({ timeout: 5 }) }
}
