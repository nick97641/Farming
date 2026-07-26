import { access, constants as fsConstants, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import path from 'node:path'

import { ProjectSchema, createEmptyProject, type Project } from '../../shared/schema/project.ts'
import {
  getAllAssetDirs,
  getExportsDir,
  getGeneratedImagesDir,
  getImportedImagesDir,
  getProjectDir,
  getProjectFilePath,
  getProjectsRoot,
  getReferenceImagesDir,
  getResearchDir,
} from './paths.ts'
import { normalizeLegacyProject } from './project-migration.ts'

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

type WriteProjectOptions = {
  // Only the dedicated image-job deletion route may remove a completed job;
  // ordinary whole-project saves must preserve it byte-for-byte.
  allowDeletedCompletedImageJobId?: string
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
  await mkdir(getResearchDir(projectId), { recursive: true })
  for (const dir of getAllAssetDirs(projectId)) {
    await mkdir(dir, { recursive: true })
  }
  // Existing projects created before this checkpoint don't have these two
  // subfolders — the import route creates them lazily on first use instead of
  // this migration/read path touching disk, matching how this file never
  // otherwise mutates the filesystem outside project creation.
  await mkdir(getImportedImagesDir(projectId), { recursive: true })
  await mkdir(getGeneratedImagesDir(projectId), { recursive: true })
  await mkdir(getReferenceImagesDir(projectId), { recursive: true })
}

export async function writeResearchFile(projectId: string, fileName: string, contents: string): Promise<string> {
  const dir = getResearchDir(projectId)
  await mkdir(dir, { recursive: true })
  const safeName = path.basename(fileName)
  await writeFile(path.join(dir, safeName), contents, 'utf8')
  return path.join('research', safeName)
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

  const result = ProjectSchema.safeParse(normalizeLegacyProject(parsed))
  if (!result.success) {
    throw new ProjectDataCorruptError(projectId, result.error)
  }
  return result.data
}

function preserveCompletedImageJobs(current: Project, incoming: Project, options: WriteProjectOptions): Project {
  const completedById = new Map(
    current.imageJobs.filter((job) => job.status === 'completed' || job.output !== null).map((job) => [job.id, job]),
  )
  if (completedById.size === 0) return incoming

  const incomingIds = new Set(incoming.imageJobs.map((job) => job.id))
  const imageJobs = incoming.imageJobs.map((job) => completedById.get(job.id) ?? job)
  for (const [id, job] of completedById) {
    if (!incomingIds.has(id) && options.allowDeletedCompletedImageJobId !== id) imageJobs.push(job)
  }
  return { ...incoming, imageJobs }
}

export function writeProject(project: Project, options: WriteProjectOptions = {}): Promise<Project> {
  const stamped: Project = { ...project, updatedAt: new Date().toISOString() }
  return enqueue(stamped.id, async () => {
    let protectedProject = stamped
    try {
      const current = await readProject(stamped.id)
      protectedProject = preserveCompletedImageJobs(current, stamped, options)
    } catch (error) {
      if (!(error instanceof ProjectNotFoundError)) throw error
    }
    return atomicWriteProject(protectedProject)
  })
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

// Skips any project directory that fails to read/validate rather than failing
// the whole list, so one corrupt project.json doesn't take down the list view.
export async function listProjects(): Promise<Project[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(getProjectsRoot(), { withFileTypes: true })
  } catch {
    return []
  }

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readProject(entry.name)
        } catch {
          return null
        }
      }),
  )
  return projects.filter((project): project is Project => project !== null)
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!(await pathExists(getProjectFilePath(projectId)))) {
    throw new ProjectNotFoundError(projectId)
  }
  await rm(getProjectDir(projectId), { recursive: true, force: true })
}
