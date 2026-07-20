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
