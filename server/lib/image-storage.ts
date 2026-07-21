import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'

import type { FileRef } from '../../shared/schema/project.ts'
import {
  assertPathWithinDir,
  getGeneratedImagesDir,
  getImageJobsDir,
  getImportedImagesDir,
  getProjectDir,
} from './paths.ts'

export class ImageUploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageUploadValidationError'
  }
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

// Sniffed from the file's own bytes, never trusted from a client-supplied
// Content-Type or filename extension.
function detectImageType(buffer: Buffer): { ext: string } | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg' }
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp' }
  }
  return null
}

// Validates and writes an uploaded image into project-owned storage, then
// returns a FileRef pointing at it. The on-disk filename is entirely
// server-generated (a UUID plus the byte-sniffed extension), never derived from the client's
// original filename — so there is no traversal or extension-spoofing surface
// on the write side at all; the client's name is preserved only as display
// metadata by the caller.
export async function importImageFile(input: { projectId: string; jobId: string; buffer: Buffer }): Promise<FileRef> {
  const { projectId, buffer } = input

  if (buffer.length === 0) {
    throw new ImageUploadValidationError('Uploaded file is empty')
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageUploadValidationError('Uploaded file exceeds the 25MB limit')
  }
  const detected = detectImageType(buffer)
  if (!detected) {
    throw new ImageUploadValidationError('Uploaded file is not a recognized PNG, JPEG, or WEBP image')
  }

  const dir = getImportedImagesDir(projectId)
  await mkdir(dir, { recursive: true })

  const fileName = `${randomUUID()}.${detected.ext}`
  const destPath = assertPathWithinDir(getImageJobsDir(projectId), path.join(dir, fileName))
  const tempPath = path.join(dir, `.tmp-${randomBytes(6).toString('hex')}`)

  await writeFile(tempPath, buffer)
  try {
    await rename(tempPath, destPath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  return {
    fileName,
    relativePath: path.relative(getProjectDir(projectId), destPath),
    generatedAt: new Date().toISOString(),
  }
}

// Resolves a stored relativePath to a real, on-disk absolute path, verifying
// containment both lexically (against `../` traversal) and after symlink
// resolution (against a symlink that points outside the allowed directory).
// Returns null if the file doesn't exist — callers treat that as "missing",
// never as an error.
async function resolveExistingImagePath(projectId: string, relativePath: string): Promise<string | null> {
  const imageJobsDir = getImageJobsDir(projectId)
  const lexicallySafe = assertPathWithinDir(imageJobsDir, path.join(getProjectDir(projectId), relativePath))

  let real: string
  try {
    real = await realpath(lexicallySafe)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  // The base directory itself may be reached through a symlink (e.g. macOS's
  // /tmp -> /private/tmp), so it needs the same realpath resolution before
  // comparing — otherwise a legitimate file fails containment purely because
  // one side of the comparison was resolved and the other wasn't.
  const realBaseDir = await realpath(imageJobsDir).catch(() => imageJobsDir)
  return assertPathWithinDir(realBaseDir, real)
}

export async function resolveImageFileForServing(projectId: string, relativePath: string): Promise<string | null> {
  return resolveExistingImagePath(projectId, relativePath)
}

const OWNED_IMAGE_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/i

// Returns a canonical key only for files this checkpoint can prove it owns:
// the FileRef name must match the basename, use our UUID naming convention,
// and live directly inside imported/ or generated/. This deliberately does
// not grandfather older or hand-authored names into deletion eligibility.
export function getOwnedImageFileKey(projectId: string, output: FileRef): string | null {
  const projectDir = getProjectDir(projectId)
  let candidate: string
  try {
    candidate = assertPathWithinDir(getImageJobsDir(projectId), path.join(projectDir, output.relativePath))
  } catch {
    return null
  }

  const parent = path.dirname(candidate)
  const allowedParents = [getImportedImagesDir(projectId), getGeneratedImagesDir(projectId)].map((dir) => path.resolve(dir))
  if (!allowedParents.includes(parent)) return null
  if (path.basename(candidate) !== output.fileName) return null
  if (!OWNED_IMAGE_FILE_NAME.test(output.fileName)) return null
  return candidate
}

// Deletes only a proven app-owned regular file. Missing, unsafe, legacy-named,
// and symlink entries are intentionally left alone; job deletion can proceed
// without turning untrusted project metadata into an arbitrary unlink.
export async function deleteImageFile(projectId: string, output: FileRef): Promise<boolean> {
  const candidate = getOwnedImageFileKey(projectId, output)
  if (!candidate) return false

  let stat
  try {
    stat = await lstat(candidate)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return false

  try {
    await unlink(candidate)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
