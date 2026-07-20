import { access, constants as fsConstants, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { ProjectSchema, createEmptyProject, type Project } from '../../shared/schema/project.ts'
import { getAllAssetDirs, getExportsDir, getProjectDir, getProjectFilePath } from './paths.ts'

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project "${projectId}" was not found`)
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectAlreadyExistsError extends Error {
  constructor(projectId: string) {
    super(`Project "${projectId}" already exists`)
    this.name = 'ProjectAlreadyExistsError'
  }
}

export class ProjectDataCorruptError extends Error {
  constructor(projectId: string, cause: unknown) {
    super(`Project "${projectId}" has invalid or corrupt data: ${String(cause)}`)
    this.name = 'ProjectDataCorruptError'
  }
}

// Serializes writes per project id so two concurrent saves can never interleave
// their writes to the same project.json.
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(projectId) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(
    projectId,
    next.catch(() => undefined),
  )
  return next
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function scaffoldProjectFolders(projectId: string): Promise<void> {
  await mkdir(getProjectDir(projectId), { recursive: true })
  await mkdir(getExportsDir(projectId), { recursive: true })
  for (const dir of getAllAssetDirs(projectId)) {
    await mkdir(dir, { recursive: true })
  }
}

// Validates before writing anything to disk, then writes to a temp file in the
// same directory and renames it into place. The rename is atomic on the same
// filesystem, so a failure here never leaves project.json partially written.
async function atomicWriteProject(project: Project): Promise<Project> {
  const validated = ProjectSchema.parse(project)
  const filePath = getProjectFilePath(validated.id)
  const dir = path.dirname(filePath)
  const tempPath = path.join(dir, `.project.json.tmp-${randomBytes(6).toString('hex')}`)

  const contents = JSON.stringify(validated, null, 2)
  await writeFile(tempPath, contents, 'utf8')
  try {
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
  return validated
}

export async function projectExists(projectId: string): Promise<boolean> {
  return pathExists(getProjectFilePath(projectId))
}

export async function readProject(projectId: string): Promise<Project> {
  const filePath = getProjectFilePath(projectId)

  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    throw new ProjectNotFoundError(projectId)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new ProjectDataCorruptError(projectId, error)
  }

  const result = ProjectSchema.safeParse(parsed)
  if (!result.success) {
    throw new ProjectDataCorruptError(projectId, result.error)
  }
  return result.data
}

export function writeProject(project: Project): Promise<Project> {
  const stamped: Project = { ...project, updatedAt: new Date().toISOString() }
  return enqueue(stamped.id, () => atomicWriteProject(stamped))
}

export async function createProject(input: { id: string; title: string; topic: string }): Promise<Project> {
  return enqueue(input.id, async () => {
    if (await pathExists(getProjectFilePath(input.id))) {
      throw new ProjectAlreadyExistsError(input.id)
    }
    await scaffoldProjectFolders(input.id)
    return atomicWriteProject(createEmptyProject(input))
  })
}
