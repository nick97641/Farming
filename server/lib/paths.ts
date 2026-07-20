import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ASSET_TYPE_TO_FOLDER, type AssetType } from '../../shared/schema/project.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

// FARMING_DATA_DIR lets tests (and any future alternate environment) point at
// a throwaway directory instead of the real local data/ folder.
export function getDataRoot(): string {
  return process.env.FARMING_DATA_DIR ? path.resolve(process.env.FARMING_DATA_DIR) : path.join(repoRoot, 'data')
}

export function getProjectsRoot(): string {
  return path.join(getDataRoot(), 'projects')
}

export function getProjectDir(projectId: string): string {
  return path.join(getProjectsRoot(), projectId)
}

export function getProjectFilePath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'project.json')
}

export function getExportsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'exports')
}

export function getAssetDir(projectId: string, assetType: AssetType): string {
  return path.join(getProjectDir(projectId), 'assets', ASSET_TYPE_TO_FOLDER[assetType])
}

export function getAllAssetDirs(projectId: string): string[] {
  return Object.values(ASSET_TYPE_TO_FOLDER).map((folder) => path.join(getProjectDir(projectId), 'assets', folder))
}

export function getImageJobsDir(projectId: string): string {
  return getAssetDir(projectId, 'image')
}

export function getImportedImagesDir(projectId: string): string {
  return path.join(getImageJobsDir(projectId), 'imported')
}

export function getGeneratedImagesDir(projectId: string): string {
  return path.join(getImageJobsDir(projectId), 'generated')
}

export class PathEscapeError extends Error {
  constructor(candidatePath: string) {
    super(`Path "${candidatePath}" escapes its allowed directory`)
    this.name = 'PathEscapeError'
  }
}

// The single choke point every image-file route/helper must go through
// before touching disk. Takes an already-joined candidate path and the
// directory it must stay inside, resolves both lexically, and throws if the
// candidate isn't the base dir itself or a descendant of it — the standard
// path.resolve + prefix-check pattern for rejecting `../` traversal and
// absolute-path escapes. Purely lexical: callers that also need protection
// against a symlink resolving outside baseDir must additionally resolve the
// real path and re-check it against this same function.
export function assertPathWithinDir(baseDir: string, candidatePath: string): string {
  const resolvedBase = path.resolve(baseDir)
  const resolvedCandidate = path.resolve(candidatePath)
  const prefix = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep
  if (resolvedCandidate !== resolvedBase && !resolvedCandidate.startsWith(prefix)) {
    throw new PathEscapeError(candidatePath)
  }
  return resolvedCandidate
}
