import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { deleteImageFile, ImageUploadValidationError, importImageFile, resolveImageFileForServing } from '../lib/image-storage.ts'
import { assertPathWithinDir, getImportedImagesDir, getProjectDir, PathEscapeError } from '../lib/paths.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-image-storage-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

// A minimal valid PNG: the 8-byte signature is enough for our magic-byte sniff.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')])

test('assertPathWithinDir accepts a path inside the base directory', () => {
  const base = '/tmp/project-x/assets/images'
  const target = path.join(base, 'imported', 'file.png')
  assert.equal(assertPathWithinDir(base, target), path.resolve(target))
})

test('assertPathWithinDir accepts the base directory itself', () => {
  const base = '/tmp/project-x/assets/images'
  assert.equal(assertPathWithinDir(base, base), path.resolve(base))
})

test('assertPathWithinDir rejects a relative traversal attempt', () => {
  const base = '/tmp/project-x/assets/images'
  const escaping = path.join(base, '..', '..', '..', 'etc', 'passwd')
  assert.throws(() => assertPathWithinDir(base, escaping), PathEscapeError)
})

test('assertPathWithinDir rejects an absolute path outside the base directory', () => {
  const base = '/tmp/project-x/assets/images'
  assert.throws(() => assertPathWithinDir(base, '/etc/passwd'), PathEscapeError)
})

test('assertPathWithinDir rejects a sibling directory with a shared prefix', () => {
  const base = '/tmp/project-x/assets/images'
  // "images-evil" starts with "images" as a string, but is not inside it.
  assert.throws(() => assertPathWithinDir(base, '/tmp/project-x/assets/images-evil/file.png'), PathEscapeError)
})

test('importImageFile rejects an empty buffer', async () => {
  await assert.rejects(
    () => importImageFile({ projectId: 'img-test-1', jobId: 'job-1', buffer: Buffer.alloc(0) }),
    ImageUploadValidationError,
  )
})

test('importImageFile rejects a buffer that is not a recognized image type', async () => {
  await assert.rejects(
    () => importImageFile({ projectId: 'img-test-1', jobId: 'job-1', buffer: Buffer.from('not an image') }),
    ImageUploadValidationError,
  )
})

test('importImageFile rejects a buffer over the size limit', async () => {
  const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(26 * 1024 * 1024)])
  await assert.rejects(
    () => importImageFile({ projectId: 'img-test-1', jobId: 'job-1', buffer: oversized }),
    ImageUploadValidationError,
  )
})

test('importImageFile accepts a PNG, JPEG, and WEBP signature and writes into imported/', async () => {
  for (const [buffer, ext] of [
    [PNG_BYTES, 'png'],
    [JPEG_BYTES, 'jpg'],
    [WEBP_BYTES, 'webp'],
  ] as const) {
    const output = await importImageFile({ projectId: 'img-test-2', jobId: `job-${ext}`, buffer })
    assert.ok(output.fileName.endsWith(`.${ext}`))
    assert.ok(output.relativePath.startsWith(path.join('assets', 'images', 'imported')))

    const absolutePath = path.join(getProjectDir('img-test-2'), output.relativePath)
    const onDisk = await readFile(absolutePath)
    assert.deepEqual(onDisk, buffer)
  }
})

test('importImageFile never uses the caller-provided name for the on-disk filename', async () => {
  const output = await importImageFile({ projectId: 'img-test-3', jobId: 'job-x', buffer: PNG_BYTES })
  assert.ok(!output.fileName.includes('..'))
  assert.match(
    output.fileName,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i,
  )
  assert.ok(!output.fileName.includes('job-x'))
})

test('resolveImageFileForServing returns the real path for an existing file', async () => {
  const output = await importImageFile({ projectId: 'img-test-4', jobId: 'job-serve', buffer: PNG_BYTES })
  const resolved = await resolveImageFileForServing('img-test-4', output.relativePath)
  assert.ok(resolved)
  assert.ok(resolved!.endsWith(output.fileName))
})

test('resolveImageFileForServing returns null for a missing file rather than throwing', async () => {
  const resolved = await resolveImageFileForServing('img-test-5', 'assets/images/imported/does-not-exist.png')
  assert.equal(resolved, null)
})

test('resolveImageFileForServing rejects a relativePath that escapes the project image directory', async () => {
  await assert.rejects(() => resolveImageFileForServing('img-test-6', '../../../etc/passwd'), PathEscapeError)
})

test('resolveImageFileForServing rejects a symlink that resolves outside the project image directory', async () => {
  const projectId = 'img-test-7'
  const importedDir = getImportedImagesDir(projectId)
  await mkdir(importedDir, { recursive: true })

  const outsideTarget = path.join(dataDir, 'outside-secret.png')
  await writeFile(outsideTarget, PNG_BYTES)

  const linkPath = path.join(importedDir, 'escape-link.png')
  await symlink(outsideTarget, linkPath)

  await assert.rejects(
    () => resolveImageFileForServing(projectId, path.join('assets', 'images', 'imported', 'escape-link.png')),
    PathEscapeError,
  )
})

test('deleteImageFile removes an existing file', async () => {
  const output = await importImageFile({ projectId: 'img-test-8', jobId: 'job-del', buffer: PNG_BYTES })
  assert.equal(await deleteImageFile('img-test-8', output), true)
  const resolved = await resolveImageFileForServing('img-test-8', output.relativePath)
  assert.equal(resolved, null)
})

test('deleteImageFile does not throw when the file is already missing', async () => {
  const missing = {
    fileName: '123e4567-e89b-42d3-a456-426614174000.png',
    relativePath: 'assets/images/imported/123e4567-e89b-42d3-a456-426614174000.png',
    generatedAt: new Date().toISOString(),
  }
  assert.equal(await deleteImageFile('img-test-9', missing), false)
})

test('deleteImageFile refuses a relativePath that escapes the project image directory', async () => {
  const unsafe = {
    fileName: '123e4567-e89b-42d3-a456-426614174000.png',
    relativePath: '../../../etc/passwd',
    generatedAt: new Date().toISOString(),
  }
  assert.equal(await deleteImageFile('img-test-10', unsafe), false)
})

test('deleteImageFile refuses a non-UUID legacy filename even inside imported/', async () => {
  const projectId = 'img-test-11'
  const importedDir = getImportedImagesDir(projectId)
  await mkdir(importedDir, { recursive: true })
  const legacyPath = path.join(importedDir, 'hand-authored.png')
  await writeFile(legacyPath, PNG_BYTES)
  const legacy = {
    fileName: 'hand-authored.png',
    relativePath: path.relative(getProjectDir(projectId), legacyPath),
    generatedAt: new Date().toISOString(),
  }

  assert.equal(await deleteImageFile(projectId, legacy), false)
  assert.deepEqual(await readFile(legacyPath), PNG_BYTES)
})

test('deleteImageFile refuses a symlink even when its name looks app-owned', async () => {
  const projectId = 'img-test-12'
  const importedDir = getImportedImagesDir(projectId)
  await mkdir(importedDir, { recursive: true })
  const target = path.join(importedDir, '123e4567-e89b-42d3-a456-426614174001.png')
  const link = path.join(importedDir, '123e4567-e89b-42d3-a456-426614174002.png')
  await writeFile(target, PNG_BYTES)
  await symlink(target, link)
  const output = {
    fileName: path.basename(link),
    relativePath: path.relative(getProjectDir(projectId), link),
    generatedAt: new Date().toISOString(),
  }

  assert.equal(await deleteImageFile(projectId, output), false)
  assert.deepEqual(await readFile(target), PNG_BYTES)
})
